import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db.js'
import { normalizeTask } from '../data/models.js'
import { MINUTE } from '../lib/reminders.js'
import { normalizeRule } from '../lib/recurrence.js'
import { takeDueReminders } from './engine.js'
import { completeFromReminder, snoozeReminder } from './handlers.js'

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const CREATED = at(2026, 11, 1, 8)
const FIRE = at(2026, 11, 5, 13, 45)

const put = (fields) =>
  db.tasks.put(
    normalizeTask({
      id: 't1',
      title: 'Call John',
      dueDate: '2026-11-05',
      startTime: '14:00',
      reminders: [{ id: 'r', minutes: 15 }],
      createdAt: CREATED,
      updatedAt: CREATED,
      ...fields,
    })
  )

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.kv.clear(), db.reminderLog.clear(), db.snoozes.clear()])
})

describe('takeDueReminders', () => {
  it('sends a reminder once, across reloads', async () => {
    await put()
    expect((await takeDueReminders(db, FIRE - 1)).due).toEqual([])
    expect((await takeDueReminders(db, FIRE)).due).toHaveLength(1)
    expect((await takeDueReminders(db, FIRE + MINUTE)).due).toEqual([])
  })

  it('gives a reminder to only one of several tabs checking at the same moment', async () => {
    await put()
    const results = await Promise.all([1, 2, 3].map(() => takeDueReminders(db, FIRE)))
    expect(results.map((r) => r.due.length).sort()).toEqual([0, 0, 1])
  })

  it('reports when the next reminder is due', async () => {
    await put()
    expect((await takeDueReminders(db, at(2026, 11, 5, 9))).next).toBe(FIRE)
    await snoozeReminder(db, 't1', 10, FIRE)
    expect((await takeDueReminders(db, FIRE + MINUTE)).next).toBe(FIRE + 10 * MINUTE)
  })

  it('sends nothing while reminders are turned off', async () => {
    await put()
    await db.kv.put({ key: 'settings', value: { remindersEnabled: false } })
    expect((await takeDueReminders(db, FIRE)).due).toEqual([])
  })

  it('brings a snoozed reminder back, once', async () => {
    await put()
    await takeDueReminders(db, FIRE)
    await snoozeReminder(db, 't1', 10, FIRE)
    expect((await takeDueReminders(db, FIRE + 9 * MINUTE)).due).toEqual([])
    const { due } = await takeDueReminders(db, FIRE + 10 * MINUTE)
    expect(due).toMatchObject([{ snoozed: true, task: { id: 't1' } }])
    expect((await takeDueReminders(db, FIRE + 11 * MINUTE)).due).toEqual([])
  })

  it('drops a snooze for a task completed in the meantime', async () => {
    await put()
    await snoozeReminder(db, 't1', 10, FIRE)
    await completeFromReminder(db, { taskId: 't1', dueDate: '2026-11-05' }, FIRE + MINUTE)
    expect((await takeDueReminders(db, FIRE + 10 * MINUTE)).due).toEqual([])
    expect(await db.snoozes.count()).toBe(0)
  })

  it('sends nothing for deleted tasks', async () => {
    await put()
    await db.tasks.delete('t1')
    expect((await takeDueReminders(db, FIRE)).due).toEqual([])
  })
})

describe('completeFromReminder', () => {
  it('completes a one-off task', async () => {
    await put()
    expect(await completeFromReminder(db, { taskId: 't1', dueDate: '2026-11-05' }, FIRE)).toBe(true)
    expect(await db.tasks.get('t1')).toMatchObject({ status: 'done', completedAt: FIRE })
  })

  it('moves a repeating task on and keeps a completed copy', async () => {
    await put({ recurrence: normalizeRule({ freq: 'daily' }, '2026-11-05') })
    await completeFromReminder(db, { taskId: 't1', dueDate: '2026-11-05' }, FIRE)
    expect(await db.tasks.get('t1')).toMatchObject({ status: 'open', dueDate: '2026-11-06' })
    expect(await db.tasks.where('seriesId').equals('t1').toArray()).toMatchObject([{ status: 'done', dueDate: '2026-11-05' }])
  })

  it('ignores an old notification for an occurrence that has already moved on', async () => {
    await put({ recurrence: normalizeRule({ freq: 'daily' }, '2026-11-05') })
    await completeFromReminder(db, { taskId: 't1', dueDate: '2026-11-05' }, FIRE)
    expect(await completeFromReminder(db, { taskId: 't1', dueDate: '2026-11-05' }, FIRE)).toBe(false)
    expect(await db.tasks.where('seriesId').equals('t1').count()).toBe(1)
  })

  it('does nothing for time blocks or deleted tasks', async () => {
    await put({ kind: 'block' })
    expect(await completeFromReminder(db, { taskId: 't1', dueDate: '2026-11-05' }, FIRE)).toBe(false)
    expect(await completeFromReminder(db, { taskId: 'gone', dueDate: '2026-11-05' }, FIRE)).toBe(false)
  })
})
