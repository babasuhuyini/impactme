// The sync engine. IndexedDB on this device stays the source the app reads
// from; the account (Supabase) is a sync target.
//
// A run pushes this device's queued changes, then pulls everything changed in
// the account since the last pull. Conflicts: the change made last wins, per
// record, by the time it was made on its device (the server enforces this too).
//
// Runs: when the app opens (signed in), when it becomes visible, when the
// connection comes back, every 3 minutes while visible, and 5 seconds after
// the last local change. Only one tab syncs at a time.

import { supabase } from '../lib/supabase.js'
import { createBackup, normalizeBackupData } from './backup.js'
import { getAccount, setJournalConsent, setSyncState, signOut, subscribeAccount } from './account.js'
import { db } from './db.js'
import { normalizeSettings } from './models.js'
import {
  applyRemote,
  applyRemoteSettings,
  clearAccountData,
  clearLocalRecords,
  flush,
  getSnapshot,
  journal,
  onSyncQueued,
  projects,
  restoreData,
  tasks,
} from './store.js'
import { SyncError, supabaseTransport } from './syncTransport.js'
import {
  JOURNAL_KEY,
  LAST_SYNC_KEY,
  LINK_KEY,
  PAUSED_KEY,
  SNAPSHOT_KEY,
  SYNC_TABLES,
  cursorKey,
  pickSyncedSettings,
  queueChanges,
} from './syncQueue.js'

const PUSH_BATCH = 200
const PULL_PAGE = 500
// Pulls re-read the last 5 seconds, which covers changes that were committed
// on the server slightly out of order.
const OVERLAP = 5000
const DEBOUNCE = 5000
const EVERY = 3 * 60 * 1000

const kvGet = async (key) => (await db.kv.get(key))?.value
const kvSet = (key, value) => db.kv.put({ key, value })
const SYNC_KV_KEYS = [LINK_KEY, JOURNAL_KEY, LAST_SYNC_KEY, PAUSED_KEY, ...[...SYNC_TABLES, 'settings'].map(cursorKey)]

// Server timestamps are ISO strings with microseconds; compare without losing them.
const later = (a, b) => {
  const diff = Date.parse(a) - Date.parse(b)
  return diff ? diff > 0 : a > b
}
const minus = (iso, ms) => new Date(Date.parse(iso) - ms).toISOString()

let transport = null
export const setTransport = (t) => (transport = t)

/* Push ------------------------------------------------------------------- */

// The server refuses records over 1 MB (supabase/migrations/0002). Larger ones
// are held back here, with some margin because the server measures jsonb text,
// so one oversized record can't block everything else in the queue.
export const MAX_RECORD_BYTES = 900_000
const sizeOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length

// Sends the queue in batches. An entry is removed only if no newer change to
// that record arrived while it was being sent. Returns { sent, held }: held
// records are too large to sync and stay queued.
export async function pushQueue(t = transport) {
  let sent = 0
  const held = new Set()
  for (let round = 0; round < 50; round++) {
    const batch = await db.transaction('r', [db.syncQueue, db.kv, ...SYNC_TABLES.map((n) => db[n])], async () => {
      const entries = await db.syncQueue.filter((e) => !held.has(e.key)).limit(PUSH_BATCH).toArray()
      const records = {}
      for (const table of SYNC_TABLES) {
        const ids = entries.filter((e) => e.table === table).map((e) => e.id)
        records[table] = ids.length ? await db[table].bulkGet(ids) : []
      }
      return {
        entries,
        records,
        journal: (await db.kv.get(JOURNAL_KEY))?.value === true,
        settings: (await db.kv.get('settings'))?.value,
      }
    })
    if (!batch.entries.length) break

    const handled = []
    for (const table of SYNC_TABLES) {
      const list = batch.entries.filter((e) => e.table === table)
      if (!list.length) continue
      // Journal entries never leave the device without consent.
      if (table === 'journal' && !batch.journal) {
        handled.push(...list)
        continue
      }
      const rows = []
      list.forEach((entry, i) => {
        const record = batch.records[table][i]
        if (entry.op === 'put' && record && sizeOf(record) > MAX_RECORD_BYTES) {
          held.add(entry.key)
          return
        }
        rows.push(
          entry.op === 'put' && record
            ? { id: entry.id, data: record, deleted: false, changed_at: entry.changedAt }
            : { id: entry.id, data: null, deleted: true, changed_at: entry.changedAt }
        )
        handled.push(entry)
      })
      if (rows.length) await t.push(table, rows)
    }
    const settingsEntry = batch.entries.find((e) => e.table === 'settings')
    if (settingsEntry) {
      await t.pushSettings({
        data: pickSyncedSettings(normalizeSettings(batch.settings)),
        changed_at: settingsEntry.changedAt,
      })
      handled.push(settingsEntry)
    }

    await db.transaction('rw', db.syncQueue, async () => {
      const now = await db.syncQueue.bulkGet(handled.map((e) => e.key))
      const unchanged = handled.filter((e, i) => now[i]?.changedAt === e.changedAt).map((e) => e.key)
      await db.syncQueue.bulkDelete(unchanged)
    })
    sent += handled.length
  }
  return { sent, held: held.size }
}

