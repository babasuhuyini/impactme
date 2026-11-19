import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db.js'
import { createEntry, createProject, createTask } from './models.js'
import {
  SAFETY_KEY,
  applyRemote,
  flush,
  getSettings,
  initStore,
  journal,
  projects,
  tasks,
  updateSettings,
} from './store.js'
import {
  addDeviceData,
  addEarlierData,
  applyJournalSync,
  clearDeviceForSignOut,
  keepDeviceDataAside,
  linkDevice,
  pullAll,
  pushQueue,
} from './sync.js'
import { JOURNAL_KEY, LINK_KEY, SNAPSHOT_KEY, cursorKey, queueKey } from './syncQueue.js'

// A fake account server that behaves like the real one: last change wins per
// record (by changed_at), tombstones for deletes, and a server timestamp on
// every accepted write.
function fakeServer() {
  const tables = { tasks: new Map(), journal: new Map(), projects: new Map() }
  let settings = null
  let clock = Date.UTC(2026, 10, 19)
  const stamp = () => new Date(++clock).toISOString()
  const after = (row, since) => !since || Date.parse(row.server_updated_at) > Date.parse(since)
  return {
    tables,
    get settings() {
      return settings
    },
    pushes: [],
    async push(table, rows) {
      this.pushes.push(table)
      for (const row of rows) {
        const current = tables[table].get(row.id)
        if (current && current.changed_at > row.changed_at) continue
        tables[table].set(row.id, { ...row, server_updated_at: stamp() })
      }
    },
    async pull(table, since, limit) {
      return [...tables[table].values()]
        .filter((r) => after(r, since))
        .sort((a, b) => Date.parse(a.server_updated_at) - Date.parse(b.server_updated_at))
        .slice(0, limit)
    },
    async pushSettings(row) {
      if (settings && settings.changed_at > row.changed_at) return
      settings = { ...row, server_updated_at: stamp() }
    },
    async pullSettings(since) {
      return settings && after(settings, since) ? settings : null
    },
    async deleteJournal() {
      tables.journal.clear()
    },
    // A change made on another device.
    remote(table, record, changedAt, deleted = false) {
      tables[table].set(record.id, {
        id: record.id,
        data: deleted ? null : record,
        deleted,
        changed_at: changedAt,
        server_updated_at: stamp(),
      })
    },
  }
}

const settle = () => new Promise((r) => setTimeout(r, 30))
const queue = () => db.syncQueue.toArray()
const kv = async (key) => (await db.kv.get(key))?.value

let server
beforeEach(async () => {
  globalThis.document ??= { addEventListener() {}, visibilityState: 'visible' }
  globalThis.addEventListener ??= () => {}
  await flush()
  await Promise.all(
    [db.tasks, db.journal, db.projects, db.kv, db.syncQueue, db.reminderLog, db.snoozes].map((t) => t.clear())
  )
  await initStore()
  server = fakeServer()
})

const link = (journalSync = true) => linkDevice('user-1', journalSync)
const addTask = async (title = 'Call Ama') => {
  const t = tasks.put(createTask({ title }))
  await flush()
  return t
}

describe('queueing local changes', () => {
  it('queues puts and deletes only while linked, and applyRemote never queues', async () => {
    await addTask('Before linking')
    expect(await queue()).toEqual([])

    await link()
    const t = await addTask()
    expect(await queue()).toMatchObject([{ key: `tasks:${t.id}`, op: 'put' }])
    tasks.remove(t.id)
    await flush()
    expect(await queue()).toMatchObject([{ key: `tasks:${t.id}`, op: 'delete' }])

    await db.syncQueue.clear()
    const other = createTask({ title: 'From another device' })
    await applyRemote('tasks', [{ id: other.id, data: other, deleted: false, changed_at: Date.now() }])
    expect(tasks.get(other.id)).toBeTruthy()
    expect(await queue()).toEqual([])
  })

  it('a newer change to the same record replaces the older queue entry', async () => {
    await link()
    const t = await addTask()
    const [first] = await queue()
    tasks.update(t.id, { title: 'Call Ama at 5' })
    await flush()
    const entries = await queue()
    expect(entries).toHaveLength(1)
    expect(entries[0].changedAt).toBeGreaterThan(first.changedAt)
  })
})

