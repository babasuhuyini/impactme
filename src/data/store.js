// The app's single source of truth. Everything lives in memory for instant,
// synchronous reads; changes are written to IndexedDB record by record
// (batched for a moment so typing doesn't write on every keystroke) and other
// open tabs are told to reload, so two tabs can no longer overwrite each other.

import { useSyncExternalStore } from 'react'
import { db } from './db.js'
import {
  SETTINGS_QUEUE_KEY,
  SYNCED_SETTINGS,
  queueChanges,
  queueKey,
  syncedSettingsChanged,
} from './syncQueue.js'
import { migrateFromDaybook } from './migrate.js'
import {
  DEFAULT_SETTINGS,
  normalizeEntry,
  normalizeList,
  normalizeProject,
  normalizeSettings,
  normalizeTask,
} from './models.js'

const NORMALIZE = { tasks: normalizeTask, journal: normalizeEntry, projects: normalizeProject }
const TABLES = Object.keys(NORMALIZE)
export const THEME_MIRROR_KEY = 'impactme.theme'
export const SAFETY_KEY = 'safety.beforeRestore'

const state = { tasks: [], journal: [], projects: [], settings: DEFAULT_SETTINGS, saveStatus: 'saved' }
const listeners = new Set()
const emit = () => listeners.forEach((notify) => notify())
const subscribe = (notify) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}
// For code outside React that needs to know when anything changes (reminders).
export const subscribeStore = subscribe

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('impactme-sync') : null
const broadcast = (table) => channel?.postMessage({ table })

let reportError = (error) => console.error(error)
export function onStorageError(handler) {
  reportError = handler
}

// Told when a local change was queued for sync, so sync can run soon after.
let notifyQueued = () => {}
export function onSyncQueued(handler) {
  notifyQueued = handler
}

function setSaveStatus(status) {
  if (state.saveStatus === status) return
  state.saveStatus = status
  emit()
}

/* Write queue ------------------------------------------------------------ */

// id → record to put, or null to delete. `inflight` holds writes being committed.
const pending = Object.fromEntries(TABLES.map((t) => [t, new Map()]))
const inflight = Object.fromEntries(TABLES.map((t) => [t, new Map()]))
let flushTimer = null
let flushing = null

// Writes start on the next tick, so a reload or closed tab right after an
// action doesn't lose it. Changes made while a write is running are collected
// and written straight after it, which keeps fast typing to a few writes a second.
function queue(table, id, record) {
  pending[table].set(id, record)
  setSaveStatus('saving')
  if (!flushTimer && !flushing) flushTimer = setTimeout(flush, 0)
}

export async function flush() {
  if (flushing) await flushing
  flushing = writePending()
  try {
    await flushing
  } finally {
    flushing = null
  }
  if (TABLES.some((t) => pending[t].size) && !flushTimer) flushTimer = setTimeout(flush, 0)
}

async function writePending() {
  clearTimeout(flushTimer)
  flushTimer = null
  const work = TABLES.filter((t) => pending[t].size).map((t) => {
    const ops = [...pending[t]]
    pending[t].clear()
    ops.forEach(([id, record]) => inflight[t].set(id, record))
    return [t, ops]
  })
  if (!work.length) return

  try {
    let queued = 0
    await db.transaction('rw', [...TABLES.map((t) => db[t]), db.kv, db.syncQueue], async () => {
      for (const [table, ops] of work) {
        const puts = ops.filter(([, r]) => r).map(([, r]) => r)
        const deletes = ops.filter(([, r]) => !r).map(([id]) => id)
        if (puts.length) await db[table].bulkPut(puts)
        if (deletes.length) await db[table].bulkDelete(deletes)
      }
      // Recorded for sync in the same transaction, so a saved change is never missed.
      queued = await queueChanges(
        db,
        work.flatMap(([table, ops]) => ops.map(([id, record]) => ({ table, id, op: record ? 'put' : 'delete' })))
      )
    })
    work.forEach(([table]) => broadcast(table))
    if (queued) notifyQueued()
    if (!TABLES.some((t) => pending[t].size)) setSaveStatus('saved')
  } catch (error) {
    setSaveStatus('error')
    reportError(error)
  } finally {
    for (const [table, ops] of work) {
      for (const [id, record] of ops) if (inflight[table].get(id) === record) inflight[table].delete(id)
    }
  }
  // After a failure, show what is actually saved rather than changes that were lost.
  if (state.saveStatus === 'error') await Promise.all(work.map(([table]) => reload(table)))
}

/* Reading back from IndexedDB ------------------------------------------- */

async function reload(table) {
  if (table === 'settings') {
    const row = await db.kv.get('settings')
    state.settings = normalizeSettings(row?.value)
    mirrorTheme()
    emit()
    return
  }
  const rows = await db[table].toArray()
  const byId = new Map(normalizeList(rows, NORMALIZE[table]).records.map((r) => [r.id, r]))
  // Keep this tab's unsaved changes on top of what another tab wrote.
  for (const ops of [inflight[table], pending[table]]) {
    for (const [id, record] of ops) record ? byId.set(id, record) : byId.delete(id)
  }
  state[table] = [...byId.values()]
  emit()
}

