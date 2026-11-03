// Turns tasks into calendar events and lays them out.
//
// Events come from one function (buildEvents) so another source, such as a
// connected Google Calendar in a later version, can be merged in the same shape.

import { addDays, fromMinutes, startOfMonth, startOfWeek, toMinutes, weekday } from './dates.js'
import { occurrencesBetween } from './recurrence.js'

export const DEFAULT_DURATION = 30 // minutes, for a task with a start time but no end

// 0 = Sunday, 1 = Monday. 'auto' follows the device's region where the browser can tell.
export function resolveWeekStart(setting, locale = globalThis.navigator?.language) {
  if (setting === 'sunday') return 0
  if (setting === 'monday') return 1
  try {
    const info = new Intl.Locale(locale).getWeekInfo?.() ?? new Intl.Locale(locale).weekInfo
    if (info?.firstDay) return info.firstDay % 7
  } catch {
    // Older browsers: fall through to Monday.
  }
  return 1
}

export function rangeFor(view, anchor, weekStart) {
  switch (view) {
    case 'day':
      return { from: anchor, to: anchor, days: [anchor] }
    case 'week': {
      const from = startOfWeek(anchor, weekStart)
      const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
      return { from, to: days[6], days }
    }
    case 'month': {
      const from = startOfWeek(startOfMonth(anchor), weekStart)
      const days = Array.from({ length: 42 }, (_, i) => addDays(from, i))
      return { from, to: days[41], days }
    }
    default: {
      const days = Array.from({ length: 30 }, (_, i) => addDays(anchor, i))
      return { from: anchor, to: days[29], days }
    }
  }
}

export function shiftAnchor(view, anchor, direction) {
  if (view === 'day') return addDays(anchor, direction)
  if (view === 'week') return addDays(anchor, direction * 7)
  if (view === 'agenda') return addDays(anchor, direction * 30)
  const [y, m] = anchor.split('-').map(Number)
  const total = y * 12 + (m - 1) + direction
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

// Events for every dated task in [from, to], repeating tasks expanded into each
// occurrence. Only a series' current occurrence is "real"; later ones are previews.
export function buildEvents(tasks, from, to) {
  const events = []
  for (const task of tasks) {
    if (!task.dueDate) continue
    const dates =
      task.recurrence && task.status !== 'done'
        ? occurrencesBetween(task.recurrence, task.dueDate, from, to)
        : task.dueDate >= from && task.dueDate <= to
          ? [task.dueDate]
          : []
    for (const date of dates) {
      const start = task.startTime ? toMinutes(task.startTime) : null
      events.push({
        key: `${task.id}:${date}`,
        task,
        date,
        allDay: start == null,
        start,
        end: start == null ? null : task.endTime ? toMinutes(task.endTime) : Math.min(start + DEFAULT_DURATION, 24 * 60),
        virtual: date !== task.dueDate,
        done: task.status === 'done',
      })
    }
  }
  return events
}

// Places one day's timed events side by side where they overlap. Each event
// gets a column within its cluster and is flagged when it overlaps another.
export function layoutDay(events) {
  const timed = events.filter((e) => !e.allDay).sort((a, b) => a.start - b.start || b.end - a.end)
  const placed = []
  let cluster = []
  let clusterEnd = -1

  const closeCluster = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1))
    cluster.forEach((p) => (p.cols = cols))
    cluster = []
  }

  for (const event of timed) {
    if (event.start >= clusterEnd) {
      closeCluster()
      clusterEnd = -1
    }
    const used = new Set(cluster.filter((p) => p.event.end > event.start).map((p) => p.col))
    let col = 0
    while (used.has(col)) col++
    const item = { event, col, cols: 1 }
    cluster.push(item)
    placed.push(item)
    clusterEnd = Math.max(clusterEnd, event.end)
  }
  closeCluster()

  // Two open items overlap when their times intersect; done items don't count.
  for (const item of placed) {
    const e = item.event
    item.conflict =
      !e.done && placed.some((o) => o !== item && !o.event.done && o.event.start < e.end && e.start < o.event.end)
  }
  return placed
}

export const countConflicts = (events, days) =>
  days.reduce((sum, day) => sum + layoutDay(events.filter((e) => e.date === day)).filter((p) => p.conflict).length, 0)

export const isWeekend = (key) => [0, 6].includes(weekday(key))

export const minutesLabel = (minutes) => fromMinutes(minutes)
