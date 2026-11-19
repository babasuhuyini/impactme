import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Dialog from '../components/Dialog.jsx'
import { showToast } from '../components/Toast.jsx'
import {
  AlertIcon,
  ArrowRightIcon,
  BellIcon,
  BrandMark,
  CheckIcon,
  DownloadIcon,
  InstallIcon,
  MonitorIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  UploadIcon,
} from '../components/icons.jsx'
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
import { REMINDER_PRESETS, offsetLabel } from '../lib/reminders.js'
import {
  isAppleMobile,
  isStandalone,
  requestNotificationPermission,
  sendTestNotification,
  useNotificationPermission,
} from '../reminders/notifications.js'
import { applyUpdate, checkForUpdate, promptInstall, usePWA } from '../pwa.js'
import {
  RECENT_SIGN_IN_MS,
  clearDeleteIntent,
  confirmWithGoogle,
  confirmWithPassword,
  getDeleteIntent,
  lastSignInAt,
  useAccount,
} from '../data/account.js'
import Turnstile, { captchaEnabled } from '../components/account/Turnstile.jsx'
import {
  addEarlierDataNow,
  deleteAccount,
  setDeviceSync,
  setJournalSync,
  signOutDevice,
  syncNow,
} from '../data/sync.js'

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
        <AccountSection />
        <ProfileSection />
        <AppearanceSection />
        <CalendarSection />
        <NotificationsSection />
        <AppSection />
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

// Signed out: the way in to sign-in (or, if a session expired while this
// device is linked, "Sign in again"). Signed in: who, sync status, Sign Out.
// The full Account screen (privacy, delete account) comes in Phase 5.
function AccountSection() {
  const account = useAccount()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(null) // { pending, localJournal } before signing out
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Back from a Google sign-in to confirm a delete: reopen the dialog.
  const [resume] = useState(getDeleteIntent)
  useEffect(() => {
    if (resume) setDeleting(true)
  }, [resume])
  if (account.status === 'unavailable' || account.status === 'loading') return null

  const out = async (force = false) => {
    setBusy(true)
    const result = await signOutDevice({ force })
    setBusy(false)
    if (result.done) {
      setConfirm(null)
      showToast('Signed out. Your account’s data was removed from this device.')
    } else setConfirm(result)
  }

  const signOutDialog = (
    <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Sign out?" size="sm">
      {confirm?.pending > 0 && (
        <p className="confirm-message">
          {confirm.pending === 1 ? '1 change hasn’t' : `${confirm.pending} changes haven’t`} synced yet. If you sign
          out now, {confirm.pending === 1 ? 'it’ll' : 'they’ll'} be lost.
        </p>
      )}
      {confirm?.localJournal > 0 && (
        <p className="confirm-message">
          Journal sync is off, so your {confirm.localJournal === 1 ? 'journal entry is' : `${confirm.localJournal} journal entries are`}{' '}
          only on this device. Signing out removes {confirm.localJournal === 1 ? 'it' : 'them'}. Download a copy of your data first if you
          want to keep {confirm.localJournal === 1 ? 'it' : 'them'}.
        </p>
      )}
      <footer className="dialog-foot">
        <button type="button" className="btn ghost" onClick={() => setConfirm(null)} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn danger" onClick={() => out(true)} disabled={busy}>
          Sign Out Anyway
        </button>
      </footer>
    </Dialog>
  )

  if (account.status === 'signed-out') {
    if (account.reauth) {
      return (
        <Section title="Account" description="Your sign-in on this device has ended.">
          <p className="settings-note account-warning">Sign in again to keep syncing. Your data is still on this device.</p>
          <div className="actions">
            <button className="btn primary" onClick={() => navigate('/account/email')}>
              Sign In Again
            </button>
            <button className="btn danger-text" onClick={() => out(false)} disabled={busy}>
              Remove Account Data From This Device
            </button>
          </div>
          {signOutDialog}
        </Section>
      )
    }
    return (
      <Section title="Account">
        <button className="account-cta" onClick={() => navigate('/welcome')}>
          <span>
            <strong>Sign in to sync your devices</strong>
            <span>Use ImpactMe on your phone, tablet and computer.</span>
          </span>
          <ArrowRightIcon width={18} height={18} />
        </button>
      </Section>
    )
  }

  const { user } = account
  return (
    <>
      <Section title="Account" description={user.provider === 'google' ? 'Signed in with Google.' : 'Signed in with email.'}>
        <div className="account-who">
          <span className="account-avatar" aria-hidden="true">
            {(user.name || user.email).trim().charAt(0).toUpperCase()}
          </span>
          <span className="account-id">
            {user.name && <strong>{user.name}</strong>}
            <span>{user.email}</span>
          </span>
        </div>
        <div className="actions">
          <button className="btn secondary" onClick={() => out(false)} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign Out'}
          </button>
          <button className="btn danger-text account-delete" onClick={() => setDeleting(true)}>
            Delete Account
          </button>
        </div>
        {signOutDialog}
        <DeleteAccountDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          provider={user.provider}
          resume={resume}
        />
      </Section>

      <Section title="Sync" description="Your tasks, projects and settings, on every device you sign in on.">
        <label className="switch-row">
          <input
            type="checkbox"
            className="switch"
            checked={!account.paused}
            onChange={(e) => setDeviceSync(e.target.checked)}
          />
          <span>
            <strong>Sync this device</strong>
            Turn off to stop syncing here for now. Changes are kept and sync when you turn it back on.
          </span>
        </label>
        {!account.paused && <SyncStatus account={account} />}
        {account.earlierData && <EarlierData />}
      </Section>

      <PrivacySection account={account} />
    </>
  )
}