describe('conflicts: the later change wins', () => {
  it('a newer local change wins over an older remote one', async () => {
    await link()
    const t = await addTask('Mine, newer')
    const [entry] = await queue()
    server.remote('tasks', { ...t, title: 'Theirs, older' }, entry.changedAt - 1000)

    await pullAll(server)
    expect(tasks.get(t.id).title).toBe('Mine, newer')
    await pushQueue(server)
    expect(server.tables.tasks.get(t.id).data.title).toBe('Mine, newer')
    expect(await queue()).toEqual([])
  })

  it('a newer remote change wins over an older local one', async () => {
    await link()
    const t = await addTask('Mine, older')
    const [entry] = await queue()
    server.remote('tasks', { ...t, title: 'Theirs, newer' }, entry.changedAt + 1000)

    await pullAll(server)
    expect(tasks.get(t.id).title).toBe('Theirs, newer')
    expect(await queue()).toEqual([]) // the older local change is dropped
    expect((await db.tasks.get(t.id)).title).toBe('Theirs, newer')
  })

  it('an edit made while a pull runs is never lost, and memory and disk agree', async () => {
    await link()
    const t = await addTask('Saved')
    await pushQueue(server)
    server.remote('tasks', { ...t, title: 'Theirs, older' }, Date.now() - 1000)
    tasks.update(t.id, { title: 'Typing…' }) // not saved yet when the pull starts
    await pullAll(server)
    await flush()
    expect(tasks.get(t.id).title).toBe('Typing…')
    expect((await db.tasks.get(t.id)).title).toBe('Typing…')
    await pushQueue(server)
    expect(server.tables.tasks.get(t.id).data.title).toBe('Typing…')
  })
})

describe('deletes', () => {
  it('a remote tombstone removes the local record', async () => {
    await link()
    const t = await addTask()
    await pushQueue(server)
    server.remote('tasks', t, Date.now() + 1000, true)
    await pullAll(server)
    expect(tasks.get(t.id)).toBeNull()
    expect(await db.tasks.get(t.id)).toBeUndefined()
  })

  it('a newer local edit beats an older tombstone', async () => {
    await link()
    const t = await addTask()
    await pushQueue(server)
    server.remote('tasks', t, Date.now() - 60_000, true) // deleted elsewhere, earlier
    tasks.update(t.id, { title: 'Edited here' })
    await flush()

    await pullAll(server)
    expect(tasks.get(t.id).title).toBe('Edited here')
    await pushQueue(server)
    expect(server.tables.tasks.get(t.id)).toMatchObject({ deleted: false, data: { title: 'Edited here' } })
  })

  it('undo after delete: the restored record syncs back and isn’t deleted again', async () => {
    await link()
    const t = await addTask()
    await pushQueue(server)
    const [removed] = tasks.remove(t.id)
    await flush()
    await pushQueue(server)
    expect(server.tables.tasks.get(t.id).deleted).toBe(true)

    tasks.put(removed) // Undo
    await flush()
    await pushQueue(server)
    await pullAll(server)
    expect(server.tables.tasks.get(t.id).deleted).toBe(false)
    expect(tasks.get(t.id)).toBeTruthy()
  })
})

