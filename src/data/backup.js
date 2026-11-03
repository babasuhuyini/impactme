import { normalizeEntry, normalizeList, normalizeSettings, normalizeTask } from './models.js'
import { toDateKey } from '../lib/dates.js'

export const BACKUP_FORMAT = 'impactme-backup'
export const BACKUP_VERSION = 1

export function createBackup({ tasks, journal, settings }, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'ImpactMe',
    exportedAt: now.toISOString(),
    data: { tasks, journal, settings },
  }
}

export const backupFilename = (now = new Date()) => `impactme-backup-${toDateKey(now)}.json`

// Checks a backup file's text before anything is imported. Never throws.
export function parseBackup(text) {
  let file
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file couldn’t be read. Choose a .json backup made by ImpactMe.' }
  }
  if (!file || file.format !== BACKUP_FORMAT || !file.data || typeof file.data !== 'object') {
    return { ok: false, error: 'This file isn’t an ImpactMe backup.' }
  }
  if (!Number.isInteger(file.version) || file.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: 'This backup was made by a newer version of ImpactMe. Reload the app to update, then try again.',
    }
  }
  const tasks = normalizeList(file.data.tasks, normalizeTask)
  const journal = normalizeList(file.data.journal, normalizeEntry)
  const exportedAt = Date.parse(file.exportedAt)
  return {
    ok: true,
    exportedAt: Number.isNaN(exportedAt) ? null : exportedAt,
    skipped: tasks.skipped + journal.skipped,
    data: {
      tasks: tasks.records,
      journal: journal.records,
      settings: file.data.settings ? normalizeSettings(file.data.settings) : null,
    },
  }
}

export function downloadFile(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
