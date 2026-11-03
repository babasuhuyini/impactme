import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './parse.js'
import { describeRule } from './recurrence.js'

// Tuesday 3 November 2026, 10:00
const now = new Date(2026, 10, 3, 10, 0)
const parse = (text, ignore) => parseQuickAdd(text, { now, ignore })

describe('parseQuickAdd: the examples from the brief', () => {
  it('Submit report tomorrow at 9 AM', () => {
    expect(parse('Submit report tomorrow at 9 AM')).toMatchObject({
      title: 'Submit report',
      dueDate: '2026-11-04',
      startTime: '09:00',
      recurrence: null,
    })
  })

  it('Call John Friday at 2 PM', () => {
    expect(parse('Call John Friday at 2 PM')).toMatchObject({ title: 'Call John', dueDate: '2026-11-06', startTime: '14:00' })
  })

  it('Pay rent every month on the 1st', () => {
    const r = parse('Pay rent every month on the 1st')
    expect(r).toMatchObject({ title: 'Pay rent', dueDate: '2026-12-01' })
    expect(r.recurrence).toMatchObject({ freq: 'monthly', monthDay: 1, start: '2026-12-01' })
    expect(describeRule(r.recurrence)).toBe('Every month on the 1st')
  })

  it('Study every weekday at 7 PM', () => {
    const r = parse('Study every weekday at 7 PM')
    expect(r).toMatchObject({ title: 'Study', dueDate: '2026-11-03', startTime: '19:00' })
    expect(describeRule(r.recurrence)).toBe('Every weekday')
  })
})

describe('parseQuickAdd: dates', () => {
  const due = (text) => parse(text).dueDate
  it('understands relative days', () => {
    expect(due('x today')).toBe('2026-11-03')
    expect(due('x tonight')).toBe('2026-11-03')
    expect(due('x day after tomorrow')).toBe('2026-11-05')
    expect(due('x in 3 days')).toBe('2026-11-06')
    expect(due('x in two weeks')).toBe('2026-11-17')
    expect(due('x in a month')).toBe('2026-12-03')
    expect(due('x next week')).toBe('2026-11-09')
    expect(due('x next month')).toBe('2026-12-01')
    expect(due('x this weekend')).toBe('2026-11-07')
  })

  it('understands weekday names', () => {
    expect(due('x on tue')).toBe('2026-11-03') // today is Tuesday
    expect(due('x next tuesday')).toBe('2026-11-10')
    expect(due('x monday')).toBe('2026-11-09')
  })

  it('understands written dates, rolling past ones into next year', () => {
    expect(due('x Nov 12')).toBe('2026-11-12')
    expect(due('x on 12th November')).toBe('2026-11-12')
    expect(due('x 5 Jan')).toBe('2027-01-05')
    expect(due('x March 3, 2027')).toBe('2027-03-03')
    expect(due('x 2026-12-25')).toBe('2026-12-25')
    expect(due('x by the 20th')).toBe('2026-11-20')
    expect(due('x the 2nd')).toBe('2026-12-02')
  })

  it('ignores impossible dates', () => {
    expect(parse('x Feb 30').dueDate).toBeNull()
  })
})

describe('parseQuickAdd: times', () => {
  it('reads times with and without am/pm', () => {
    expect(parse('x at 9').startTime).toBe('09:00')
    expect(parse('x at 5').startTime).toBe('17:00')
    expect(parse('x 7:30pm').startTime).toBe('19:30')
    expect(parse('x 14:30').startTime).toBe('14:30')
    expect(parse('x at noon').startTime).toBe('12:00')
    expect(parse('x 12am').startTime).toBe('00:00')
  })

  it('reads ranges', () => {
    expect(parse('Gym 6-7pm')).toMatchObject({ title: 'Gym', startTime: '18:00', endTime: '19:00' })
    expect(parse('Meeting 10:30-11:15 tomorrow')).toMatchObject({ startTime: '10:30', endTime: '11:15', dueDate: '2026-11-04' })
    expect(parse('Workshop from 9 to 12')).toMatchObject({ startTime: '09:00', endTime: '12:00' })
  })

  it('a time without a date means today', () => {
    expect(parse('Call at 3pm').dueDate).toBe('2026-11-03')
  })

  it('leaves quantities alone', () => {
    expect(parse('Read 2-3 chapters')).toMatchObject({ title: 'Read 2-3 chapters', startTime: null, dueDate: null })
    expect(parse('Buy 12 eggs')).toMatchObject({ title: 'Buy 12 eggs', startTime: null })
  })
})

describe('parseQuickAdd: repeats', () => {
  const repeat = (text) => describeRule(parse(text).recurrence)
  it('reads common repeat phrases', () => {
    expect(repeat('x every day')).toBe('Every day')
    expect(repeat('x daily')).toBe('Every day')
    expect(repeat('x every other week')).toBe('Every 2 weeks on Tue')
    expect(repeat('x every 3 days')).toBe('Every 3 days')
    expect(repeat('x every mon and wed')).toBe('Every week on Mon, Wed')
    expect(repeat('x every friday')).toBe('Every Friday')
    expect(repeat('x every weekend')).toBe('Every weekend')
    expect(repeat('x yearly')).toMatch(/^Every year on/)
  })

  it('starts on the first matching day', () => {
    expect(parse('Team call every friday at 10').dueDate).toBe('2026-11-06')
  })

  it('reads an end date or count', () => {
    expect(parse('x every day until Dec 1').recurrence.endsOn).toBe('2026-12-01')
    expect(parse('x every day for 10 times').recurrence.count).toBe(10)
  })
})

describe('parseQuickAdd: tags, priority and corrections', () => {
  it('reads tags and priority', () => {
    expect(parse('Fix bug #work #urgent-ish !high tomorrow')).toMatchObject({
      title: 'Fix bug',
      tags: ['work', 'urgent-ish'],
      priority: 'high',
      dueDate: '2026-11-04',
    })
    expect(parse('Call bank !!!').priority).toBe('urgent')
  })

  it('keeps words the user said not to read', () => {
    const r = parse('Meet Friday at 2 PM', ['date'])
    expect(r).toMatchObject({ title: 'Meet Friday', startTime: '14:00', dueDate: '2026-11-03' })
    expect(r.found).toEqual(['time'])
  })

  it('never returns an empty title', () => {
    expect(parse('tomorrow').title).toBe('tomorrow')
  })

  it('reports what it found', () => {
    expect(parse('Plain task').found).toEqual([])
    expect(parse('Run every day at 6am #health').found.sort()).toEqual(['date', 'repeat', 'tags', 'time'].filter((k) => k !== 'date'))
  })
})