describe('pulling', () => {
  it('pulling the same rows twice changes nothing', async () => {
    await link()
    const a = createTask({ title: 'A' })
    const p = createProject({ name: 'Home' })
    server.remote('tasks', a, Date.now())
    server.remote('projects', p, Date.now())

    expect(await pullAll(server)).toBe(2)
    const before = JSON.stringify([tasks.all(), projects.all(), await db.tasks.toArray()])
    expect(await pullAll(server)).toBe(0) // the 5-second overlap re-reads the same rows
    expect(JSON.stringify([tasks.all(), projects.all(), await db.tasks.toArray()])).toBe(before)
    expect(await kv(cursorKey('tasks'))).toBeTruthy()
  })

  it('pulls in pages until nothing is left', async () => {
    await link()
    for (let i = 0; i < 1203; i++) server.remote('tasks', createTask({ title: `T${i}` }), Date.now())
    await pullAll(server)
    expect(tasks.all()).toHaveLength(1203)
  })
})

describe('settings', () => {
  it('only synced keys go up, and device-only keys never change from a pull', async () => {
    await link()
    updateSettings({ theme: 'dark' }) // device-only: not queued
    await settle()
    expect(await queue()).toEqual([])

    updateSettings({ name: 'Ama' })
    await settle()
    expect(await queue()).toMatchObject([{ key: 'settings:settings' }])
    await pushQueue(server)
    expect(server.settings.data.name).toBe('Ama')
    expect(server.settings.data).not.toHaveProperty('theme')
    expect(server.settings.data).not.toHaveProperty('remindersEnabled')

    await server.pushSettings({
      data: { name: 'Kofi', weekStart: 'monday', theme: 'light', remindersEnabled: false },
      changed_at: Date.now() + 60_000,
    })
    await pullAll(server)
    expect(getSettings()).toMatchObject({ name: 'Kofi', weekStart: 'monday', theme: 'dark', remindersEnabled: true })
  })
})

describe('first sign-in on a device', () => {
  it('Add to My Account queues every record and the settings', async () => {
    const t = await addTask()
    const p = projects.put(createProject({ name: 'Work' }))
    const e = journal.put(createEntry({ body: 'Day one' }))
    await flush()

    await addDeviceData('user-1', true)
    const keys = (await queue()).map((q) => q.key).sort()
    expect(keys).toEqual(
      [queueKey('tasks', t.id), queueKey('projects', p.id), queueKey('journal', e.id), 'settings:settings'].sort()
    )
    await pushQueue(server)
    expect(server.tables.tasks.has(t.id) && server.tables.projects.has(p.id) && server.tables.journal.has(e.id)).toBe(true)
  })

  it('Not Now keeps a snapshot, empties the device, and the data can be added later', async () => {
    const t = await addTask('Old task')
    journal.put(createEntry({ body: 'Old entry' }))
    await flush()

    await keepDeviceDataAside('user-1', true)
    expect(tasks.all()).toEqual([])
    expect(journal.all()).toEqual([])
    expect(await kv(LINK_KEY)).toBe('user-1')
    expect(await queue()).toEqual([])
    const snapshot = await kv(SNAPSHOT_KEY)
    expect(snapshot.format).toBe('impactme-backup')
    expect(snapshot.data.tasks.map((x) => x.id)).toEqual([t.id])

    await addEarlierData()
    expect(tasks.get(t.id).title).toBe('Old task')
    expect((await queue()).map((q) => q.key)).toContain(queueKey('tasks', t.id))
    expect(await kv(SNAPSHOT_KEY)).toBeUndefined()
  })

  it('linking to another account starts fresh: no old queue or cursors', async () => {
    await link()
    await addTask()
    await db.kv.put({ key: cursorKey('tasks'), value: '2026-01-01T00:00:00Z' })
    await linkDevice('user-2', false)
    expect(await queue()).toEqual([])
    expect(await kv(cursorKey('tasks'))).toBeUndefined()
    expect(await kv(LINK_KEY)).toBe('user-2')
  })
})

