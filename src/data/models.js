// Record shapes for everything ImpactMe stores, plus validators that coerce
// anything read from storage, old Daybook data or a backup file into that shape.
// A validator returns null for a record that can't be salvaged (e.g. no id).

import { toDateKey } from '../lib/dates.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback)
const num = (value, fallback = null) => (Number.isFinite(value) ? value : fallback)
const dateKey = (value) => (typeof value === 'string' && DATE_RE.test(value) ? value : null)
const time = (value) => (typeof value === 'string' && TIME_RE.test(value) ? value : null)
const tagList = (value) =>
  Array.isArray(value)
    ? [...new Set(value.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase()))]
    : []
const isId = (value) => typeof value === 'string' && value.length > 0

export const newId = () => crypto.randomUUID()

/* Tasks ------------------------------------------------------------------ */

export const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', rank: 4 },
  { value: 'high', label: 'High', rank: 3 },
  { value: 'normal', label: 'Normal', rank: 2 },
  { value: 'low', label: 'Low', rank: 1 },
]
const PRIORITY_VALUES = PRIORITIES.map((p) => p.value)

// Daybook stored priority as 0 (none), 1 (low), 2 (medium), 3 (high).
const LEGACY_PRIORITY = { 0: 'normal', 1: 'low', 2: 'normal', 3: 'high' }

function priority(value) {
  if (PRIORITY_VALUES.includes(value)) return value
  return LEGACY_PRIORITY[value] ?? 'normal'
}

function subtaskList(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((s) => s && isId(s.id) && str(s.title).trim())
    .map((s) => ({ id: s.id, title: s.title.trim(), done: s.done === true }))
}

export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || !isId(raw.id)) return null
  // Daybook tasks used `text`, `notes`, `due` and `done`.
  const title = str(raw.title ?? raw.text).trim()
  if (!title) return null
  const done = raw.status === 'done' || raw.done === true
  const createdAt = num(raw.createdAt, 0)
  return {
    id: raw.id,
    title,
    description: str(raw.description ?? raw.notes),
    dueDate: dateKey(raw.dueDate ?? raw.due),
    startTime: time(raw.startTime),
    endTime: time(raw.endTime),
    priority: priority(raw.priority),
    projectId: isId(raw.projectId) ? raw.projectId : null,
    tags: tagList(raw.tags),
    subtasks: subtaskList(raw.subtasks),
    reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
    recurrence: raw.recurrence && typeof raw.recurrence === 'object' ? raw.recurrence : null,
    status: done ? 'done' : 'open',
    completedAt: done ? num(raw.completedAt, null) : null,
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
  }
}

export function createTask(fields = {}) {
  const now = Date.now()
  return normalizeTask({ ...fields, id: newId(), status: 'open', createdAt: now, updatedAt: now })
}

/* Journal entries -------------------------------------------------------- */

const inRange = (value) => (Number.isInteger(value) && value >= 1 && value <= 5 ? value : null)

export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || !isId(raw.id)) return null
  const createdAt = num(raw.createdAt, Date.now())
  return {
    id: raw.id,
    journalId: isId(raw.journalId) ? raw.journalId : 'default',
    date: dateKey(raw.date) ?? toDateKey(new Date(createdAt)),
    title: str(raw.title),
    // The first Daybook version stored the entry text as `text`.
    body: str(raw.body ?? raw.text),
    mood: inRange(raw.mood),
    energy: inRange(raw.energy),
    gratitude: str(raw.gratitude),
    tags: tagList(raw.tags),
    favorite: raw.favorite === true,
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
  }
}

export function createEntry(fields = {}) {
  const now = Date.now()
  return normalizeEntry({ date: toDateKey(), ...fields, id: newId(), createdAt: now, updatedAt: now })
}

/* Settings --------------------------------------------------------------- */

export const DEFAULT_SETTINGS = {
  name: '',
  namePromptDismissed: false,
  theme: 'system', // 'system' | 'light' | 'dark'
  timeFormat: 'auto', // 'auto' | '12' | '24'
  tasksSort: 'due',
  tasksShowCompleted: true,
  lastBackupAt: null,
}

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback)

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const d = DEFAULT_SETTINGS
  return {
    name: str(s.name).trim().slice(0, 60),
    namePromptDismissed: s.namePromptDismissed === true,
    theme: oneOf(s.theme, ['system', 'light', 'dark'], d.theme),
    timeFormat: oneOf(s.timeFormat, ['auto', '12', '24'], d.timeFormat),
    tasksSort: oneOf(s.tasksSort, ['due', 'priority', 'newest'], d.tasksSort),
    tasksShowCompleted: typeof s.tasksShowCompleted === 'boolean' ? s.tasksShowCompleted : d.tasksShowCompleted,
    lastBackupAt: num(s.lastBackupAt, null),
  }
}

// Validates a whole list, dropping unusable records and duplicate ids (last one wins).
export function normalizeList(list, normalize) {
  if (!Array.isArray(list)) return { records: [], skipped: 0 }
  const byId = new Map()
  for (const raw of list) {
    const record = normalize(raw)
    if (record) byId.set(record.id, record)
  }
  return { records: [...byId.values()], skipped: list.length - byId.size }
}
