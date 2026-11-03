// Repeat rules for tasks.
//
// rule = {
//   freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
//   interval: 1,            // every N days/weeks/months/years
//   weekdays: [1, 3],       // weekly only; 0 = Sunday
//   monthDay: 15,           // monthly only; 29–31 fall back to the month's last day
//   start: 'YYYY-MM-DD',    // the series' first date, which anchors intervals and yearly dates
//   endsOn: null,           // last allowed date, or null
//   count: null,            // total occurrences, or null
//   completed: 0,           // occurrences already completed (for count)
// }

import { addDays, daysBetween, daysInMonth, parseDateKey, startOfWeek, weekday } from './dates.js'

const FREQS = ['daily', 'weekly', 'monthly', 'yearly']
const SEARCH_LIMIT = 3700 // a little over ten years of days

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const posInt = (value, fallback, max = 999) =>
  Number.isInteger(value) && value >= 1 ? Math.min(value, max) : fallback

// Coerces stored or parsed data into a valid rule, or null.
export function normalizeRule(raw, fallbackStart) {
  if (!raw || typeof raw !== 'object' || !FREQS.includes(raw.freq)) return null
  const start = DATE_RE.test(raw.start) ? raw.start : fallbackStart
  if (!start) return null
  const rule = {
    freq: raw.freq,
    interval: posInt(raw.interval, 1, 365),
    weekdays: [],
    monthDay: null,
    start,
    endsOn: DATE_RE.test(raw.endsOn) ? raw.endsOn : null,
    count: posInt(raw.count, null),
    completed: Number.isInteger(raw.completed) && raw.completed > 0 ? raw.completed : 0,
  }
  if (rule.freq === 'weekly') {
    const days = Array.isArray(raw.weekdays) ? raw.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : []
    rule.weekdays = days.length ? [...new Set(days)].sort() : [weekday(start)]
  }
  if (rule.freq === 'monthly') rule.monthDay = posInt(raw.monthDay, parseDateKey(start).getDate(), 31)
  return rule
}

const [y, m, d] = [(k) => +k.slice(0, 4), (k) => +k.slice(5, 7), (k) => +k.slice(8, 10)]

// Does the rule produce an occurrence on this date? (Ignores endsOn/count.)
export function occursOn(rule, key) {
  if (key < rule.start) return false
  switch (rule.freq) {
    case 'daily':
      return daysBetween(rule.start, key) % rule.interval === 0
    case 'weekly': {
      if (!rule.weekdays.includes(weekday(key))) return false
      const weeks = daysBetween(startOfWeek(rule.start, 1), startOfWeek(key, 1)) / 7
      return weeks % rule.interval === 0
    }
    case 'monthly': {
      const months = (y(key) - y(rule.start)) * 12 + (m(key) - m(rule.start))
      return months % rule.interval === 0 && d(key) === Math.min(rule.monthDay, daysInMonth(y(key), m(key)))
    }
    case 'yearly': {
      const years = y(key) - y(rule.start)
      const day = Math.min(d(rule.start), daysInMonth(y(key), m(rule.start)))
      return years % rule.interval === 0 && m(key) === m(rule.start) && d(key) === day
    }
    default:
      return false
  }
}

// The first occurrence strictly after `afterKey` (and not before `notBefore`),
// or null when the series has ended.
export function nextOccurrence(rule, afterKey, notBefore = null) {
  if (rule.count && rule.completed + 1 >= rule.count) return null
  let key = addDays(afterKey, 1)
  if (notBefore && key < notBefore) key = notBefore
  if (key < rule.start) key = rule.start
  for (let i = 0; i < SEARCH_LIMIT; i++, key = addDays(key, 1)) {
    if (rule.endsOn && key > rule.endsOn) return null
    if (occursOn(rule, key)) return key
  }
  return null
}

// The first occurrence on or after `fromKey`, used to give a new repeating task its date.
export function firstOccurrence(rule, fromKey) {
  return nextOccurrence({ ...rule, count: null }, addDays(fromKey, -1))
}

