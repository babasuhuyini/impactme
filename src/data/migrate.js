// Daybook kept everything in localStorage. On first launch ImpactMe copies it
// into IndexedDB. The old keys are left untouched as a fallback copy.

import { normalizeEntry, normalizeList, normalizeSettings, normalizeTask } from './models.js'

export const LEGACY_KEYS = {
  tasks: 'todos.items',
  journal: 'journal.entries',
  theme: 'ui.theme',
  sort: 'todos.sort',
  showCompleted: 'todos.showCompleted',
}

export const MIGRATION_KEY = 'migration.daybookLocalStorage'

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

// Pure: reads a Storage-like object and returns validated records.
export function readLegacy(storage) {
  const tasks = normalizeList(readJSON(storage, LEGACY_KEYS.tasks), normalizeTask)
  const journal = normalizeList(readJSON(storage, LEGACY_KEYS.journal), normalizeEntry)
  const theme = readJSON(storage, LEGACY_KEYS.theme)
  const settings = normalizeSettings({
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    tasksSort: readJSON(storage, LEGACY_KEYS.sort),
    tasksShowCompleted: readJSON(storage, LEGACY_KEYS.showCompleted),
  })
  return { tasks: tasks.records, journal: journal.records, settings, skipped: tasks.skipped + journal.skipped }
}

// Runs once per browser. Inside one transaction, so two tabs opening at the
// same moment can't both copy (and nothing already in IndexedDB is overwritten).
export async function migrateFromDaybook(db, storage = globalThis.localStorage) {
  if (!storage) return null
  return db.transaction('rw', db.tasks, db.journal, db.kv, async () => {
    if (await db.kv.get(MIGRATION_KEY)) return null
    const legacy = readLegacy(storage)
    const [taskIds, entryIds] = await Promise.all([
      db.tasks.toCollection().primaryKeys(),
      db.journal.toCollection().primaryKeys(),
    ])
    const haveTask = new Set(taskIds)
    const haveEntry = new Set(entryIds)
    const tasks = legacy.tasks.filter((t) => !haveTask.has(t.id))
    const journal = legacy.journal.filter((e) => !haveEntry.has(e.id))
    await db.tasks.bulkPut(tasks)
    await db.journal.bulkPut(journal)
    if (!(await db.kv.get('settings'))) await db.kv.put({ key: 'settings', value: legacy.settings })
    const report = { at: Date.now(), tasks: tasks.length, journal: journal.length, skipped: legacy.skipped }
    await db.kv.put({ key: MIGRATION_KEY, value: report })
    return report
  })
}
