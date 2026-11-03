import { describe, expect, it } from 'vitest'
import { normalizeEntry, normalizeList, normalizeSettings, normalizeTask } from './models.js'

describe('normalizeTask', () => {
  it('converts a Daybook task to the ImpactMe shape', () => {
    const task = normalizeTask({
      id: 'a',
      text: 'Call mum',
      notes: 'About Sunday',
      due: '2026-11-05',
      priority: 3,
      tags: ['Family', 'family', ''],
      done: true,
      createdAt: 100,
      completedAt: 200,
    })
    expect(task).toMatchObject({
      id: 'a',
      title: 'Call mum',
      description: 'About Sunday',
      dueDate: '2026-11-05',
      priority: 'high',
      tags: ['family'],
      status: 'done',
      completedAt: 200,
      createdAt: 100,
      updatedAt: 100,
      subtasks: [],
      recurrence: null,
    })
  })

  it('maps the old 0–3 priorities', () => {
    const p = (priority) => normalizeTask({ id: 'x', title: 't', priority }).priority
    expect([p(0), p(1), p(2), p(3), p(undefined), p('urgent'), p('bogus')]).toEqual([
      'normal',
      'low',
      'normal',
      'high',
      'normal',
      'urgent',
      'normal',
    ])
  })

  it('rejects records it cannot salvage', () => {
    expect(normalizeTask(null)).toBeNull()
    expect(normalizeTask({ title: 'no id' })).toBeNull()
    expect(normalizeTask({ id: 'x', title: '   ' })).toBeNull()
  })

  it('drops malformed dates and times instead of keeping them', () => {
    const task = normalizeTask({ id: 'x', title: 't', dueDate: '5/11/2026', startTime: '25:00' })
    expect(task.dueDate).toBeNull()
    expect(task.startTime).toBeNull()
  })

  it('clears completedAt on open tasks', () => {
    expect(normalizeTask({ id: 'x', title: 't', status: 'open', completedAt: 5 }).completedAt).toBeNull()
  })
})

describe('normalizeEntry', () => {
  it('reads the first Daybook format ({ id, text, createdAt })', () => {
    const createdAt = new Date(2026, 9, 1, 9, 30).getTime()
    const entry = normalizeEntry({ id: 'e', text: 'Hello', createdAt })
    expect(entry).toMatchObject({ body: 'Hello', date: '2026-10-01', journalId: 'default', favorite: false })
  })

  it('keeps mood and energy only within 1–5', () => {
    expect(normalizeEntry({ id: 'e', mood: 4, energy: 9 })).toMatchObject({ mood: 4, energy: null })
  })
})

describe('normalizeSettings', () => {
  it('fills defaults and rejects unknown values', () => {
    expect(normalizeSettings({ theme: 'neon', name: '  Ama  ', tasksSort: 'priority' })).toMatchObject({
      theme: 'system',
      name: 'Ama',
      tasksSort: 'priority',
      timeFormat: 'auto',
    })
  })
})

describe('normalizeList', () => {
  it('skips invalid records and duplicate ids', () => {
    const { records, skipped } = normalizeList(
      [{ id: 'a', title: 'one' }, { id: 'a', title: 'one again' }, { title: 'no id' }, 'junk'],
      normalizeTask
    )
    expect(records).toHaveLength(1)
    expect(records[0].title).toBe('one again')
    expect(skipped).toBe(3)
  })

  it('treats a non-array as empty', () => {
    expect(normalizeList({ nope: true }, normalizeTask)).toEqual({ records: [], skipped: 0 })
  })
})