function PrivacySection({ account }) {
  const [confirmOff, setConfirmOff] = useState(false)
  const [busy, setBusy] = useState(false)
  const journalOn = account.consent.journal

  const change = async (on) => {
    setBusy(true)
    const { error } = await setJournalSync(on)
    setBusy(false)
    if (error) showToast(error, { tone: 'error' })
    else showToast(on ? 'Journal sync is on.' : 'Journal sync is off. Your journal was removed from your account.')
  }

  return (
    <Section title="Privacy" description="Your journal can include health information, so it only syncs if you choose.">
      <label className="switch-row">
        <input
          type="checkbox"
          className="switch"
          checked={journalOn}
          disabled={busy}
          onChange={(e) => (e.target.checked ? change(true) : setConfirmOff(true))}
        />
        <span>
          <strong>Sync journal entries</strong>
          {journalOn
            ? 'Your journal, mood and energy entries are stored in your account so they sync.'
            : 'Your journal, mood and energy entries stay on this device only.'}
        </span>
      </label>
      <div className="actions">
        <button className="btn secondary" onClick={downloadBackup}>
          <DownloadIcon width={16} height={16} /> Download a Copy of My Data
        </button>
      </div>
      <p className="settings-note">
        <Link to="/privacy">Privacy Policy</Link> · <Link to="/terms">Terms</Link>
      </p>
      <ConfirmDialog
        open={confirmOff}
        title="Turn off journal sync?"
        message="Your journal entries will be removed from your account and stop syncing. They stay on this device."
        confirmLabel="Turn Off"
        onConfirm={() => change(false)}
        onCancel={() => setConfirmOff(false)}
      />
    </Section>
  )
}