// Occurrence dates in [from, to] for a series whose current open date is `dueDate`.
export function occurrencesBetween(rule, dueDate, from, to) {
  const dates = []
  const remaining = rule.count ? rule.count - rule.completed : Infinity
  let key = dueDate
  for (let n = 0; key && key <= to && n < remaining && dates.length < 400; n++) {
    if (key >= from) dates.push(key)
    key = nextOccurrence({ ...rule, count: null }, key)
    if (key && rule.endsOn && key > rule.endsOn) break
  }
  return dates
}

/* Presets for the repeat menu ------------------------------------------- */

export const PRESETS = [
  ['none', 'Doesn’t repeat'],
  ['daily', 'Every day'],
  ['weekdays', 'Every weekday (Mon–Fri)'],
  ['weekends', 'Every weekend (Sat–Sun)'],
  ['weekly', 'Every week'],
  ['monthly', 'Every month'],
  ['yearly', 'Every year'],
  ['custom', 'Custom…'],
]

export function ruleFromPreset(preset, start) {
  switch (preset) {
    case 'daily':
      return normalizeRule({ freq: 'daily' }, start)
    case 'weekdays':
      return normalizeRule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }, start)
    case 'weekends':
      return normalizeRule({ freq: 'weekly', weekdays: [0, 6] }, start)
    case 'weekly':
    case 'monthly':
    case 'yearly':
    case 'custom':
      return normalizeRule({ freq: preset === 'custom' ? 'weekly' : preset }, start)
    default:
      return null
  }
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

export function presetOf(rule) {
  if (!rule) return 'none'
  const plain = rule.interval === 1 && !rule.endsOn && !rule.count
  if (!plain) return 'custom'
  if (rule.freq === 'daily') return 'daily'
  if (rule.freq === 'weekly') {
    if (same(rule.weekdays, [1, 2, 3, 4, 5])) return 'weekdays'
    if (same(rule.weekdays, [0, 6])) return 'weekends'
    if (rule.weekdays.length === 1 && rule.weekdays[0] === weekday(rule.start)) return 'weekly'
    return 'custom'
  }
  if (rule.freq === 'monthly') return rule.monthDay === d(rule.start) ? 'monthly' : 'custom'
  return 'yearly'
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

// "Every weekday", "Every 2 weeks on Mon, Wed", "Every month on the 1st, until Dec 31"
export function describeRule(rule) {
  if (!rule) return 'Doesn’t repeat'
  const every = rule.interval === 1 ? `Every ${UNIT[rule.freq]}` : `Every ${rule.interval} ${UNIT[rule.freq]}s`
  let text
  if (rule.freq === 'daily') text = every
  else if (rule.freq === 'weekly') {
    if (rule.interval === 1 && same(rule.weekdays, [1, 2, 3, 4, 5])) text = 'Every weekday'
    else if (rule.interval === 1 && same(rule.weekdays, [0, 6])) text = 'Every weekend'
    else if (rule.interval === 1 && rule.weekdays.length === 1) text = `Every ${WEEKDAY_LONG[rule.weekdays[0]]}`
    else text = `${every} on ${rule.weekdays.map((w) => WEEKDAY_SHORT[w]).join(', ')}`
  } else if (rule.freq === 'monthly') {
    text = `${every} on the ${ordinal(rule.monthDay)}`
  } else {
    const date = parseDateKey(rule.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    text = `${every} on ${date}`
  }
  if (rule.endsOn) {
    const until = parseDateKey(rule.endsOn).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    text += `, until ${until}`
  } else if (rule.count) {
    text += `, ${rule.count} times`
  }
  return text
}

// iCalendar RRULE for calendar export.
export function toRRule(rule) {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.freq === 'weekly') parts.push(`BYDAY=${rule.weekdays.map((w) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][w]).join(',')}`)
  // -1 is "last day of the month", which matches how the 31st falls back here.
  if (rule.freq === 'monthly') parts.push(`BYMONTHDAY=${rule.monthDay === 31 ? -1 : rule.monthDay}`)
  if (rule.endsOn) parts.push(`UNTIL=${rule.endsOn.replaceAll('-', '')}`)
  else if (rule.count) parts.push(`COUNT=${Math.max(1, rule.count - rule.completed)}`)
  return parts.join(';')
}
