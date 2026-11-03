import { normalizeEntry, normalizeList, normalizeProject, normalizeSettings, normalizeTask } from './models.js'
import { toDateKey } from '../lib/dates.js'

export const BACKUP_FORMAT = 'impactme-backup'
// 1: tasks, journal, settings. 2: adds projects.
export const BACKUP_VERSION = 2

export function createBackup({ tasks, journal, projects, settings }, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'ImpactMe',
    exportedAt: now.toISOString(),
    data: { tasks, journal, projects, settings },
  }
}

export const backupFilename = (now = new Date()) => `impactme-backup-${toDateKey(now)}.json`

// Validates the contents of a backup (or a safety snapshot) record by record.
export function normalizeBackupData(data) {
  const tasks = normalizeList(data.tasks, normalizeTask)
  const journal = normalizeList(data.journal, normalizeEntry)
  const projects = normalizeList(data.projects ?? [], normalizeProject)
  return {
    skipped: tasks.skipped + journal.skipped + projects.skipped,
    data: {
      tasks: tasks.records,
      journal: journal.records,
      projects: projects.records,
      settings: data.settings ? normalizeSettings(data.settings) : null,
    },
  }
}

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
  const exportedAt = Date.parse(file.exportedAt)
  return {
    ok: true,
    exportedAt: Number.isNaN(exportedAt) ? null : exportedAt,
    ...normalizeBackupData(file.data),
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
