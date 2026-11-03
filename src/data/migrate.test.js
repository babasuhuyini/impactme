import { describe, expect, it } from 'vitest'
import { readLegacy } from './migrate.js'

const fakeStorage = (values) => ({
  getItem: (key) => (key in values ? values[key] : null),
})

describe('readLegacy', () => {
  it('reads Daybook tasks, entries and preferences', () => {
    const storage = fakeStorage({
      'todos.items': JSON.stringify([
        { id: 't1', text: 'Legacy task', done: false },
        { id: 't2', text: 'Done one', done: true, completedAt: 5, priority: 1 },
      ]),
      'journal.entries': JSON.stringify([{ id: 'e1', text: 'First entry', createdAt: 1 }]),
      'ui.theme': JSON.stringify('dark'),
      'todos.sort': JSON.stringify('priority'),
      'todos.showCompleted': 'false',
    })
    const legacy = readLegacy(storage)
    expect(legacy.tasks.map((t) => [t.title, t.status, t.priority])).toEqual([
      ['Legacy task', 'open', 'normal'],
      ['Done one', 'done', 'low'],
    ])
    expect(legacy.journal[0].body).toBe('First entry')
    expect(legacy.settings).toMatchObject({ theme: 'dark', tasksSort: 'priority', tasksShowCompleted: false })
    expect(legacy.skipped).toBe(0)
  })

  it('copes with empty, missing and corrupted storage', () => {
    expect(readLegacy(fakeStorage({}))).toMatchObject({ tasks: [], journal: [], skipped: 0 })
    const corrupted = readLegacy(fakeStorage({ 'todos.items': '{not json', 'journal.entries': '"text"' }))
    expect(corrupted.tasks).toEqual([])
    expect(corrupted.journal).toEqual([])
    expect(corrupted.settings.theme).toBe('system')
  })
})
