import { useEffect, useRef, useState } from 'react'
import Dialog from '../components/Dialog.jsx'
import { showToast } from '../components/Toast.jsx'
import { BrandMark, DownloadIcon, MonitorIcon, MoonIcon, ShieldIcon, SunIcon, UploadIcon } from '../components/icons.jsx'
import useTheme from '../hooks/useTheme.js'
import {
  getSafetySnapshot,
  getSnapshot,
  requestPersistence,
  restoreData,
  storageStatus,
  updateSettings,
  useJournalEntries,
  useSettings,
  useTasks,
} from '../data/store.js'
import { backupFilename, createBackup, downloadFile, normalizeBackupData, parseBackup } from '../data/backup.js'
import { formatBytes } from '../lib/format.js'
import { resolveWeekStart } from '../lib/calendar.js'
import { formatRelative } from '../lib/dates.js'

const THEMES = [
  ['system', 'System', MonitorIcon],
  ['light', 'Light', SunIcon],
  ['dark', 'Dark', MoonIcon],
]

const SAMPLE_TIME = new Date(2026, 0, 1, 15, 30)
const sampleTime = (hour12) =>
  SAMPLE_TIME.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12 })

const SHORTCUTS = [
  ['Q', 'Quick add a task (understands “tomorrow at 9am”, “every weekday”)'],
  ['J', 'Start a new journal entry'],
  ['Enter', 'Add a task or move from title to text'],
  ['Ctrl + Enter', 'Save a task you’re editing'],
  ['Alt + ↑ / ↓', 'Move a task up or down when sorted by My order'],
  ['Esc', 'Close a window or cancel an edit'],
]

export default function Settings() {
  return (
    <div className="page-scroll">
      <div className="settings">
        <header className="settings-head">
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Preferences are saved automatically.</p>
        </header>
        <ProfileSection />
        <AppearanceSection />
        <CalendarSection />
        <DataSection />
        <ShortcutsSection />
        <AboutSection />
      </div>
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section className="settings-section">
      <div className="settings-intro">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-body">{children}</div>
    </section>
  )
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([optionValue, optionLabel, Icon]) => (
        <button
          key={optionValue}
          role="radio"
          aria-checked={value === optionValue}
          className={value === optionValue ? 'segment active' : 'segment'}
          onClick={() => onChange(optionValue)}
        >
          {Icon && <Icon width={15} height={15} />}
          {optionLabel}
        </button>
      ))}
    </div>
  )
}

function ProfileSection() {
  const settings = useSettings()
  const [name, setName] = useState(settings.name)
  const save = () => name.trim() !== settings.name && updateSettings({ name })

  return (
    <Section title="Profile" description="Used to greet you on the dashboard.">
      <div className="field">
        <label htmlFor="settings-name">Preferred name</label>
        <input
          id="settings-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Your first name"
          autoComplete="given-name"
          maxLength={60}
        />
      </div>
    </Section>
  )
}

function AppearanceSection() {
  const [, preference, setTheme] = useTheme()
  const { timeFormat } = useSettings()
  return (
    <Section title="Appearance" description="System follows your device’s light or dark setting.">
      <div className="field">
        <span className="field-label">Theme</span>
        <Segmented label="Theme" value={preference} options={THEMES} onChange={setTheme} />
      </div>
      <div className="field">
        <span className="field-label">Time format</span>
        <Segmented
          label="Time format"
          value={timeFormat}
          options={[
            ['auto', `Automatic (${sampleTime(undefined)})`],
            ['12', sampleTime(true)],
            ['24', sampleTime(false)],
          ]}
          onChange={(value) => updateSettings({ timeFormat: value })}
        />
      </div>
    </Section>
  )
}

