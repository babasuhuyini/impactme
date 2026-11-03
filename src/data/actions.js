// Task operations shared by every screen. Each returns an undo function where
// undoing makes sense, so callers can offer "Undo" in a toast.

import { tasks, projects } from './store.js'
import { createProject, createTask, newId } from './models.js'
import { toDateKey } from '../lib/dates.js'
import { nextOccurrence } from '../lib/recurrence.js'

export const addTask = (fields) => tasks.put(createTask({ order: Date.now(), ...fields }))

// Completing a repeating task keeps a completed copy (so history and insights
// count every occurrence) and moves the task itself on to its next date.
// When the series has ended, the task itself is completed.
export function completeTask(task, now = Date.now()) {
  const before = tasks.get(task.id)
  if (!before || before.status === 'done') return () => {}

  if (before.recurrence && before.dueDate) {
    const rule = before.recurrence
    const next = nextOccurrence(rule, before.dueDate, toDateKey(new Date(now)))
    const copy = tasks.put({
      ...before,
      id: newId(),
      status: 'done',
      completedAt: now,
      recurrence: null,
      seriesId: before.id,
      createdAt: now,
      updatedAt: now,
    })
    const advancedRule = { ...rule, completed: rule.completed + 1 }
    if (next) {
      tasks.update(before.id, {
        dueDate: next,
        recurrence: advancedRule,
        subtasks: before.subtasks.map((s) => ({ ...s, done: false })),
      })
    } else {
      tasks.update(before.id, { status: 'done', completedAt: now, recurrence: advancedRule })
    }
    return () => {
      tasks.remove(copy.id)
      tasks.put(before)
    }
  }

  tasks.update(before.id, { status: 'done', completedAt: now })
  return () => tasks.put(before)
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
// is moved on to its next date once its day has passed.
export function rollForwardBlocks(today = toDateKey()) {
  for (const task of tasks.all()) {
    if (task.kind !== 'block' || !task.recurrence || !task.dueDate || task.dueDate >= today) continue
    const next = nextOccurrence({ ...task.recurrence, count: null }, task.dueDate, today)
    if (next && (!task.recurrence.endsOn || next <= task.recurrence.endsOn)) tasks.update(task.id, { dueDate: next })
  }
}
