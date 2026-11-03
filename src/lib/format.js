import { getSettings } from '../data/store.js'

// Times follow the user's 12/24-hour preference; 'auto' uses the device locale.
export function formatTime(timestamp) {
  const { timeFormat } = getSettings()
  const opts = { hour: 'numeric', minute: '2-digit' }
  if (timeFormat !== 'auto') opts.hour12 = timeFormat === '12'
  return new Date(timestamp).toLocaleTimeString(undefined, opts)
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const PROMPTS = [
  'What one thing would make today a good day?',
  'Small steps still count as progress.',
  'Pick the task you keep putting off and give it ten minutes.',
  'What are you looking forward to today?',
  'Finish one thing before starting the next.',
  'Who could you thank today?',
  'Rest is part of the work.',
  'What did yesterday teach you?',
  'Protect an hour today for what matters most.',
  'Progress over perfection.',
  'Notice one good thing before the day ends.',
  'What would you like to have done by tonight?',
  'Clear one small thing off your mind first.',
  'How do you want to feel at the end of today?',
]

// The same line all day, a different one tomorrow.
export function dailyPrompt(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date - start) / 86400000)
  return PROMPTS[dayOfYear % PROMPTS.length]
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
