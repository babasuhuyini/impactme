import { describe, expect, it } from 'vitest'
import { SORTS, dueStatus, extractTags } from './todos.js'
import { normalizeTask } from '../data/models.js'

describe('extractTags', () => {
  it('pulls #tags out of the title', () => {
    expect(extractTags('Call mum #family #Weekend')).toEqual({ title: 'Call mum', tags: ['family', 'weekend'] })
  })

  it('keeps the text when it is only tags', () => {
    expect(extractTags('#idea')).toEqual({ title: '#idea', tags: ['idea'] })
  })
})

describe('dueStatus', () => {
  const today = '2026-11-03'
  it('classifies dates relative to today', () => {
    expect(dueStatus(null, today)).toBeNull()
    expect(dueStatus('2026-11-02', today)).toBe('overdue')
    expect(dueStatus('2026-11-03', today)).toBe('today')
    expect(dueStatus('2026-11-04', today)).toBe('tomorrow')
    expect(dueStatus('2026-11-10', today)).toBe('week')
    expect(dueStatus('2026-11-11', today)).toBe('later')
  })
})

describe('SORTS.priority', () => {
  it('puts urgent first and low last', () => {
    const tasks = ['low', 'normal', 'urgent', 'high'].map((priority, i) =>
      normalizeTask({ id: String(i), title: priority, priority, createdAt: i })
    )
    expect(tasks.sort(SORTS.priority.compare).map((t) => t.priority)).toEqual(['urgent', 'high', 'normal', 'low'])
  })
})
