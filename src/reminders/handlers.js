// What a reminder's buttons do. Works on IndexedDB directly, so the service
// worker can run them when no ImpactMe window is open.

import { planCompletion } from '../data/completion.js'
import { normalizeTask } from '../data/models.js'
import { MINUTE } from '../lib/reminders.js'

// Completes the task the reminder was for. Does nothing if the task has since
// been completed, deleted or moved to another date (an old notification
// mustn't tick off the next occurrence of a repeating task).
export function completeFromReminder(db, { taskId, dueDate }, now = Date.now()) {
  return db.transaction('rw', db.tasks, async () => {
    const task = normalizeTask(await db.tasks.get(taskId))
    if (!task || task.status === 'done' || task.kind === 'block' || task.dueDate !== dueDate) return false
    const { copy, updated } = planCompletion(task, now)
    if (copy) await db.tasks.put(normalizeTask(copy))
    await db.tasks.put(normalizeTask(updated))
    return true
  })
}

// One snooze per task; snoozing again replaces it.
export function snoozeReminder(db, taskId, minutes, now = Date.now()) {
  return db.snoozes.put({ taskId, at: now + minutes * MINUTE })
}
