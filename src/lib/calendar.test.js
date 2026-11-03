import { describe, expect, it } from 'vitest'
import { buildEvents, layoutDay, rangeFor, resolveWeekStart, shiftAnchor } from './calendar.js'
import { buildICS } from './ics.js'
import { normalizeTask } from '../data/models.js'

const task = (fields) => normalizeTask({ id: fields.title, createdAt: 1, ...fields })

describe('ranges', () => {
  it('builds week and month ranges from the chosen first day', () => {
    expect(rangeFor('week', '2026-11-04', 1)).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    expect(rangeFor('week', '2026-11-04', 0)).toMatchObject({ from: '2026-11-01', to: '2026-11-07' })
    const month = rangeFor('month', '2026-11-18', 1)
    expect(month.from).toBe('2026-10-26')
    expect(month.days).toHaveLength(42)
  })

  it('moves by a view at a time', () => {
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftAnchor('week', '2026-11-04', -1)).toBe('2026-10-28')
  })

  it('reads the week start setting', () => {
    expect(resolveWeekStart('sunday')).toBe(0)
    expect(resolveWeekStart('monday')).toBe(1)
    expect([0, 1, 6]).toContain(resolveWeekStart('auto', 'en-US'))
  })
})

describe('buildEvents', () => {
  it('expands repeating tasks; only the current occurrence is real', () => {
    const events = buildEvents(
      [task({ title: 'Gym', dueDate: '2026-11-03', startTime: '07:00', recurrence: { freq: 'daily' } })],
      '2026-11-02',
      '2026-11-05'
    )
    expect(events.map((e) => [e.date, e.virtual])).toEqual([
      ['2026-11-03', false],
      ['2026-11-04', true],
      ['2026-11-05', true],
    ])
    expect(events[0]).toMatchObject({ start: 420, end: 450, allDay: false })
  })

  it('treats a date without a time as all-day', () => {
    const [event] = buildEvents([task({ title: 'Bills', dueDate: '2026-11-03' })], '2026-11-01', '2026-11-30')
    expect(event.allDay).toBe(true)
  })
})

describe('layoutDay', () => {
  const ev = (title, start, end, done = false) => ({ key: title, start, end, allDay: false, done })

  it('puts overlapping items side by side and flags the clash', () => {
    const layout = layoutDay([ev('a', 540, 600), ev('b', 570, 630), ev('c', 660, 720)])
    const byKey = Object.fromEntries(layout.map((p) => [p.event.key, p]))
    expect(byKey.a).toMatchObject({ col: 0, cols: 2, conflict: true })
    expect(byKey.b).toMatchObject({ col: 1, cols: 2, conflict: true })
    expect(byKey.c).toMatchObject({ col: 0, cols: 1, conflict: false })
  })

  it('back-to-back items do not clash, and done items never do', () => {
    const layout = layoutDay([ev('a', 540, 600), ev('b', 600, 660), ev('c', 610, 620, true)])
    expect(layout.filter((p) => p.conflict)).toEqual([])
  })
})

describe('buildICS', () => {
  it('writes timed, all-day and repeating events', () => {
    const ics = buildICS(
      [
        task({ title: 'Stand-up, daily', dueDate: '2026-11-03', startTime: '09:00', endTime: '09:15', recurrence: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] } }),
        task({ title: 'Pay rent', dueDate: '2026-12-01' }),
        task({ title: 'Done already', dueDate: '2026-11-03', status: 'done' }),
      ],
      new Date('2026-11-03T08:00:00Z')
    )
    expect(ics).toContain('SUMMARY:Stand-up\\, daily')
    expect(ics).toContain('DTSTART:20261103T090000')
    expect(ics).toContain('DTEND:20261103T091500')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201')
    expect(ics).toContain('DTEND;VALUE=DATE:20261202')
    expect(ics).not.toContain('Done already')
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true)
  })
})
