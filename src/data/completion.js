// What completing a task changes, worked out without touching storage, so the
// app and the service worker (a notification's "Mark done") do exactly the same.

import { newId } from './models.js'
import { toDateKey } from '../lib/dates.js'
import { nextOccurrence } from '../lib/recurrence.js'

// Completing a repeating task keeps a completed copy (so history and insights
// count every occurrence) and moves the task itself on to its next date.
// When the series has ended, the task itself is completed.
// Returns { copy, updated }: a new record to add (or null) and the task's new state.
export function planCompletion(task, now = Date.now()) {
  if (task.recurrence && task.dueDate) {
    const rule = task.recurrence
    const next = nextOccurrence(rule, task.dueDate, toDateKey(new Date(now)))
    const copy = {
      ...task,
      id: newId(),
      status: 'done',
      completedAt: now,
      recurrence: null,
      seriesId: task.id,
      createdAt: now,
      updatedAt: now,
    }
    const recurrence = { ...rule, completed: rule.completed + 1 }
    const updated = next
      ? { ...task, dueDate: next, recurrence, subtasks: task.subtasks.map((s) => ({ ...s, done: false })), updatedAt: now }
      : { ...task, status: 'done', completedAt: now, recurrence, updatedAt: now }
    return { copy, updated }
  }
  return { copy: null, updated: { ...task, status: 'done', completedAt: now, updatedAt: now } }
}
