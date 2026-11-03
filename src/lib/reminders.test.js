import { describe, expect, it } from 'vitest'
import {
  DAY,
  MINUTE,
  currentBlockDate,
  describeReminder,
  dueReminders,
  nextReminderAt,
  normalizeReminders,
  reminderBody,
  reminderTimes,
} from './reminders.js'
import { normalizeTask } from '../data/models.js'
import { planCompletion } from '../data/completion.js'
import { normalizeRule } from './recurrence.js'

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const CREATED = at(2026, 11, 1, 8)

const task = (fields) =>
  normalizeTask({ id: 't1', title: 'Call John', createdAt: CREATED, updatedAt: CREATED, ...fields })

describe('normalizeReminders', () => {
  it('keeps valid reminders, drops broken ones and duplicates, and caps the number', () => {
    const list = normalizeReminders([
      { id: 'a', minutes: 15 },
      { id: 'b', minutes: 15 },
      { id: 'c', minutes: -5 },
      { id: 'd', at: '2026-11-05T09:30' },
      { id: 'e', at: 'tomorrow' },
      null,
      { minutes: 60 },
    ])
    expect(list.map((r) => r.minutes ?? r.at)).toEqual([60, 15, '2026-11-05T09:30'])
    expect(list.every((r) => typeof r.id === 'string')).toBe(true)
    expect(normalizeReminders([0, 1, 2, 3, 4, 5, 6].map((m) => ({ minutes: m })))).toHaveLength(5)
    expect(normalizeReminders('nope')).toEqual([])
  })
})

describe('reminderTimes', () => {
  it('counts back from the start time', () => {
    const t = task({ dueDate: '2026-11-05', startTime: '14:00', reminders: [{ id: 'r0', minutes: 0 }, { id: 'r15', minutes: 15 }, { id: 'r1d', minutes: 1440 }] })
    expect(reminderTimes(t).map((r) => r.at)).toEqual([at(2026, 11, 4, 14), at(2026, 11, 5, 13, 45), at(2026, 11, 5, 14)])
  })

  it('uses the all-day reminder time for tasks without a time', () => {
    const t = task({ dueDate: '2026-11-05', reminders: [{ id: 'r', minutes: 0 }, { id: 'd', minutes: 1440 }] })
    expect(reminderTimes(t, { allDayTime: '08:30' }).map((r) => r.at)).toEqual([at(2026, 11, 4, 8, 30), at(2026, 11, 5, 8, 30)])
  })

  it('keeps wall-clock times across a daylight saving change', () => {
    // "1 day before" is 9 AM the day before, even when that day is 23 or 25 hours long.
    for (const [y, m, d] of [[2026, 3, 30], [2026, 10, 26], [2026, 11, 2], [2026, 3, 9]]) {
      const due = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const t = task({ dueDate: due, startTime: '09:00', reminders: [{ id: 'r', minutes: 1440 }] })
      const fired = new Date(reminderTimes(t)[0].at)
      expect([fired.getDate(), fired.getHours(), fired.getMinutes()]).toEqual([d - 1, 9, 0])
    }
  })

  it('supports a fixed date and time, even without a due date', () => {
    const t = task({ reminders: [{ id: 'r', at: '2026-11-06T07:15' }] })
    expect(reminderTimes(t)).toEqual([expect.objectContaining({ at: at(2026, 11, 6, 7, 15) })])
  })

  it('has nothing for completed tasks or relative reminders without a date', () => {
    expect(reminderTimes(task({ reminders: [{ id: 'r', minutes: 5 }] }))).toEqual([])
    expect(reminderTimes(task({ dueDate: '2026-11-05', status: 'done', reminders: [{ id: 'r', minutes: 5 }] }))).toEqual([])
  })

  it('gives a new key when the task moves, so it reminds again', () => {
    const before = task({ dueDate: '2026-11-05', startTime: '14:00', reminders: [{ id: 'r', minutes: 10 }] })
    const moved = { ...before, startTime: '16:00' }
    expect(reminderTimes(before)[0].key).not.toBe(reminderTimes(moved)[0].key)
  })

  it('reminds again for the next occurrence of a repeating task', () => {
    const t = task({
      dueDate: '2026-11-03',
      startTime: '07:00',
      recurrence: normalizeRule({ freq: 'daily' }, '2026-11-03'),
      reminders: [{ id: 'r', minutes: 0 }],
    })
    const { updated } = planCompletion(t, at(2026, 11, 3, 7, 5))
    const [first] = reminderTimes(t)
    const [next] = reminderTimes(normalizeTask(updated))
    expect(next.key).not.toBe(first.key)
    expect(next.at).toBe(at(2026, 11, 4, 7))
  })
})

