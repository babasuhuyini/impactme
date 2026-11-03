import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { tasks, projects, flush, initStore } from './store.js'
import { addProject, addTask, completeTask, deleteProject, duplicateTask, reopenTask } from './actions.js'
import { normalizeRule } from '../lib/recurrence.js'
import { db } from './db.js'

const NOW = new Date(2026, 10, 3, 9, 0).getTime() // Tue 3 Nov 2026

beforeEach(async () => {
  globalThis.document ??= { addEventListener() {}, visibilityState: 'visible' }
  globalThis.addEventListener ??= () => {}
  await initStore()
  tasks.remove(tasks.all().map((t) => t.id))
  projects.remove(projects.all().map((p) => p.id))
  await flush()
})

describe('completeTask', () => {
  it('completes a one-off task, and undo reopens it', () => {
    const task = addTask({ title: 'One-off' })
    const undo = completeTask(task, NOW)
    expect(tasks.get(task.id)).toMatchObject({ status: 'done', completedAt: NOW })
    undo()
    expect(tasks.get(task.id)).toMatchObject({ status: 'open', completedAt: null })
  })

  it('moves a repeating task to its next date and keeps a completed copy', () => {
    const task = addTask({
      title: 'Stand-up',
      dueDate: '2026-11-03',
      recurrence: normalizeRule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }, '2026-11-03'),
      subtasks: [{ id: 's', title: 'Notes', done: true }],
    })
    completeTask(task, NOW)

    const series = tasks.get(task.id)
    expect(series).toMatchObject({ status: 'open', dueDate: '2026-11-04' })
    expect(series.recurrence.completed).toBe(1)
    expect(series.subtasks[0].done).toBe(false)

    const copies = tasks.all().filter((t) => t.seriesId === task.id)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ status: 'done', dueDate: '2026-11-03', recurrence: null, completedAt: NOW })
  })

  it('jumps an overdue repeating task forward to today, not into the past', () => {
    const task = addTask({ title: 'Water plants', dueDate: '2026-10-28', recurrence: { freq: 'daily' } })
    completeTask(task, NOW)
    expect(tasks.get(task.id).dueDate).toBe('2026-11-03')
  })

  it('finishes the series after its last occurrence', () => {
    const task = addTask({ title: 'Course', dueDate: '2026-11-03', recurrence: { freq: 'daily', count: 2, completed: 1 } })
    completeTask(task, NOW)
    expect(tasks.get(task.id).status).toBe('done')
    expect(tasks.all().filter((t) => t.seriesId === task.id)).toHaveLength(1)
  })

  it('undo restores the series and removes the copy', () => {
    const task = addTask({ title: 'Gym', dueDate: '2026-11-03', recurrence: { freq: 'daily' } })
    const undo = completeTask(task, NOW)
    undo()
    expect(tasks.get(task.id).dueDate).toBe('2026-11-03')
    expect(tasks.all()).toHaveLength(1)
  })

  it('reopen and duplicate', () => {
    const task = addTask({ title: 'Report', subtasks: [{ id: 'a', title: 'Draft', done: true }] })
    completeTask(task, NOW)
    reopenTask(task)
    expect(tasks.get(task.id).status).toBe('open')
    const copy = duplicateTask(tasks.get(task.id))
    expect(copy.id).not.toBe(task.id)
    expect(copy.subtasks[0]).toMatchObject({ title: 'Draft', done: false })
  })
})

describe('projects', () => {
  it('deleting a project moves its tasks to the Inbox, and undo puts them back', async () => {
    const project = addProject({ name: 'Home' })
    const task = addTask({ title: 'Fix tap', projectId: project.id })
    const undo = deleteProject(project.id)
    expect(projects.get(project.id)).toBeNull()
    expect(tasks.get(task.id).projectId).toBeNull()
    undo()
    expect(tasks.get(task.id).projectId).toBe(project.id)

    // And it really is saved.
    await flush()
    expect((await db.tasks.get(task.id)).projectId).toBe(project.id)
    expect(await db.projects.get(project.id)).toBeTruthy()
  })
})