/* Pull ------------------------------------------------------------------- */

// Applies everything changed in the account since the last pull. Journal
// entries are only pulled with consent. Returns how many records changed here.
export async function pullAll(t = transport) {
  const journalSync = (await kvGet(JOURNAL_KEY)) === true
  let changed = 0
  for (const table of SYNC_TABLES) {
    if (table === 'journal' && !journalSync) continue
    let cursor = await kvGet(cursorKey(table))
    let since = cursor ? minus(cursor, OVERLAP) : null
    for (;;) {
      const rows = await t.pull(table, since, PULL_PAGE)
      if (!rows.length) break
      changed += await applyRemote(table, rows)
      const last = rows[rows.length - 1].server_updated_at
      if (!cursor || later(last, cursor)) {
        cursor = last
        await kvSet(cursorKey(table), cursor)
      }
      if (rows.length < PULL_PAGE) break
      since = last
    }
  }
  const settingsCursor = await kvGet(cursorKey('settings'))
  const row = await t.pullSettings(settingsCursor ? minus(settingsCursor, OVERLAP) : null)
  if (row) {
    if (await applyRemoteSettings(row)) changed++
    if (!settingsCursor || later(row.server_updated_at, settingsCursor)) {
      await kvSet(cursorKey('settings'), row.server_updated_at)
    }
  }
  return changed
}

/* Linking this device to an account -------------------------------------- */

// Links this device to `userId` with a fresh start: no queue, no cursors.
export async function linkDevice(userId, journalSync) {
  await db.transaction('rw', db.kv, db.syncQueue, async () => {
    await db.syncQueue.clear()
    await db.kv.bulkDelete(SYNC_KV_KEYS)
    await db.kv.bulkPut([
      { key: LINK_KEY, value: userId },
      { key: JOURNAL_KEY, value: Boolean(journalSync) },
    ])
  })
}

// Queues every record and the settings on this device, so they go up.
async function queueEverything() {
  await flush()
  await db.transaction('rw', [...SYNC_TABLES.map((n) => db[n]), db.kv, db.syncQueue], async () => {
    const changes = [{ table: 'settings', id: 'settings', op: 'put' }]
    for (const table of SYNC_TABLES) {
      const ids = await db[table].toCollection().primaryKeys()
      changes.push(...ids.map((id) => ({ table, id, op: 'put' })))
    }
    await queueChanges(db, changes)
  })
}

// "Add to My Account": link, queue everything here, then sync.
export async function addDeviceData(userId, journalSync) {
  await linkDevice(userId, journalSync)
  await queueEverything()
}

// "Not Now": keep this device's data aside as a snapshot (same shape as a
// backup), empty the device, link it. The account's data is then pulled.
export async function keepDeviceDataAside(userId, journalSync) {
  await flush()
  await kvSet(SNAPSHOT_KEY, createBackup(getSnapshot()))
  await clearLocalRecords()
  await linkDevice(userId, journalSync)
}

// "Add this device's earlier data": merges the snapshot, newest copy of each
// record wins (as a backup restore in merge mode), and queues it.
export async function addEarlierData() {
  const snapshot = await kvGet(SNAPSHOT_KEY)
  if (!snapshot?.data) return { added: 0, updated: 0 }
  const { data } = normalizeBackupData(snapshot.data)
  const result = await restoreData({ ...data, settings: null }, 'merge')
  await db.kv.delete(SNAPSHOT_KEY)
  return result
}

/* Journal consent -------------------------------------------------------- */

// Turning journal sync on queues every journal entry; turning it off removes
// the journal from the account (entries stay on this device) and stops syncing it.
export async function applyJournalSync(on, t = transport) {
  if (on) {
    await kvSet(JOURNAL_KEY, true)
    await db.kv.delete(cursorKey('journal'))
    await flush()
    await db.transaction('rw', db.journal, db.kv, db.syncQueue, async () => {
      const ids = await db.journal.toCollection().primaryKeys()
      await queueChanges(db, ids.map((id) => ({ table: 'journal', id, op: 'put' })))
    })
    return
  }
  await t.deleteJournal()
  await db.transaction('rw', db.kv, db.syncQueue, async () => {
    await db.kv.put({ key: JOURNAL_KEY, value: false })
    await db.kv.delete(cursorKey('journal'))
    await db.syncQueue.where('table').equals('journal').delete()
  })
}

/* Unlinking -------------------------------------------------------------- */

