import { addDays, parseDateKey, toDateKey } from './dates.js'

export { addDays, parseDateKey, toDateKey }

export const MOODS = [
  { value: 1, label: 'Awful', emoji: '😣' },
  { value: 2, label: 'Low', emoji: '😔' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Great', emoji: '😄' },
]

export const ENERGY_LABELS = ['Drained', 'Tired', 'Steady', 'Energized', 'Buzzing']

export function getMood(value) {
  return MOODS.find((m) => m.value === value) ?? null
}

export function formatDayHeading(key) {
  const today = toDateKey()
  if (key === today) return 'Today'
  if (key === addDays(today, -1)) return 'Yesterday'
  const date = parseDateKey(key)
  const opts = { weekday: 'long', month: 'long', day: 'numeric' }
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString(undefined, opts)
}

export function entrySnippet(entry, length = 160) {
  return entry.body.replace(/\s+/g, ' ').trim().slice(0, length)
}

export function entryTitle(entry) {
  const mood = getMood(entry.mood)
  return entry.title || (mood ? `Feeling ${mood.label.toLowerCase()}` : '')
}

export function isEmptyEntry(entry) {
  return (
    !entry.title.trim() &&
    !entry.body.trim() &&
    !entry.gratitude.trim() &&
    entry.mood == null &&
    entry.energy == null &&
    entry.tags.length === 0
  )
}

export function countWords(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

// Consecutive days with an entry, ending today (or yesterday if today is still blank).
export function computeStreak(entries) {
  const days = new Set(entries.map((e) => e.date))
  let day = toDateKey()
  if (!days.has(day)) day = addDays(day, -1)
  let streak = 0
  while (days.has(day)) {
    streak++
    day = addDays(day, -1)
  }
  return streak
}
