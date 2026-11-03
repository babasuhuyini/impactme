import { addDays, parseDateKey, toDateKey, toMinutes } from './dates.js'
import { PRIORITIES } from '../data/models.js'

export { PRIORITIES }

export function getPriority(value) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES.find((p) => p.value === 'normal')
}

export const isDone = (task) => task.status === 'done'
export const isBlock = (task) => task.kind === 'block'
// Time blocks live on the calendar; task lists and counts only show real tasks.
export const isOpenTask = (task) => !isDone(task) && !isBlock(task)

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

// Task views. `test` runs on open tasks, except Completed which lists finished ones.
export const VIEWS = {
  inbox: {
    label: 'Inbox',
    hint: 'Tasks without a project or date',
    test: (t) => !t.projectId && !t.dueDate,
    empty: 'Your inbox is clear. New tasks without a date or project land here.',
  },
  today: { label: 'Today', test: (t) => dueStatus(t.dueDate) === 'today', empty: 'Nothing due today.' },
  upcoming: {
    label: 'Upcoming',
    test: (t) => ['tomorrow', 'week', 'later'].includes(dueStatus(t.dueDate)),
    empty: 'Nothing scheduled ahead.',
  },
  overdue: { label: 'Overdue', test: (t) => dueStatus(t.dueDate) === 'overdue', empty: 'Nothing overdue. Nice.' },
  all: { label: 'All tasks', test: () => true, empty: 'All caught up.' },
  completed: { label: 'Completed', completed: true, test: () => true, empty: 'Completed tasks will appear here.' },
}

const rank = (t) => getPriority(t.priority).rank
const byDue = (a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
// Timed tasks first, in time order; then untimed.
const byTime = (a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')
const byPriority = (a, b) => rank(b) - rank(a)
const byCreated = (a, b) => a.createdAt - b.createdAt

export const SORTS = {
  due: { label: 'Due date', compare: (a, b) => byDue(a, b) || byTime(a, b) || byPriority(a, b) || byCreated(a, b) },
  priority: { label: 'Priority', compare: (a, b) => byPriority(a, b) || byDue(a, b) || byTime(a, b) || byCreated(a, b) },
  newest: { label: 'Recently added', compare: (a, b) => byCreated(b, a) },
  manual: { label: 'My order', compare: (a, b) => a.order - b.order },
}

export const bySchedule = (a, b) => byTime(a, b) || byPriority(a, b) || byCreated(a, b)

export function matchesQuery(task, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [task.title, task.description, task.category, ...task.tags, ...task.subtasks.map((s) => s.title)].some(
    (field) => field.toLowerCase().includes(q)
  )
}

export const durationMinutes = (task) =>
  task.startTime && task.endTime ? toMinutes(task.endTime) - toMinutes(task.startTime) : null

// "2 reminders", for the bell shown on tasks that have them.
export const reminderCount = (task) => `${task.reminders.length} ${task.reminders.length === 1 ? 'reminder' : 'reminders'}`