// Stops syncing this device with the account but keeps its data (after the
// account is deleted, when "Also remove data from this device" is off).
export async function unlinkDevice() {
  await db.transaction('rw', db.kv, db.syncQueue, async () => {
    await db.syncQueue.clear()
    await db.kv.bulkDelete(SYNC_KV_KEYS)
  })
}

/* Sign out --------------------------------------------------------------- */

// Removes everything of the account from this device.
export async function clearDeviceForSignOut() {
  await clearAccountData(SYNC_KV_KEYS)
}

/* Running ---------------------------------------------------------------- */

let running = null
let again = false
let timer = null
let preparedFor = null
let signingOut = false

const canSync = (a = getAccount()) =>
  a.status === 'signed-in' && !a.recovery && a.consent.status === 'done' && a.device === 'linked' && !a.paused

// Runs a sync now, or once more after the one in progress.
export function syncNow() {
  clearTimeout(timer)
  if (running) {
    again = true
    return running
  }
  running = runOnce().finally(() => {
    running = null
    if (again) {
      again = false
      syncNow()
    }
  })
  return running
}

function schedule(delay = DEBOUNCE) {
  clearTimeout(timer)
  timer = setTimeout(syncNow, delay)
}

async function runOnce() {
  if (!transport || !canSync()) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncState({ syncStatus: 'offline' })
    return
  }
  const work = async () => {
    setSyncState({ syncStatus: 'syncing' })
    try {
      await flush()
      let held = 0
      await withAuthRetry(async () => {
        held = (await pushQueue()).held
        await pullAll()
      })
      const at = Date.now()
      await kvSet(LAST_SYNC_KEY, at)
      setSyncState(
        held
          ? {
              syncStatus: 'error',
              lastSyncedAt: at,
              syncError: `${held === 1 ? '1 item is' : `${held} items are`} too large to sync. Shorten ${held === 1 ? 'it' : 'them'} to sync again. Everything else is synced.`,
            }
          : { syncStatus: 'idle', lastSyncedAt: at, syncError: null }
      )
    } catch (error) {
      reportSyncError(error)
    }
  }
  // Only one tab syncs at a time; the others get the changes through the store.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('impactme-sync', { ifAvailable: true }, (lock) => lock && work())
  } else {
    await work()
  }
}

async function withAuthRetry(fn) {
  try {
    await fn()
  } catch (error) {
    if (!(error instanceof SyncError) || error.kind !== 'auth' || !(await transport.refresh?.())) throw error
    await fn()
  }
}

function reportSyncError(error) {
  const kind = error instanceof SyncError ? error.kind : 'server'
  console.warn('Sync failed', kind, error?.code ?? error?.name ?? '')
  if (kind === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncState({ syncStatus: 'offline' })
    return
  }
  setSyncState({
    syncStatus: 'error',
    syncError:
      kind === 'auth'
        ? 'Sign in again to keep syncing.'
        : kind === 'network'
          ? 'Couldn’t reach your account. ImpactMe will try again shortly.'
          : 'Sync didn’t finish. ImpactMe will try again shortly.',
  })
}

// Decides what this device needs once someone is signed in and has consented.
async function prepareDevice(account) {
  const { id } = account.user
  const linked = await kvGet(LINK_KEY)
  if (linked === id) {
    await kvSet(JOURNAL_KEY, account.consent.journal)
    setSyncState({
      device: 'linked',
      reauth: false,
      paused: (await kvGet(PAUSED_KEY)) === true,
      lastSyncedAt: (await kvGet(LAST_SYNC_KEY)) ?? null,
      earlierData: Boolean(await kvGet(SNAPSHOT_KEY)),
    })
    return syncNow()
  }
  // Never linked, or linked to someone else: never merge automatically.
  await flush()
  const counts = { tasks: tasks.all().length, projects: projects.all().length, journal: journal.all().length }
  if (!counts.tasks && !counts.projects && !counts.journal) {
    await linkDevice(id, account.consent.journal)
    setSyncState({ device: 'linked', reauth: false, lastSyncedAt: null, earlierData: Boolean(await kvGet(SNAPSHOT_KEY)) })
    return syncNow()
  }
  setSyncState({ device: 'choose', counts })
}

// The answer on "Bring this device's data with you?".
export async function chooseDeviceData(add) {
  const account = getAccount()
  if (account.status !== 'signed-in') return
  const { id } = account.user
  if (add) await addDeviceData(id, account.consent.journal)
  else await keepDeviceDataAside(id, account.consent.journal)
  setSyncState({ device: 'linked', counts: null, reauth: false, lastSyncedAt: null, earlierData: !add })
  return syncNow()
}

export async function addEarlierDataNow() {
  const result = await addEarlierData()
  setSyncState({ earlierData: false })
  syncNow()
  return result
}

