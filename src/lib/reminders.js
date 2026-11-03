// Reminder rules, kept free of the app store and the browser so the service
// worker can use them too.
//
// A task's reminders are stored as { id, minutes } (that many minutes before
// the task starts) or { id, at: 'YYYY-MM-DDTHH:MM' } (a fixed date and time).
// Times are wall-clock times on the device, so a 9 AM reminder stays at 9 AM
// across daylight saving changes and after travelling to another time zone.

import { nextOccurrence } from './recurrence.js'

export const MINUTE = 60_000
export const DAY = 1440 * MINUTE

// Reminders missed by more than this (device off, browser closed) aren't sent;
// the task shows as overdue in the app instead.
export const MISSED_WINDOW = DAY
// Anything later than this counts as "missed" rather than on time.
const LATE_AFTER = 2 * MINUTE

export const DEFAULT_ALL_DAY_TIME = '09:00'
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 1440]
export const MAX_REMINDERS = 5
const MAX_MINUTES = 60 * 1440

const AT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/

export function normalizeReminders(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const r of value) {
    if (!r || typeof r !== 'object') continue
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID()
    let reminder = null
    if (typeof r.at === 'string' && AT_RE.test(r.at)) reminder = { id, at: r.at }
    else if (Number.isInteger(r.minutes) && r.minutes >= 0 && r.minutes <= MAX_MINUTES) reminder = { id, minutes: r.minutes }
    if (!reminder) continue
    const sig = reminder.at ?? reminder.minutes
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(reminder)
  }
  // Relative reminders, earliest first, then fixed times in date order.
  return out
    .sort((a, b) => (a.at ? 1 : 0) - (b.at ? 1 : 0) || (a.at ? a.at.localeCompare(b.at) : b.minutes - a.minutes))
    .slice(0, MAX_REMINDERS)
}

export const newReminder = (fields) => ({ id: crypto.randomUUID(), ...fields })

/* Labels ----------------------------------------------------------------- */

export function offsetLabel(minutes) {
  if (minutes === 0) return 'At the time'
  const parts = []
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  if (mins) parts.push(`${mins} min`)
  return `${parts.join(' ')} before`
}

// '14:30' → "2:30 PM" or "14:30". timeFormat is the user's setting ('auto' | '12' | '24').
export function clockLabel(time, timeFormat = 'auto') {
  const [h, m] = time.split(':').map(Number)
  const opts = { hour: 'numeric', minute: '2-digit' }
  if (timeFormat !== 'auto') opts.hour12 = timeFormat === '12'
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, opts)
}