describe('sign out', () => {
  it('clears exactly the account data, and keeps device-only settings', async () => {
    await link()
    await addTask()
    projects.put(createProject({ name: 'Work' }))
    journal.put(createEntry({ body: 'Private' }))
    await flush()
    updateSettings({ name: 'Ama', theme: 'dark', remindersEnabled: false })
    await settle()
    await db.reminderLog.put({ key: 'r1', at: 1 })
    await db.snoozes.put({ taskId: 't', at: 1 })
    await db.kv.bulkPut([
      { key: cursorKey('tasks'), value: 'x' },
      { key: SAFETY_KEY, value: { tasks: [] } },
      { key: 'migration.daybookLocalStorage', value: { at: 1 } },
      { key: SNAPSHOT_KEY, value: { data: {} } },
    ])

    await clearDeviceForSignOut()

    for (const table of [db.tasks, db.journal, db.projects, db.syncQueue, db.reminderLog, db.snoozes]) {
      expect(await table.count()).toBe(0)
    }
    expect([tasks.all(), projects.all(), journal.all()]).toEqual([[], [], []])
    const keys = (await db.kv.toCollection().primaryKeys()).sort()
    expect(keys).toEqual(['migration.daybookLocalStorage', 'settings', SNAPSHOT_KEY].sort())
    expect(getSettings()).toMatchObject({ name: '', theme: 'dark', remindersEnabled: false })
  })
})

describe('journal consent', () => {
  it('without consent, journal entries are never queued, pushed or pulled; tasks still sync', async () => {
    await link(false)
    const e = journal.put(createEntry({ body: 'Only here' }))
    const t = await addTask()
    await flush()
    expect((await queue()).map((q) => q.key)).toEqual([queueKey('tasks', t.id)])

    // Even a stray journal entry in the queue is never sent.
    await db.syncQueue.put({ key: queueKey('journal', e.id), table: 'journal', id: e.id, op: 'put', changedAt: 1 })
    await pushQueue(server)
    expect(server.pushes).not.toContain('journal')
    expect(server.tables.tasks.has(t.id)).toBe(true)

    const elsewhere = createEntry({ body: 'From another device' })
    server.remote('journal', elsewhere, Date.now())
    await pullAll(server)
    expect(journal.get(elsewhere.id)).toBeNull()
  })

  it('withdrawing consent removes journal rows from the account and stops syncing them', async () => {
    await link(false)
    const e = journal.put(createEntry({ body: 'Day one' }))
    await flush()

    await applyJournalSync(true, server)
    await pushQueue(server)
    expect(server.tables.journal.has(e.id)).toBe(true)

    journal.update(e.id, { body: 'Edited' })
    await flush()
    await applyJournalSync(false, server)
    expect(server.tables.journal.size).toBe(0)
    expect(await kv(JOURNAL_KEY)).toBe(false)
    expect(await queue()).toEqual([])
    expect(journal.get(e.id).body).toBe('Edited') // still on this device

    journal.update(e.id, { body: 'Again' })
    await flush()
    expect(await queue()).toEqual([])
  })
})

describe('the service worker’s Mark done', () => {
  it('queues the completed task in the same transaction', async () => {
    const { completeFromReminder } = await import('../reminders/handlers.js')
    await link()
    const t = await addTask()
    tasks.update(t.id, { dueDate: '2026-11-20' })
    await flush()
    await db.syncQueue.clear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await completeFromReminder(db, { taskId: t.id, dueDate: '2026-11-20' })).toBe(true)
    expect((await queue()).map((q) => q.key)).toEqual([queueKey('tasks', t.id)])
  })
})

describe('size limit', () => {
  it('holds back a record too large to sync, and still sends the rest', async () => {
    await link()
    const big = journal.put(createEntry({ body: 'x'.repeat(950_000) }))
    const small = await addTask('Small')
    await flush()
    const result = await pushQueue(server)
    expect(result).toEqual({ sent: 1, held: 1 })
    expect(server.tables.tasks.has(small.id)).toBe(true)
    expect(server.tables.journal.has(big.id)).toBe(false)
    expect((await queue()).map((q) => q.key)).toEqual([queueKey('journal', big.id)])
  })
})