// Turns journal sync on or off from Settings: records consent, then applies it.
export async function setJournalSync(on) {
  const { error } = await setJournalConsent(on)
  if (error) return { error }
  try {
    await applyJournalSync(on)
  } catch (e) {
    reportSyncError(e)
    return { error: 'Couldn’t update your account. Check your connection and try again.' }
  }
  if (on) syncNow()
  return { error: null }
}

// "Sync this device": off pauses syncing here without signing out. Changes
// keep being recorded and go up when it's switched back on.
export async function setDeviceSync(on) {
  await kvSet(PAUSED_KEY, !on)
  setSyncState({ paused: !on, syncStatus: 'idle', syncError: null })
  if (on) syncNow()
}

// Deletes the account (the delete-account Edge Function removes the user and,
// by cascade, every row of theirs), then signs out here. With `removeLocal`
// this device is cleared as on sign-out; otherwise its data stays, unlinked.
export async function deleteAccount({ removeLocal = false } = {}) {
  if (globalThis.navigator?.onLine === false) {
    return { error: 'You’re offline. Connect to the internet to delete your account.' }
  }
  try {
    await withAuthRetry(() => transport.deleteAccount())
  } catch (error) {
    console.warn('Delete account failed', error?.kind ?? error?.name ?? '', error?.code ?? '')
    const kind = error instanceof SyncError ? error.kind : 'server'
    if (kind === 'reauth') {
      return { error: 'For your security, confirm it’s you again, then delete your account.', reauth: true }
    }
    return {
      error:
        kind === 'network'
          ? 'Couldn’t reach your account. Check your connection and try again.'
          : kind === 'auth'
            ? 'Your sign-in has expired. Sign in again, then delete your account.'
            : 'Your account couldn’t be deleted. Nothing was removed. Please try again later.',
    }
  }
  signingOut = true
  try {
    await signOut()
    if (removeLocal) await clearDeviceForSignOut()
    else await unlinkDevice()
    setSyncState({ device: 'unknown', counts: null, reauth: false, paused: false, earlierData: false, lastSyncedAt: null, syncStatus: 'idle', syncError: null })
  } finally {
    signingOut = false
  }
  return { error: null }
}

// Sign out of this device. Without `force`, first pushes what it can and
// reports anything that would be lost: unsynced changes, and journal entries
// that only exist here (no journal consent). Then signs out and removes the
// account's data from this device.
export async function signOutDevice({ force = false } = {}) {
  const account = getAccount()
  if (!force) {
    if (canSync(account) && globalThis.navigator?.onLine !== false) {
      try {
        await flush()
        await pushQueue()
      } catch (error) {
        console.warn('Final sync before sign-out failed', error?.kind ?? error?.name ?? '')
      }
    }
    await flush()
    const pending = await db.syncQueue.count()
    const localJournal = account.consent.journal ? 0 : journal.all().length
    if (pending || localJournal) return { pending, localJournal }
  }
  signingOut = true
  try {
    await signOut()
    await clearDeviceForSignOut()
    setSyncState({ device: 'unknown', counts: null, reauth: false, paused: false, earlierData: false, lastSyncedAt: null, syncStatus: 'idle', syncError: null })
  } finally {
    signingOut = false
  }
  return { done: true }
}

async function onAccountChange() {
  const account = getAccount()
  if (account.status === 'signed-out') {
    preparedFor = null
    // Linked but signed out without choosing to (session expired or revoked):
    // the data stays, and Settings asks to sign in again.
    const linked = !signingOut && Boolean(await kvGet(LINK_KEY))
    const now = getAccount()
    // Only when something changed: this function runs on every account change.
    if (now.status === 'signed-out' && (now.device !== 'unknown' || now.reauth !== linked)) {
      setSyncState({ device: 'unknown', reauth: linked })
    }
    return
  }
  if (account.status !== 'signed-in' || account.recovery || account.consent.status !== 'done') return
  if (preparedFor === account.user.id) return
  preparedFor = account.user.id
  try {
    await prepareDevice(account)
  } catch (error) {
    preparedFor = null
    reportSyncError(error)
  }
}

let started = false
export function startSync(client = supabase) {
  if (started || !client) return
  started = true
  transport ??= supabaseTransport(client)
  subscribeAccount(() => onAccountChange())
  onSyncQueued(() => canSync() && schedule())
  // Changes from other tabs or the service worker (a reminder's "Mark done").
  if (typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel('impactme-sync').addEventListener('message', async () => {
      if (canSync() && (await db.syncQueue.count())) schedule()
    })
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
  addEventListener('online', () => syncNow())
  addEventListener('offline', () => canSync() && setSyncState({ syncStatus: 'offline' }))
  setInterval(() => document.visibilityState === 'visible' && syncNow(), EVERY)
  onAccountChange()
}
