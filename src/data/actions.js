// Task operations shared by every screen. Each returns an undo function where
// undoing makes sense, so callers can offer "Undo" in a toast.

import { getSettings, tasks, projects } from './store.js'
import { createProject, createTask, newId } from './models.js'
import { planCompletion } from './completion.js'
import { toDateKey } from '../lib/dates.js'
import { currentBlockDate, newReminder } from '../lib/reminders.js'

// New tasks with a time get the default reminder from Settings, unless the
// caller chose reminders itself (the task editor always does).
export function addTask(fields) {
  const { defaultReminder } = getSettings()
  const reminders =
    fields.reminders ?? (fields.startTime && defaultReminder != null ? [newReminder({ minutes: defaultReminder })] : [])
  return tasks.put(createTask({ order: Date.now(), ...fields, reminders }))
}

// See planCompletion: a repeating task keeps a completed copy and moves on to its next date.
export function completeTask(task, now = Date.now()) {
  const before = tasks.get(task.id)
  if (!before || before.status === 'done') return () => {}
  const { copy, updated } = planCompletion(before, now)
  if (copy) tasks.put(copy)
  tasks.put(updated)
  return () => {
    if (copy) tasks.remove(copy.id)
    tasks.put(before)
  }
}

export function reopenTask(task) {
  const before = tasks.get(task.id)
  if (!before) return () => {}
  tasks.update(before.id, { status: 'open', completedAt: null })
  return () => tasks.put(before)
}

export function duplicateTask(task) {
  const now = Date.now()
  return tasks.put({
    ...task,
    id: newId(),
    status: 'open',
    completedAt: null,
    seriesId: null,
    subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
    recurrence: task.recurrence ? { ...task.recurrence, completed: 0 } : null,
    order: task.order + 0.5,
    createdAt: now,
    updatedAt: now,
  })
}

export function deleteTasks(ids) {
  const removed = tasks.remove(ids)
  return () => removed.forEach(tasks.put)
}

export function completeTasks(list) {
  const undos = list.map((t) => completeTask(t))
  return () => undos.reverse().forEach((undo) => undo())
}

export function moveTasks(ids, projectId) {
  const before = ids.map((id) => tasks.get(id)).filter(Boolean)
  before.forEach((t) => tasks.update(t.id, { projectId }))
  return () => before.forEach(tasks.put)
}

// Moves a task to sit between two neighbours in manual order.
export function placeTask(id, beforeTask, afterTask) {
  const low = beforeTask?.order ?? (afterTask ? afterTask.order - 1 : Date.now())
  const high = afterTask?.order ?? low + 2
  tasks.update(id, { order: (low + high) / 2 })
}

export function toggleSubtask(task, subtaskId) {
  tasks.update(task.id, {
    subtasks: task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
  })
}

/* Projects --------------------------------------------------------------- */

export const addProject = (fields) => projects.put(createProject({ order: Date.now(), ...fields }))

// Deleting a project keeps its tasks: they move to the Inbox.
export function deleteProject(id) {
  const project = projects.get(id)
  const moved = tasks.all().filter((t) => t.projectId === id)
  moved.forEach((t) => tasks.update(t.id, { projectId: null }))
  projects.remove(id)
  return () => {
    projects.put(project)
    moved.forEach(tasks.put)
  }
}

// Time blocks aren't ticked off, so a repeating block (e.g. lunch every weekday)
// is moved on to its next date once its day has passed. This isn't an edit by
// you, so the block keeps its last-edited time (a reminder you missed while the
// app was closed can still be shown).
export function rollForwardBlocks(today = toDateKey()) {
  for (const task of tasks.all()) {
    const next = currentBlockDate(task, today)
    if (next !== task.dueDate) tasks.put({ ...task, dueDate: next })
  }
}
