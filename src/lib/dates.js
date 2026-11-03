// Dates are stored as local 'YYYY-MM-DD' keys so items group by calendar day, not UTC.
// Arithmetic on keys goes through UTC so daylight-saving changes can't shift a day.
export function toDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const keyParts = (key) => key.split('-').map(Number)
const utcDay = (key) => {
  const [y, m, d] = keyParts(key)
  return Date.UTC(y, m - 1, d) / 86400000
}
const fromUtcDay = (day) => new Date(day * 86400000).toISOString().slice(0, 10)

export function addDays(key, days) {
  return fromUtcDay(utcDay(key) + days)
}

export const daysBetween = (from, to) => utcDay(to) - utcDay(from)

// 0 = Sunday … 6 = Saturday
export const weekday = (key) => (((utcDay(key) + 4) % 7) + 7) % 7

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate() // month is 1-based

export function makeKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addMonths(key, months) {
  const [y, m, d] = keyParts(key)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return makeKey(year, month, Math.min(d, daysInMonth(year, month)))
}

// The first day of the week containing `key`; weekStart 0 = Sunday, 1 = Monday.
export function startOfWeek(key, weekStart = 1) {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7))
}

export const startOfMonth = (key) => key.slice(0, 8) + '01'

export function formatRelative(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* Times of day are stored as 'HH:MM' (24-hour). */

export const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export const fromMinutes = (minutes) => {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}