function mirrorTheme() {
  // index.html reads this before first paint, since IndexedDB is too slow for that.
  try {
    localStorage.setItem(THEME_MIRROR_KEY, state.settings.theme)
  } catch {
    // Storage blocked; the theme still applies once the app loads.
  }
}

export async function initStore() {
  await db.open()
  const migration = await migrateFromDaybook(db)
  await Promise.all([...TABLES, 'settings'].map(reload))
  if (channel) channel.onmessage = ({ data }) => TABLES.concat('settings').includes(data?.table) && reload(data.table)
  // Push out the last keystrokes when the tab is hidden or closed.
  addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  return { migration }
}

/* Collections ------------------------------------------------------------ */

function collection(table) {
  const normalize = NORMALIZE[table]
  const get = (id) => state[table].find((r) => r.id === id) ?? null

  function put(raw) {
    const record = normalize(raw)
    if (!record) return null
    const list = state[table]
    const index = list.findIndex((r) => r.id === record.id)
    state[table] = index === -1 ? [...list, record] : list.map((r, i) => (i === index ? record : r))
    emit()
    queue(table, record.id, record)
    return record
  }

  function update(id, patch) {
    const current = get(id)
    if (!current) return null
    const changes = typeof patch === 'function' ? patch(current) : patch
    return put({ ...current, ...changes, updatedAt: Date.now() })
  }

  function remove(ids) {
    const drop = new Set([].concat(ids))
    const removed = state[table].filter((r) => drop.has(r.id))
    if (!removed.length) return []
    state[table] = state[table].filter((r) => !drop.has(r.id))
    emit()
    removed.forEach((r) => queue(table, r.id, null))
    return removed
  }

  const all = () => state[table]

  return { all, get, put, update, remove }
}

export const tasks = collection('tasks')
export const journal = collection('journal')
export const projects = collection('projects')

export function updateSettings(patch) {
  const before = state.settings
  state.settings = normalizeSettings({ ...state.settings, ...patch })
  const settings = state.settings
  mirrorTheme()
  emit()
  // Only a change to a synced setting is queued: pushing for a theme change
  // could send this device's older copies of the synced settings as new.
  const synced = syncedSettingsChanged(before, settings)
  let queued = 0
  db.transaction('rw', db.kv, db.syncQueue, async () => {
    await db.kv.put({ key: 'settings', value: settings })
    if (synced) queued = await queueChanges(db, [{ table: 'settings', id: 'settings', op: 'put' }])
  })
    .then(() => {
      broadcast('settings')
      if (queued) notifyQueued()
    })
    .catch(reportError)
}

export const getSettings = () => state.settings
export const getSnapshot = () => ({
  tasks: state.tasks,
  journal: state.journal,
  projects: state.projects,
  settings: state.settings,
})

/* React hooks ------------------------------------------------------------ */

export const useTasks = () => useSyncExternalStore(subscribe, () => state.tasks)
export const useJournalEntries = () => useSyncExternalStore(subscribe, () => state.journal)
export const useProjects = () => useSyncExternalStore(subscribe, () => state.projects)
export const useSettings = () => useSyncExternalStore(subscribe, () => state.settings)
export const useSaveStatus = () => useSyncExternalStore(subscribe, () => state.saveStatus)

/* Backup restore --------------------------------------------------------- */

// Applies validated backup data. A copy of everything beforehand is kept so a
// restore can be undone. 'merge' keeps the newer copy of each record;
// 'replace' makes this browser match the backup exactly.
export async function restoreData(data, mode) {
  await flush()
  const result = { added: 0, updated: 0 }
  let queued = 0
  await db.transaction('rw', [...TABLES.map((t) => db[t]), db.kv, db.syncQueue], async () => {
    const before = {
      tasks: await db.tasks.toArray(),
      journal: await db.journal.toArray(),
      projects: await db.projects.toArray(),
      settings: (await db.kv.get('settings'))?.value ?? null,
    }
    await db.kv.put({ key: SAFETY_KEY, value: { at: Date.now(), ...before } })

    const changes = []
    for (const table of TABLES) {
      const existing = new Map(before[table].map((r) => [r.id, r]))
      const records = data[table] ?? [] // older backups have no projects
      const incoming =
        mode === 'replace'
          ? records
          : records.filter((r) => !existing.has(r.id) || r.updatedAt > (existing.get(r.id).updatedAt ?? 0))
      for (const r of incoming) existing.has(r.id) ? result.updated++ : result.added++
      if (mode === 'replace') {
        await db[table].clear()
        const kept = new Set(incoming.map((r) => r.id))
        for (const id of existing.keys()) if (!kept.has(id)) changes.push({ table, id, op: 'delete' })
      }
      await db[table].bulkPut(incoming)
      for (const r of incoming) changes.push({ table, id: r.id, op: 'put' })
    }
    if (mode === 'replace' && data.settings) {
      await db.kv.put({ key: 'settings', value: data.settings })
      if (syncedSettingsChanged(before.settings, data.settings)) changes.push({ table: 'settings', id: 'settings', op: 'put' })
    }
    queued = await queueChanges(db, changes)
  })
  await Promise.all([...TABLES, 'settings'].map(reload))
  ;[...TABLES, 'settings'].forEach(broadcast)
  if (queued) notifyQueued()
  return result
}