export function describeReminder(reminder, { timed = true, allDayTime = DEFAULT_ALL_DAY_TIME, timeFormat } = {}) {
  if (reminder.at) {
    const [date, time] = reminder.at.split('T')
    const day = new Date(`${date}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    return `${day}, ${clockLabel(time, timeFormat)}`
  }
  if (timed) return offsetLabel(reminder.minutes)
  // Tasks without a time remind at a set time of day.
  const total = toMinutesOfDay(allDayTime) - reminder.minutes
  const at = clockLabel(fromMinutesOfDay(total), timeFormat)
  const days = total >= 0 ? 0 : Math.ceil(-total / 1440)
  if (days === 0) return `On the day, ${at}`
  if (days === 1) return `The day before, ${at}`
  return `${days} days before, ${at}`
}

const toMinutesOfDay = (time) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
const fromMinutesOfDay = (total) => {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/* When reminders fire ---------------------------------------------------- */

function localTime(dateKey, time, minusMinutes = 0) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  // The Date constructor does the arithmetic in local wall-clock time.
  return new Date(y, mo - 1, d, h, m - minusMinutes).getTime()
}

const dateKeyOf = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A repeating time block whose day has passed is moved on when the app opens;
// work out where it is now, so reminders are right even before that happens.
export function currentBlockDate(task, today) {
  if (task.kind !== 'block' || !task.recurrence || !task.dueDate || task.dueDate >= today) return task.dueDate
  const next = nextOccurrence({ ...task.recurrence, count: null }, task.dueDate, today)
  return next && (!task.recurrence.endsOn || next <= task.recurrence.endsOn) ? next : task.dueDate
}

// Every reminder a task has, with when it fires and a key that names that one
// firing. The key includes the date and time it was worked out from, so moving
// a task, or a repeating task moving on, sets up fresh reminders.
export function reminderTimes(task, { allDayTime = DEFAULT_ALL_DAY_TIME, today } = {}) {
  if (task.status === 'done' || !task.reminders?.length) return []
  const dueDate = today ? currentBlockDate(task, today) : task.dueDate
  const out = []
  for (const reminder of task.reminders) {
    if (reminder.at) {
      const [date, time] = reminder.at.split('T')
      out.push({ key: `${task.id}|at ${reminder.at}`, at: localTime(date, time), reminder })
    } else if (dueDate) {
      const anchor = task.startTime ?? allDayTime
      out.push({
        key: `${task.id}|${dueDate} ${anchor} -${reminder.minutes}`,
        at: localTime(dueDate, anchor, reminder.minutes),
        reminder,
      })
    }
  }
  return out
}

// Reminders that should be sent now: their time has come, they haven't been
// sent (`fired` holds sent keys), they're no older than the missed window, and
// the task hasn't been edited since (editing means you've seen it).
export function dueReminders(tasks, { now, fired = new Set(), allDayTime, since = now - MISSED_WINDOW }) {
  const today = dateKeyOf(now)
  const due = []
  for (const task of tasks) {
    for (const r of reminderTimes(task, { allDayTime, today })) {
      if (r.at > now || r.at < since || r.at < task.updatedAt || fired.has(r.key)) continue
      due.push({ ...r, task, late: now - r.at > LATE_AFTER })
    }
  }
  // One notification per task: if several of its reminders are due, send the latest.
  const byTask = new Map()
  for (const item of due.sort((a, b) => a.at - b.at)) byTask.set(item.task.id, { ...item, keys: [...(byTask.get(item.task.id)?.keys ?? []), item.key] })
  return [...byTask.values()]
}

export function nextReminderAt(tasks, { now, allDayTime }) {
  const today = dateKeyOf(now)
  let next = Infinity
  for (const task of tasks) for (const r of reminderTimes(task, { allDayTime, today })) if (r.at > now && r.at < next) next = r.at
  return next === Infinity ? null : next
}

/* Notification text ------------------------------------------------------ */

// "Today at 2:30 PM", "Tomorrow", "Fri 7 Nov at 9:00 AM".
export function whenLabel(task, now, timeFormat) {
  if (!task.dueDate) return ''
  const today = dateKeyOf(now)
  const tomorrow = dateKeyOf(new Date(now).setDate(new Date(now).getDate() + 1))
  const yesterday = dateKeyOf(new Date(now).setDate(new Date(now).getDate() - 1))
  const day =
    task.dueDate === today
      ? 'Today'
      : task.dueDate === tomorrow
        ? 'Tomorrow'
        : task.dueDate === yesterday
          ? 'Yesterday'
          : new Date(`${task.dueDate}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return task.startTime ? `${day} at ${clockLabel(task.startTime, timeFormat)}` : day
}

export function reminderBody(item, { now, timeFormat }) {
  const { task } = item
  const parts = []
  const when = whenLabel(task, now, timeFormat)
  if (item.snoozed) parts.push('Snoozed reminder')
  else if (item.late) parts.push(`Missed reminder (${clockLabel(new Date(item.at).toTimeString().slice(0, 5), timeFormat)})`)
  const relative = /^(Today|Tomorrow|Yesterday)/.test(when)
  if (when) parts.push(task.kind === 'block' ? when : `Due ${relative ? when.charAt(0).toLowerCase() + when.slice(1) : when}`)
  if (task.priority === 'urgent' || task.priority === 'high') parts.push(task.priority === 'urgent' ? 'Urgent' : 'High priority')
  return parts.join(' · ')
}
