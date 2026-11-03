// Works out which reminders are due, straight from IndexedDB. Used by every
// open tab and by the service worker, so it doesn't depend on the app store.

import { normalizeSettings, normalizeTask } from '../data/models.js'
import { DAY, MINUTE, MISSED_WINDOW, dueReminders, nextReminderAt } from '../lib/reminders.js'

export const REMINDER_SYNC_TAG = 'impactme-reminders'
const KEEP_LOG = 30 * DAY

// Claims the reminders that are due now and records them as sent, inside one
// transaction. IndexedDB runs overlapping transactions one at a time, so two
// tabs and the service worker checking at the same moment can't both send one.
// Returns { settings, due, next } where `next` is when the next reminder is due.
export function takeDueReminders(db, now = Date.now()) {
  return db.transaction('rw', [db.tasks, db.kv, db.reminderLog, db.snoozes], async () => {
    const settings = normalizeSettings((await db.kv.get('settings'))?.value)
    const snoozes = await db.snoozes.where('at').belowOrEqual(now).toArray()
    await db.snoozes.bulkDelete(snoozes.map((s) => s.taskId))
    if (!settings.remindersEnabled) return { settings, due: [], next: null }

    const tasks = (await db.tasks.toArray()).map(normalizeTask).filter(Boolean)
    const since = now - MISSED_WINDOW
    const fired = new Set(await db.reminderLog.toCollection().primaryKeys())
    const allDayTime = settings.allDayReminderTime
    const due = dueReminders(tasks, { now, fired, since, allDayTime })

    const byId = new Map(tasks.map((t) => [t.id, t]))
    const dueIds = new Set(due.map((d) => d.task.id))
    for (const s of snoozes) {
      const task = byId.get(s.taskId)
      if (!task || task.status === 'done' || s.at < since || dueIds.has(task.id)) continue
      due.push({ key: `${task.id}|snooze ${s.at}`, keys: [], at: s.at, task, snoozed: true, late: now - s.at > 2 * MINUTE })
    }

    const log = due.flatMap((d) => d.keys.map((key) => ({ key, at: d.at, firedAt: now })))
    if (log.length) await db.reminderLog.bulkPut(log)
    await db.reminderLog.where('at').below(now - KEEP_LOG).delete()

    const nextSnooze = (await db.snoozes.orderBy('at').first())?.at ?? Infinity
    const next = Math.min(nextReminderAt(tasks, { now, allDayTime }) ?? Infinity, nextSnooze)
    return { settings, due, next: next === Infinity ? null : next }
  })
}
