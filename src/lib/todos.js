import { addDays, parseDateKey, toDateKey } from './dates.js'
import { PRIORITIES } from '../data/models.js'

export { PRIORITIES }

export function getPriority(value) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES.find((p) => p.value === 'normal')
}

export const isDone = (task) => task.status === 'done'

// Pulls "#tag" words out of quick-add text: "Call mum #family" → title "Call mum", tags ["family"].
export function extractTags(input) {
  const pattern = /(^|\s)#([\w-]+)/g
  const tags = [...input.matchAll(pattern)].map((m) => m[2].toLowerCase())
  const title = input.replace(pattern, ' ').replace(/\s+/g, ' ').trim()
  return { title: title || input.trim(), tags: [...new Set(tags)] }
}

export function dueStatus(dueDate, today = toDateKey()) {
  if (!dueDate) return null
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  if (dueDate === addDays(today, 1)) return 'tomorrow'
  if (dueDate <= addDays(today, 7)) return 'week'
  return 'later'
}

export function formatDue(dueDate) {
  const today = toDateKey()
  if (dueDate === today) return 'Today'
  if (dueDate === addDays(today, 1)) return 'Tomorrow'
  if (dueDate === addDays(today, -1)) return 'Yesterday'
  const date = parseDateKey(dueDate)
  if (dueStatus(dueDate) === 'week') return date.toLocaleDateString(undefined, { weekday: 'long' })
  const opts = { month: 'short', day: 'numeric' }
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString(undefined, opts)
}

export const VIEWS = {
  all: { label: 'All', test: () => true, empty: 'All caught up.' },
  today: { label: 'Today', test: (t) => dueStatus(t.dueDate) === 'today', empty: 'Nothing due today.' },
  upcoming: {
    label: 'Upcoming',
    test: (t) => ['tomorrow', 'week', 'later'].includes(dueStatus(t.dueDate)),
    empty: 'Nothing scheduled ahead.',
  },
  overdue: { label: 'Overdue', test: (t) => dueStatus(t.dueDate) === 'overdue', empty: 'Nothing overdue. Nice.' },
  someday: { label: 'No date', test: (t) => !t.dueDate, empty: 'Every task has a date.' },
}

const rank = (t) => getPriority(t.priority).rank
const byDue = (a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
const byPriority = (a, b) => rank(b) - rank(a)
const byCreated = (a, b) => a.createdAt - b.createdAt

export const SORTS = {
  due: { label: 'Due date', compare: (a, b) => byDue(a, b) || byPriority(a, b) || byCreated(a, b) },
  priority: { label: 'Priority', compare: (a, b) => byPriority(a, b) || byDue(a, b) || byCreated(a, b) },
  newest: { label: 'Recently added', compare: (a, b) => byCreated(b, a) },
}

export function matchesQuery(task, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [task.title, task.description, ...task.tags].some((field) => field.toLowerCase().includes(q))
}