describe('dueReminders', () => {
  const t = task({ dueDate: '2026-11-05', startTime: '14:00', reminders: [{ id: 'r', minutes: 15 }] })
  const fireAt = at(2026, 11, 5, 13, 45)

  it('is empty before the reminder time and due once it passes', () => {
    expect(dueReminders([t], { now: fireAt - 1 })).toEqual([])
    const [item] = dueReminders([t], { now: fireAt + 1000 })
    expect(item).toMatchObject({ at: fireAt, late: false, task: { id: 't1' } })
    expect(item.keys).toEqual([item.key])
  })

  it('never sends a reminder twice', () => {
    const [item] = dueReminders([t], { now: fireAt })
    expect(dueReminders([t], { now: fireAt + MINUTE, fired: new Set([item.key]) })).toEqual([])
  })

  it('marks reminders as missed after a sleep, and drops ones older than a day', () => {
    expect(dueReminders([t], { now: fireAt + 3 * 60 * MINUTE })[0].late).toBe(true)
    expect(dueReminders([t], { now: fireAt + DAY + MINUTE })).toEqual([])
  })

  it('skips reminders whose time had passed when the task was last edited', () => {
    const edited = { ...t, updatedAt: fireAt + MINUTE }
    expect(dueReminders([edited], { now: fireAt + 2 * MINUTE })).toEqual([])
  })

  it('sends one notification per task when several of its reminders are due', () => {
    const many = { ...t, reminders: normalizeReminders([{ minutes: 60 }, { minutes: 15 }]) }
    const due = dueReminders([many], { now: fireAt + MINUTE })
    expect(due).toHaveLength(1)
    expect(due[0].at).toBe(fireAt)
    expect(due[0].keys).toHaveLength(2)
  })

  it('reminds for a repeating time block on its current day before the app has moved it on', () => {
    const lunch = task({
      kind: 'block',
      title: 'Lunch',
      dueDate: '2026-11-02',
      startTime: '12:30',
      recurrence: normalizeRule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }, '2026-11-02'),
      reminders: [{ id: 'r', minutes: 5 }],
    })
    expect(currentBlockDate(lunch, '2026-11-04')).toBe('2026-11-04')
    expect(dueReminders([lunch], { now: at(2026, 11, 4, 12, 26) })[0].at).toBe(at(2026, 11, 4, 12, 25))
  })

  it('finds the next reminder for the timer', () => {
    expect(nextReminderAt([t], { now: at(2026, 11, 5, 9) })).toBe(fireAt)
    expect(nextReminderAt([t], { now: fireAt + 1 })).toBe(null)
  })
})

describe('labels', () => {
  it('describes reminders for timed and untimed tasks', () => {
    expect(describeReminder({ minutes: 0 })).toBe('At the time')
    expect(describeReminder({ minutes: 90 })).toBe('1 hour 30 min before')
    expect(describeReminder({ minutes: 1440 })).toBe('1 day before')
    expect(describeReminder({ minutes: 0 }, { timed: false, allDayTime: '09:00', timeFormat: '24' })).toBe('On the day, 09:00')
    expect(describeReminder({ minutes: 1440 }, { timed: false, allDayTime: '09:00', timeFormat: '24' })).toBe('The day before, 09:00')
    expect(describeReminder({ minutes: 600 }, { timed: false, allDayTime: '09:00', timeFormat: '24' })).toBe('The day before, 23:00')
  })

  it('writes a helpful notification body', () => {
    const t = task({ dueDate: '2026-11-05', startTime: '14:00', priority: 'urgent', reminders: [{ id: 'r', minutes: 15 }] })
    const now = at(2026, 11, 5, 13, 45)
    expect(reminderBody({ task: t, at: now }, { now, timeFormat: '24' })).toBe('Due today at 14:00 · Urgent')
    expect(reminderBody({ task: t, at: now - 3 * 60 * MINUTE, late: true }, { now, timeFormat: '24' })).toBe(
      'Missed reminder (10:45) · Due today at 14:00 · Urgent'
    )
    expect(reminderBody({ task: t, snoozed: true }, { now: at(2026, 11, 4, 9), timeFormat: '24' })).toBe(
      'Snoozed reminder · Due tomorrow at 14:00 · Urgent'
    )
  })
})