// Deleting is permanent, so the person confirms it's them first: the password
// again for email accounts, or a recent Google sign-in. The server checks this
// too (delete-account refuses a sign-in older than 10 minutes).
function DeleteAccountDialog({ open, onClose, provider, resume }) {
  const google = provider === 'google'
  const [removeLocal, setRemoveLocal] = useState(Boolean(resume?.removeLocal))
  const [password, setPassword] = useState('')
  const [recent, setRecent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    if (resume) setRemoveLocal(Boolean(resume.removeLocal))
    lastSignInAt().then((at) => setRecent(Date.now() - at < RECENT_SIGN_IN_MS))
  }, [open, resume])

  const close = () => {
    if (busy) return
    clearDeleteIntent()
    setError(null)
    setPassword('')
    setRemoveLocal(false)
    onClose()
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    if (!google) {
      const confirmed = await confirmWithPassword({ password, captchaToken })
      setCaptchaKey((k) => k + 1)
      if (confirmed.error) {
        setBusy(false)
        return setError(/don’t match/.test(confirmed.error) ? 'That password isn’t right. Try again.' : confirmed.error)
      }
    }
    const result = await deleteAccount({ removeLocal })
    setBusy(false)
    if (result.error) {
      if (result.reauth) setRecent(false)
      return setError(result.error)
    }
    clearDeleteIntent()
    onClose()
    showToast(
      removeLocal
        ? 'Your account was deleted, and its data was removed from this device.'
        : 'Your account was deleted. Your data is still on this device.',
      { duration: 8000 }
    )
  }

  const signInAgain = async () => {
    setBusy(true)
    setError(null)
    const result = await confirmWithGoogle({ removeLocal })
    // On success the page leaves for Google.
    if (result.error) {
      setBusy(false)
      setError(result.error)
    }
  }

  const ready = google ? recent : password.length > 0 && (!captchaEnabled || Boolean(captchaToken))

  return (
    <Dialog open={open} onClose={close} title="Delete your account?" size="sm">
      <p className="confirm-message">
        This permanently deletes your ImpactMe account and everything stored in it: your tasks, projects, journal
        entries, settings and consent records. It can’t be undone.
      </p>
      <p className="confirm-message">Download a copy of your data first if you want to keep it.</p>
      <label className="switch-row">
        <input
          type="checkbox"
          className="switch"
          checked={removeLocal}
          onChange={(e) => setRemoveLocal(e.target.checked)}
        />
        <span>
          <strong>Also remove data from this device</strong>
          Otherwise your data stays here and ImpactMe keeps working on this device without an account.
        </span>
      </label>

      <div className="reauth">
        {google ? (
          recent ? (
            <p className="settings-note">You’ve just signed in with Google, so you can delete your account now.</p>
          ) : (
            <>
              <p className="settings-note">For your security, sign in with Google again to confirm it’s you.</p>
              <button type="button" className="btn secondary" onClick={signInAgain} disabled={busy}>
                Sign In With Google Again
              </button>
            </>
          )
        ) : (
          <>
            <div className="field">
              <label htmlFor="delete-password">Enter your password to confirm it’s you</label>
              <input
                id="delete-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
              />
            </div>
            <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />
          </>
        )}
      </div>

      {error && (
        <p className="settings-note account-warning" role="alert">
          {error}
        </p>
      )}
      <footer className="dialog-foot">
        <button type="button" className="btn ghost" onClick={close} disabled={busy} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn danger" onClick={remove} disabled={busy || !ready}>
          {busy ? 'Deleting…' : 'Delete Account'}
        </button>
      </footer>
    </Dialog>
  )
}

// Downloads a backup file of everything on this device (a copy of your data).
function downloadBackup() {
  const backup = createBackup(getSnapshot())
  downloadFile(backupFilename(), JSON.stringify(backup, null, 2))
  updateSettings({ lastBackupAt: Date.now() })
  showToast('Backup downloaded')
}

function SyncStatus({ account }) {
  const { syncStatus, syncError, lastSyncedAt } = account
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(timer)
  }, [])
  let text
  if (syncStatus === 'syncing') text = 'Syncing…'
  else if (syncStatus === 'offline') text = 'You’re offline. Changes will sync when you’re back online.'
  else if (syncStatus === 'error') text = syncError
  else text = lastSyncedAt ? `Last synced ${formatRelative(lastSyncedAt)}` : 'Not synced yet'
  return (
    <div className="account-sync">
      <p className={syncStatus === 'error' ? 'settings-note account-warning' : 'settings-note'} role="status">
        {text}
      </p>
      <button className="btn sm ghost" onClick={() => syncNow()} disabled={syncStatus === 'syncing'}>
        Sync Now
      </button>
    </div>
  )
}

