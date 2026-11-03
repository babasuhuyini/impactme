import { describe, expect, it } from 'vitest'
import { backupFilename, createBackup, parseBackup } from './backup.js'
import { normalizeEntry, normalizeSettings, normalizeTask } from './models.js'

const sample = {
  tasks: [normalizeTask({ id: 't', title: 'Task', createdAt: 1 })],
  journal: [normalizeEntry({ id: 'e', title: 'Entry', createdAt: 1 })],
  settings: normalizeSettings({ name: 'Ama', theme: 'dark' }),
}

describe('backups', () => {
  it('round-trips through JSON unchanged', () => {
    const text = JSON.stringify(createBackup(sample, new Date('2026-11-03T10:00:00Z')))
    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.data).toEqual(sample)
    expect(parsed.exportedAt).toBe(Date.parse('2026-11-03T10:00:00Z'))
    expect(parsed.skipped).toBe(0)
  })

  it('names files by date', () => {
    expect(backupFilename(new Date(2026, 10, 3))).toBe('impactme-backup-2026-11-03.json')
  })

  it('rejects files that are not ImpactMe backups', () => {
    expect(parseBackup('not json').ok).toBe(false)
    expect(parseBackup('{"hello":1}').error).toMatch(/isn’t an ImpactMe backup/)
    expect(parseBackup(JSON.stringify([1, 2])).ok).toBe(false)
  })

  it('rejects backups from a newer version', () => {
    const newer = { ...createBackup(sample), version: 99 }
    expect(parseBackup(JSON.stringify(newer)).error).toMatch(/newer version/)
  })

  it('skips damaged records but keeps the rest', () => {
    const backup = createBackup(sample)
    backup.data.tasks.push({ title: 'missing id' }, 42)
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    expect(parsed.data.tasks).toHaveLength(1)
    expect(parsed.skipped).toBe(2)
  })
})
