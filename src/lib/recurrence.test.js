import { describe, expect, it } from 'vitest'
import {
  describeRule,
  firstOccurrence,
  nextOccurrence,
  normalizeRule,
  occurrencesBetween,
  presetOf,
  ruleFromPreset,
  toRRule,
} from './recurrence.js'
import { addDays, weekday } from './dates.js'

// 2026-11-02 is a Monday.
const rule = (raw, start = '2026-11-02') => normalizeRule(raw, start)

describe('nextOccurrence', () => {
  it('daily, and every 3 days', () => {
    expect(nextOccurrence(rule({ freq: 'daily' }), '2026-11-02')).toBe('2026-11-03')
    expect(nextOccurrence(rule({ freq: 'daily', interval: 3 }), '2026-11-02')).toBe('2026-11-05')
  })

  it('weekdays skip the weekend', () => {
    const weekdays = ruleFromPreset('weekdays', '2026-11-02')
    expect(nextOccurrence(weekdays, '2026-11-06')).toBe('2026-11-09') // Fri → Mon
  })

  it('weekends', () => {
    expect(nextOccurrence(ruleFromPreset('weekends', '2026-11-07'), '2026-11-07')).toBe('2026-11-08')
    expect(nextOccurrence(ruleFromPreset('weekends', '2026-11-07'), '2026-11-08')).toBe('2026-11-14')
  })

  it('every 2 weeks on Monday and Wednesday', () => {
    const r = rule({ freq: 'weekly', interval: 2, weekdays: [1, 3] })
    expect(nextOccurrence(r, '2026-11-02')).toBe('2026-11-04')
    expect(nextOccurrence(r, '2026-11-04')).toBe('2026-11-16')
  })

  it('monthly on the 31st falls back to the last day', () => {
    const r = rule({ freq: 'monthly', monthDay: 31 }, '2026-01-31')
    expect(nextOccurrence(r, '2026-01-31')).toBe('2026-02-28')
    expect(nextOccurrence(r, '2026-02-28')).toBe('2026-03-31')
    expect(nextOccurrence(r, '2026-03-31')).toBe('2026-04-30')
  })

  it('yearly on 29 February uses the 28th in other years', () => {
    const r = rule({ freq: 'yearly' }, '2028-02-29')
    expect(nextOccurrence(r, '2028-02-29')).toBe('2029-02-28')
  })

  it('stops at the end date', () => {
    const r = rule({ freq: 'daily', endsOn: '2026-11-03' })
    expect(nextOccurrence(r, '2026-11-02')).toBe('2026-11-03')
    expect(nextOccurrence(r, '2026-11-03')).toBeNull()
  })

  it('stops after the set number of times', () => {
    const r = rule({ freq: 'daily', count: 3, completed: 2 })
    expect(nextOccurrence(r, '2026-11-04')).toBeNull()
    expect(nextOccurrence({ ...r, completed: 1 }, '2026-11-03')).toBe('2026-11-04')
  })

  it('can skip ahead to today for an overdue series', () => {
    expect(nextOccurrence(rule({ freq: 'daily' }), '2026-11-02', '2026-11-10')).toBe('2026-11-10')
  })
})

describe('firstOccurrence', () => {
  it('finds the next matching day from today', () => {
    const r = rule({ freq: 'monthly', monthDay: 1 }, '2026-11-03')
    expect(firstOccurrence(r, '2026-11-03')).toBe('2026-12-01')
  })
})

describe('occurrencesBetween', () => {
  it('lists the dates a series lands on in a range', () => {
    const r = ruleFromPreset('weekdays', '2026-11-02')
    expect(occurrencesBetween(r, '2026-11-05', '2026-11-02', '2026-11-10')).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
    ])
  })

  it('respects the remaining count', () => {
    const r = rule({ freq: 'daily', count: 5, completed: 3 })
    expect(occurrencesBetween(r, '2026-11-05', '2026-11-01', '2026-11-30')).toEqual(['2026-11-05', '2026-11-06'])
  })
})

describe('presets and descriptions', () => {
  it('round-trips presets', () => {
    for (const preset of ['daily', 'weekdays', 'weekends', 'weekly', 'monthly', 'yearly']) {
      expect(presetOf(ruleFromPreset(preset, '2026-11-02'))).toBe(preset)
    }
    expect(presetOf(null)).toBe('none')
    expect(presetOf(rule({ freq: 'daily', interval: 2 }))).toBe('custom')
  })

  it('describes rules in plain words', () => {
    expect(describeRule(ruleFromPreset('weekdays', '2026-11-02'))).toBe('Every weekday')
    expect(describeRule(rule({ freq: 'weekly' }))).toBe('Every Monday')
    expect(describeRule(rule({ freq: 'weekly', interval: 2, weekdays: [1, 3] }))).toBe('Every 2 weeks on Mon, Wed')
    expect(describeRule(rule({ freq: 'monthly', monthDay: 1 }))).toBe('Every month on the 1st')
    expect(describeRule(rule({ freq: 'daily', count: 10 }))).toBe('Every day, 10 times')
  })

  it('exports iCalendar rules', () => {
    expect(toRRule(ruleFromPreset('weekdays', '2026-11-02'))).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(toRRule(rule({ freq: 'monthly', monthDay: 31 }))).toBe('FREQ=MONTHLY;BYMONTHDAY=-1')
    expect(toRRule(rule({ freq: 'daily', interval: 2, endsOn: '2026-12-31' }))).toBe('FREQ=DAILY;INTERVAL=2;UNTIL=20261231')
  })
})

describe('date helpers across daylight saving', () => {
  it('adds days without drifting', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27')
    expect(weekday('2026-11-02')).toBe(1)
  })
})