function CalendarSection() {
  const { weekStart, calendarView } = useSettings()
  const auto = resolveWeekStart('auto') === 0 ? 'Sunday' : 'Monday'
  return (
    <Section title="Calendar" description="How weeks and the calendar are laid out.">
      <div className="field">
        <span className="field-label">Weeks start on</span>
        <Segmented
          label="Weeks start on"
          value={weekStart}
          options={[
            ['auto', `Automatic (${auto})`],
            ['sunday', 'Sunday'],
            ['monday', 'Monday'],
          ]}
          onChange={(value) => updateSettings({ weekStart: value })}
        />
      </div>
      <div className="field">
        <span className="field-label">Calendar opens in</span>
        <Segmented
          label="Calendar opens in"
          value={calendarView}
          options={[
            ['day', 'Day'],
            ['week', 'Week'],
            ['month', 'Month'],
            ['agenda', 'Agenda'],
          ]}
          onChange={(value) => updateSettings({ calendarView: value })}
        />
        <p className="field-hint">On a phone, Week opens as Day so it stays readable.</p>
      </div>
    </Section>
  )
}

function DataSection() {
  const settings = useSettings()
  const taskCount = useTasks().length
  const entryCount = useJournalEntries().length
  const [storage, setStorage] = useState(null)
  const [pendingRestore, setPendingRestore] = useState(null)
  const [safety, setSafety] = useState(null)
  const fileRef = useRef(null)

  const refresh = () => {
    storageStatus().then(setStorage)
    getSafetySnapshot().then(setSafety)
  }
  useEffect(refresh, [])

  function download() {
    const backup = createBackup(getSnapshot())
    downloadFile(backupFilename(), JSON.stringify(backup, null, 2))
    updateSettings({ lastBackupAt: Date.now() })
    showToast('Backup downloaded')
  }

  async function chooseFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) showToast(parsed.error, { tone: 'error', duration: 8000 })
    else setPendingRestore({ ...parsed, fileName: file.name })
  }

  async function protect() {
    const granted = await requestPersistence()
    refresh()
    showToast(
      granted
        ? 'Storage protection is on'
        : 'Your browser declined for now. Browsers often allow it once you use the app regularly.'
    )
  }

  async function undoRestore() {
    await restoreData(normalizeBackupData(safety).data, 'replace')
    refresh()
    showToast('Your data is back to how it was before the last restore')
  }

  return (
    <Section
      title="Data & backup"
      description="Everything you write stays in this browser on this device. Nothing is sent to a server."
    >
      <div className="data-summary">
        <div>
          <strong>{taskCount}</strong>
          <span>{taskCount === 1 ? 'task' : 'tasks'}</span>
        </div>
        <div>
          <strong>{entryCount}</strong>
          <span>journal {entryCount === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div>
          <strong>{formatBytes(storage?.usage)}</strong>
          <span>used</span>
        </div>
      </div>

      <div className="callout">
        <p>
          Clearing your browser’s site data, or uninstalling the browser, deletes ImpactMe’s data, and it doesn’t
          sync between devices. Download a backup regularly and keep it somewhere safe.
        </p>
        <p className="callout-meta">
          Last backup: {settings.lastBackupAt ? formatRelative(settings.lastBackupAt) : 'never'}
        </p>
      </div>

      <div className="button-row">
        <button className="btn primary" onClick={download}>
          <DownloadIcon width={16} height={16} />
          Download backup
        </button>
        <button className="btn secondary" onClick={() => fileRef.current.click()}>
          <UploadIcon width={16} height={16} />
          Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={chooseFile}
          aria-label="Choose a backup file"
        />
      </div>

      {safety && (
        <p className="settings-note">
          Restored by mistake? You can go back to how things were before your last restore (
          {formatRelative(safety.at)}).{' '}
          <button className="link" onClick={undoRestore}>
            Undo last restore
          </button>
        </p>
      )}

      {storage?.supported && (
        <div className="protect-row">
          <ShieldIcon width={18} height={18} />
          <div>
            <strong>Storage protection {storage.persisted ? 'is on' : 'is off'}</strong>
            <p>
              {storage.persisted
                ? 'Your browser won’t clear ImpactMe’s data to free up space.'
                : 'When a device runs low on space, browsers may clear data from websites. Protection asks the browser to keep ImpactMe’s data.'}
            </p>
          </div>
          {!storage.persisted && (
            <button className="btn secondary sm" onClick={protect}>
              Turn on
            </button>
          )}
        </div>
      )}

      <RestoreDialog
        restore={pendingRestore}
        onClose={() => setPendingRestore(null)}
        onDone={() => {
          setPendingRestore(null)
          refresh()
        }}
        current={{ tasks: taskCount, journal: entryCount }}
      />
    </Section>
  )
}