function EarlierData() {
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    try {
      const { added, updated } = await addEarlierDataNow()
      showToast(`Added ${added + updated} ${added + updated === 1 ? 'item' : 'items'} from this device.`)
    } catch (error) {
      console.warn('Adding earlier data failed', error?.name ?? 'unknown')
      showToast('That didn’t work. Please try again.', { tone: 'error' })
    }
    setBusy(false)
  }
  return (
    <div className="account-earlier">
      <p className="settings-note">This device has data from before you signed in.</p>
      <button className="btn secondary" onClick={add} disabled={busy}>
        {busy ? 'Adding…' : 'Add This Device’s Earlier Data'}
      </button>
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

function StatusRow({ icon: Icon, tone, title, children, action }) {
  return (
    <div className={tone ? `status-row ${tone}` : 'status-row'}>
      <Icon width={18} height={18} />
      <div>
        <strong>{title}</strong>
        {children}
      </div>
      {action}
    </div>
  )
}

function NotificationsSection() {
  const settings = useSettings()
  const [permission, setPermission] = useNotificationPermission()
  const [busy, setBusy] = useState(false)
  const appleNeedsInstall = permission === 'unsupported' && isAppleMobile() && !isStandalone()

  async function enable() {
    setBusy(true)
    try {
      const result = await requestNotificationPermission()
      setPermission(result)
      if (result === 'granted') {
        // Make new tasks with a time remind you, unless you've already chosen otherwise.
        if (settings.defaultReminder == null) updateSettings({ defaultReminder: 0 })
        showToast('Notifications are on')
      } else if (result === 'denied') {
        showToast('Notifications were blocked. Reminders will appear inside ImpactMe instead.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    try {
      await sendTestNotification()
      showToast('Test sent. Not seeing it? Check your device’s notification and Do Not Disturb settings.', {
        duration: 8000,
      })
    } catch (error) {
      console.error(error)
      showToast('The test notification couldn’t be shown.', { tone: 'error' })
    }
  }

  let status
  if (appleNeedsInstall) {
    status = (
      <StatusRow icon={InstallIcon} title="Add ImpactMe to your Home Screen first">
        <p>
          On iPhone and iPad, notifications work once ImpactMe is installed: tap Share, then Add to Home Screen, and
          open it from there. Until then, reminders appear inside ImpactMe while it’s open.
        </p>
      </StatusRow>
    )
  } else if (permission === 'unsupported') {
    status = (
      <StatusRow icon={AlertIcon} tone="warn" title="This browser can’t show notifications">
        <p>Reminders will appear inside ImpactMe while it’s open.</p>
      </StatusRow>
    )
  } else if (permission === 'granted') {
    status = (
      <StatusRow
        icon={CheckIcon}
        tone="ok"
        title="Notifications are on"
        action={
          <button className="btn secondary sm" onClick={test}>
            Send a test
          </button>
        }
      >
        <p>Reminders appear as notifications on this device, with buttons to mark done or snooze.</p>
      </StatusRow>
    )
  } else if (permission === 'denied') {
    status = (
      <StatusRow icon={AlertIcon} tone="warn" title="Notifications are blocked for ImpactMe">
        <p>
          To allow them, click the icon at the left of the address bar, open the site’s permissions, and set
          Notifications to Allow. Until then, reminders appear inside ImpactMe while it’s open.
        </p>
      </StatusRow>
    )
  } else {
    status = (
      <StatusRow
        icon={BellIcon}
        title="Notifications are off"
        action={
          <button className="btn primary sm" onClick={enable} disabled={busy}>
            Enable notifications
          </button>
        }
      >
        <p>
          Your browser will ask whether ImpactMe may show notifications. Without them, reminders appear inside
          ImpactMe while it’s open.
        </p>
      </StatusRow>
    )
  }

  return (
    <Section title="Reminders & notifications" description="Get reminded when tasks are due.">
      {status}

      <label className="switch-row">
        <input
          type="checkbox"
          className="switch"
          checked={settings.remindersEnabled}
          onChange={(e) => updateSettings({ remindersEnabled: e.target.checked })}
        />
        <span>
          <strong>Send reminders</strong>
          Turn off to pause all reminders without removing them from your tasks.
        </span>
      </label>

      <div className="field">
        <label htmlFor="settings-default-reminder">Default reminder for new tasks with a time</label>
        <select
          id="settings-default-reminder"
          className="input settings-select"
          value={settings.defaultReminder ?? ''}
          onChange={(e) => updateSettings({ defaultReminder: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">None</option>
          {REMINDER_PRESETS.map((m) => (
            <option key={m} value={m}>
              {offsetLabel(m)}
            </option>
          ))}
        </select>
        <p className="field-hint">You can add, change or remove reminders on any task.</p>
      </div>

      <div className="field">
        <label htmlFor="settings-all-day">Tasks without a time remind you at</label>
        <input
          id="settings-all-day"
          type="time"
          className="input settings-select"
          value={settings.allDayReminderTime}
          onChange={(e) => e.target.value && updateSettings({ allDayReminderTime: e.target.value })}
        />
      </div>

      <details className="explainer">
        <summary>When will reminders arrive?</summary>
        <ul>
          <li>
            <strong>While ImpactMe is open</strong> (in a tab, minimised, behind other windows, or as an installed
            app), reminders arrive on time, at most about a minute late.
          </li>
          <li>
            <strong>If your browser is closed or your device is off or asleep,</strong> a reminder can’t arrive at
            that moment. ImpactMe shows what you missed in the last 24 hours as soon as you open it again.
          </li>
          <li>
            <strong>Installed in Chrome or Edge,</strong> ImpactMe may also check in the background now and then. The
            browser decides when, so don’t count on it for exact times.
          </li>
          <li>
            <strong>Snooze</strong> brings a reminder back after 10 or 30 minutes if ImpactMe is open then, or as soon
            as you next open it.
          </li>
          <li>
            Each reminder is sent once, however many tabs are open. Completing, deleting or moving a task clears its
            reminder.
          </li>
          <li>Do Not Disturb, Focus modes and battery savers can hide or delay notifications.</li>
          <li>
            Reminders that arrive while the browser is completely closed would need a push server. ImpactMe doesn’t
            use one. If you use ImpactMe on several devices, a reminder can appear on each of them.
          </li>
        </ul>
      </details>
    </Section>
  )
}

function installHelp() {
  const ua = navigator.userAgent
  if (isAppleMobile()) return 'In Safari, tap Share, then Add to Home Screen.'
  if (/Android/i.test(ua)) return 'Open your browser’s menu and choose Install app or Add to Home screen.'
  if (/Firefox/i.test(ua)) return 'Firefox can’t install websites as apps; Chrome, Edge or Safari can.'
  if (/Safari/i.test(ua) && !/Chrome|Edg/i.test(ua)) return 'In Safari, choose File, then Add to Dock.'
  return 'Use the install icon at the right of the address bar, or your browser’s menu (Apps, then Install ImpactMe).'
}

function AppSection() {
  const pwa = usePWA()
  const [checking, setChecking] = useState(false)
  const installed = pwa.installed || isStandalone()
  const offlineCapable = 'serviceWorker' in navigator

  async function install() {
    if (await promptInstall()) showToast('ImpactMe is installed')
  }

  async function check() {
    setChecking(true)
    try {
      const result = await checkForUpdate()
      if (result === 'latest') showToast('You have the latest version')
      else if (result === 'offline') showToast('You’re offline. Try again when you’re connected.')
      else if (result === 'unavailable') showToast('Updates arrive automatically when you reload ImpactMe.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Section title="App & offline" description="Install ImpactMe and use it without a connection.">
      {installed ? (
        <StatusRow icon={CheckIcon} tone="ok" title="Installed">
          <p>ImpactMe is installed on this device and opens in its own window.</p>
        </StatusRow>
      ) : (
        <StatusRow
          icon={InstallIcon}
          title="Install ImpactMe"
          action={
            pwa.installPrompt && (
              <button className="btn primary sm" onClick={install}>
                Install
              </button>
            )
          }
        >
          <p>
            Open it like any other app, from your home screen, dock or Start menu.{' '}
            {!pwa.installPrompt && installHelp()}
          </p>
        </StatusRow>
      )}

      {!offlineCapable ? (
        <StatusRow icon={AlertIcon} tone="warn" title="Offline use isn’t available in this browser">
          <p>Your data is still saved on this device, but the app itself needs a connection to open.</p>
        </StatusRow>
      ) : pwa.offlineReady ? (
        <StatusRow icon={CheckIcon} tone="ok" title="Works offline">
          <p>ImpactMe and everything you’ve saved open without an internet connection.</p>
        </StatusRow>
      ) : (
        <StatusRow icon={ShieldIcon} title="Getting ready to work offline">
          <p>ImpactMe is saving itself on this device. This takes a moment on the first visit.</p>
        </StatusRow>
      )}

      <div className="update-row">
        <span>
          Version {__APP_VERSION__}
          {pwa.updateReady && ' · a new version is ready'}
        </span>
        {pwa.updateReady ? (
          <button className="btn primary sm" onClick={applyUpdate}>
            Update now
          </button>
        ) : (
          offlineCapable && (
            <button className="btn secondary sm" onClick={check} disabled={checking}>
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
          )
        )}
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

  const download = downloadBackup
  const signedIn = useAccount().status === 'signed-in'

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
      description={
        signedIn
          ? 'Everything is saved on this device and in your ImpactMe account, so it can sync.'
          : 'Everything you write stays in this browser on this device. Nothing is sent to a server.'
      }
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
  const signedIn = useAccount().status === 'signed-in'
  return (
    <Section title="About">
      <div className="about">
        <BrandMark size={40} className="about-mark" />
        <div>
          <strong>ImpactMe</strong>
          <p>Make Every Day Count. Your personal space to plan, organize, reflect and grow.</p>
          <p className="about-meta">
            Version {__APP_VERSION__} ·{' '}
            {signedIn ? 'Saved on this device and in your ImpactMe account.' : 'Your data stays on this device.'}
          </p>
        </div>
      </div>
    </Section>
  )
}