/* Sync ------------------------------------------------------------------- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Applies rows pulled from the account ({ id, data, deleted, changed_at }).
// Never queues them. A row is skipped when this device has a newer change to
// that record: one still being saved, or one queued with a later time (it will
// be pushed). Applying the same rows twice changes nothing.
export async function applyRemote(table, rows) {
  const normalize = NORMALIZE[table]
  const localWrite = (id) => pending[table].has(id) || inflight[table].has(id)
  const puts = []
  const deletes = []
  await db.transaction('rw', db[table], db.syncQueue, async () => {
    const queued = await db.syncQueue.bulkGet(rows.map((r) => queueKey(table, r.id)))
    const current = await db[table].bulkGet(rows.map((r) => r.id))
    const settled = []
    rows.forEach((row, i) => {
      if (localWrite(row.id)) return
      const entry = queued[i]
      if (entry && entry.changedAt > row.changed_at) return
      if (entry) settled.push(entry.key) // the account already has this change or a newer one
      if (row.deleted) {
        if (current[i]) deletes.push(row.id)
        return
      }
      const record = normalize(row.data)
      if (record && record.id === row.id && !same(record, current[i])) puts.push(record)
    })
    if (puts.length) await db[table].bulkPut(puts)
    if (deletes.length) await db[table].bulkDelete(deletes)
    if (settled.length) await db.syncQueue.bulkDelete(settled)
  })
  // Edits made while that transaction ran stay on top.
  const fresh = puts.filter((r) => !localWrite(r.id))
  const gone = new Set(deletes.filter((id) => !localWrite(id)))
  if (!fresh.length && !gone.size) return 0
  const byId = new Map(state[table].map((r) => [r.id, r]))
  fresh.forEach((r) => byId.set(r.id, r))
  gone.forEach((id) => byId.delete(id))
  state[table] = [...byId.values()]
  emit()
  broadcast(table)
  return fresh.length + gone.size
}

// Applies the account's synced settings ({ data, changed_at }). Device-only
// settings never change from a pull.
export async function applyRemoteSettings(row) {
  let next = null
  await db.transaction('rw', db.kv, db.syncQueue, async () => {
    const entry = await db.syncQueue.get(SETTINGS_QUEUE_KEY)
    if (entry && entry.changedAt > row.changed_at) return
    if (entry) await db.syncQueue.delete(SETTINGS_QUEUE_KEY)
    const current = normalizeSettings((await db.kv.get('settings'))?.value)
    const incoming = Object.fromEntries(SYNCED_SETTINGS.filter((k) => k in (row.data ?? {})).map((k) => [k, row.data[k]]))
    const merged = normalizeSettings({ ...current, ...incoming })
    next = { ...current, ...Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, merged[k]])) }
    if (same(next, current)) next = null
    else await db.kv.put({ key: 'settings', value: next })
  })
  if (!next) return false
  state.settings = next
  mirrorTheme()
  emit()
  broadcast('settings')
  return true
}

// Empties tasks, journal and projects on this device without queueing
// anything ("Not Now" on first sign-in keeps a snapshot first).
export async function clearLocalRecords() {
  await flush()
  await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
    for (const t of TABLES) await db[t].clear()
  })
  TABLES.forEach((t) => (state[t] = []))
  emit()
  TABLES.forEach(broadcast)
}

// After sign-out: removes the account's data from this device. Data saved on
// the device isn't encrypted, so nothing of the account may stay behind on a
// shared device. Device-only settings (theme, reminders on/off) are kept.
export async function clearAccountData(kvKeys) {
  await flush()
  await db.transaction('rw', [...TABLES.map((t) => db[t]), db.kv, db.syncQueue, db.reminderLog, db.snoozes], async () => {
    for (const t of TABLES) await db[t].clear()
    await Promise.all([db.syncQueue.clear(), db.reminderLog.clear(), db.snoozes.clear()])
    await db.kv.bulkDelete([...kvKeys, SAFETY_KEY])
    const current = normalizeSettings((await db.kv.get('settings'))?.value)
    const reset = { ...current, ...Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, DEFAULT_SETTINGS[k]])) }
    await db.kv.put({ key: 'settings', value: reset })
  })
  await Promise.all([...TABLES, 'settings'].map(reload))
  ;[...TABLES, 'settings', 'snoozes'].forEach(broadcast)
}

export async function getSafetySnapshot() {
  return (await db.kv.get(SAFETY_KEY))?.value ?? null
}

/* Storage protection ----------------------------------------------------- */

export async function storageStatus() {
  try {
    const [persisted, estimate] = await Promise.all([
      navigator.storage?.persisted?.() ?? false,
      navigator.storage?.estimate?.() ?? null,
    ])
    return { supported: Boolean(navigator.storage?.persist), persisted, usage: estimate?.usage ?? null }
  } catch {
    return { supported: false, persisted: false, usage: null }
  }
}

export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