function RestoreDialog({ restore, onClose, onDone, current }) {
  const [mode, setMode] = useState('merge')
  const [busy, setBusy] = useState(false)
  const hasData = current.tasks + current.journal > 0

  async function confirm() {
    setBusy(true)
    try {
      const result = await restoreData(restore.data, hasData ? mode : 'replace')
      showToast(`Backup restored: ${result.added} added, ${result.updated} updated`)
      onDone()
    } catch (error) {
      console.error(error)
      showToast('The backup couldn’t be restored. Your existing data hasn’t changed.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(restore)} onClose={onClose} title="Restore from backup" size="md">
      {restore && (
        <div className="restore">
          <dl className="restore-facts">
            <div>
              <dt>File</dt>
              <dd>{restore.fileName}</dd>
            </div>
            <div>
              <dt>Made</dt>
              <dd>{restore.exportedAt ? new Date(restore.exportedAt).toLocaleString() : 'Unknown date'}</dd>
            </div>
            <div>
              <dt>Contains</dt>
              <dd>
                {restore.data.tasks.length} tasks, {restore.data.journal.length} journal entries
              </dd>
            </div>
          </dl>
          {restore.skipped > 0 && (
            <p className="settings-note">
              {restore.skipped} damaged {restore.skipped === 1 ? 'record' : 'records'} in the file will be skipped.
            </p>
          )}

          {hasData && (
            <fieldset className="restore-modes">
              <legend>You already have {current.tasks} tasks and {current.journal} entries here.</legend>
              <label className={mode === 'merge' ? 'restore-mode active' : 'restore-mode'}>
                <input type="radio" name="restore-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                <span>
                  <strong>Combine (recommended)</strong>
                  Add what’s missing. Where both have the same item, keep the most recently edited copy.
                </span>
              </label>
              <label className={mode === 'replace' ? 'restore-mode active' : 'restore-mode'}>
                <input
                  type="radio"
                  name="restore-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <span>
                  <strong>Replace everything</strong>
                  Delete what’s here now and use only the backup.
                </span>
              </label>
            </fieldset>
          )}
          <p className="settings-note">A copy of your current data is kept, so you can undo this restore.</p>

          <footer className="dialog-foot">
            <button className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className={hasData && mode === 'replace' ? 'btn danger' : 'btn primary'}
              onClick={confirm}
              disabled={busy}
            >
              {busy ? 'Restoring…' : hasData && mode === 'replace' ? 'Replace my data' : 'Restore'}
            </button>
          </footer>
        </div>
      )}
    </Dialog>
  )
}

function ShortcutsSection() {
  return (
    <Section title="Keyboard shortcuts" description="Single-letter shortcuts work when you aren’t typing in a field.">
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys}>
            <dt>
              {keys.split(' + ').map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

function AboutSection() {
  return (
    <Section title="About">
      <div className="about">
        <BrandMark size={40} className="about-mark" />
        <div>
          <strong>ImpactMe</strong>
          <p>Make Every Day Count. Your personal space to plan, organize, reflect and grow.</p>
          <p className="about-meta">Version {__APP_VERSION__} · Your data never leaves this device.</p>
        </div>
      </div>
    </Section>
  )
}
