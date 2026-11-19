// What a reminder's buttons do. Works on IndexedDB directly, so the service
// worker can run them when no ImpactMe window is open.

import { planCompletion } from '../data/completion.js'
import { normalizeTask } from '../data/models.js'
import { MINUTE } from '../lib/reminders.js'
import { queueChanges } from '../data/syncQueue.js'

// Completes the task the reminder was for. Does nothing if the task has since
// been completed, deleted or moved to another date (an old notification
// mustn't tick off the next occurrence of a repeating task). The change is
// queued for sync in the same transaction; the app pushes it when it next runs.
export function completeFromReminder(db, { taskId, dueDate }, now = Date.now()) {
  return db.transaction('rw', db.tasks, db.kv, db.syncQueue, async () => {
    const task = normalizeTask(await db.tasks.get(taskId))
    if (!task || task.status === 'done' || task.kind === 'block' || task.dueDate !== dueDate) return false
    const { copy, updated } = planCompletion(task, now)
    if (copy) await db.tasks.put(normalizeTask(copy))
    await db.tasks.put(normalizeTask(updated))
    await queueChanges(db, [
      ...(copy ? [{ table: 'tasks', id: copy.id, op: 'put' }] : []),
      { table: 'tasks', id: updated.id, op: 'put' },
    ])
    return true
  })
}

// One snooze per task; snoozing again replaces it.
export function snoozeReminder(db, taskId, minutes, now = Date.now()) {
  return db.snoozes.put({ taskId, at: now + minutes * MINUTE })
}
