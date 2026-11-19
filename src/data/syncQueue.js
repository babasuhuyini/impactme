// Recording local changes for sync. Shared by the app and the service worker,
// so it only uses IndexedDB (no React, no localStorage).
//
// Every write to tasks, journal, projects or settings calls queueChanges()
// inside the same IndexedDB transaction as the write, so a change can never be
// saved without also being queued (or the other way round).

export const SYNC_TABLES = ['tasks', 'journal', 'projects']

// Settings that follow the account to other devices. Everything else
// (theme, remindersEnabled, namePromptDismissed, lastBackupAt) stays per device.
export const SYNCED_SETTINGS = [
  'name',
  'timeFormat',
  'weekStart',
  'calendarView',
  'tasksSort',
  'tasksShowCompleted',
  'defaultReminder',
  'allDayReminderTime',
]

// kv keys
export const LINK_KEY = 'sync.userId' // the account this device is linked to
export const JOURNAL_KEY = 'sync.journal' // true when journal sync is consented to
export const LAST_SYNC_KEY = 'sync.lastSyncedAt'
export const SNAPSHOT_KEY = 'sync.unlinkedDeviceData' // "Not Now" on first sign-in
export const cursorKey = (table) => `sync.cursor.${table}`

export const SETTINGS_QUEUE_KEY = 'settings:settings'
export const queueKey = (table, id) => (table === 'settings' ? SETTINGS_QUEUE_KEY : `${table}:${id}`)

// Strictly increasing within this JavaScript context, so two changes in the
// same millisecond still have different times.
let last = 0
export const changeTime = (now = Date.now()) => (last = Math.max(now, last + 1))

export const pickSyncedSettings = (settings) => Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, settings?.[k]]))
export const syncedSettingsChanged = (before, after) => SYNCED_SETTINGS.some((k) => before?.[k] !== after?.[k])

// Adds queue entries for `changes` ([{ table, id, op: 'put' | 'delete' }]).
// Must run inside a read-write transaction that includes db.kv and
// db.syncQueue. Does nothing unless this device is linked to an account; skips
// journal entries without journal consent. Returns how many were queued.
export async function queueChanges(db, changes) {
  if (!changes.length) return 0
  if (!(await db.kv.get(LINK_KEY))?.value) return 0
  const journal = (await db.kv.get(JOURNAL_KEY))?.value === true
  const entries = changes
    .filter((c) => c.table !== 'journal' || journal)
    .map((c) => ({
      key: queueKey(c.table, c.id),
      table: c.table,
      id: c.table === 'settings' ? 'settings' : c.id,
      op: c.op,
      changedAt: changeTime(),
    }))
  if (entries.length) await db.syncQueue.bulkPut(entries)
  return entries.length
}
