// "Bring this device's data with you?": first sign-in on a device that
// already has tasks, projects or journal entries. Nothing is merged without
// asking. If the data belongs to another account (its session ended without
// signing out), it is never offered to add: it can only be removed.

import { useState } from 'react'
import { AuthScreen, PrimaryButton } from '../../components/account/AuthLayout.jsx'
import SignedInAs from '../../components/account/SignedInAs.jsx'
import { AlertIcon, UploadIcon } from '../../components/icons.jsx'
import { showToast } from '../../components/Toast.jsx'
import { signOut, useAccount } from '../../data/account.js'
import { chooseDeviceData } from '../../data/sync.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function BringData() {
  const { counts, consent, user, otherAccount } = useAccount()
  const [busy, setBusy] = useState(null)
  if (!counts || !user) return null

  const choose = async (choice) => {
    setBusy(choice)
    try {
      await chooseDeviceData(choice)
      if (choice === 'remove') showToast('The other account’s data was removed from this device.')
    } catch (error) {
      console.warn('Linking this device failed', error?.name ?? 'unknown')
      showToast('That didn’t work. Check your connection and try again.', { tone: 'error' })
      setBusy(null)
    }
  }

  const rows = [
    ['Tasks', counts.tasks],
    ['Projects', counts.projects],
    ['Journal entries', counts.journal],
  ].filter(([, n]) => n > 0)

  const list = (
    <div className="consent-card bring-list">
      {rows.map(([label, n]) => (
        <div key={label} className="bring-row">
          <span>{label}</span>
          <strong>{n}</strong>
        </div>
      ))}
    </div>
  )

  if (otherAccount) {
    return (
      <AuthScreen
        centered
        icon={AlertIcon}
        title="This device has another account’s data"
        subtitle="Someone else was signed in here and didn’t sign out. Their data can’t be added to your account."
        actions={
          <>
            <PrimaryButton type="button" onClick={() => choose('remove')} busy={busy === 'remove'} disabled={Boolean(busy)}>
              {busy === 'remove' ? 'Removing…' : 'Remove It From This Device'}
            </PrimaryButton>
            <button type="button" className="auth-link" onClick={() => signOut()} disabled={Boolean(busy)}>
              Cancel and Sign Out
            </button>
          </>
        }
      >
        <SignedInAs />
        {list}
        <p className="consent-note">
          If it’s yours from another account, cancel, sign in to that account, and download a copy from Settings
          first.
        </p>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      centered
      icon={UploadIcon}
      title="Bring this device’s data with you?"
      subtitle="This device already has some ImpactMe data. Add it to your account to see it on your other devices."
      actions={
        <>
          <PrimaryButton type="button" onClick={() => choose('add')} busy={busy === 'add'} disabled={Boolean(busy)}>
            {busy === 'add' ? 'Adding…' : 'Add to My Account'}
          </PrimaryButton>
          <button type="button" className="auth-link" onClick={() => choose('later')} disabled={Boolean(busy)}>
            Not Now
          </button>
        </>
      }
    >
      <SignedInAs />
      {list}
      {counts.journal > 0 && !consent.journal && (
        <p className="consent-note">
          Journal sync is off, so your {plural(counts.journal, 'journal entry', 'journal entries')} won’t be added to
          your account. They stay on this device.
        </p>
      )}
      <p className="consent-note">
        Add to My Account puts this data in <strong>{user.email}</strong>. Not Now keeps it aside; you can add it later
        in Settings.
      </p>
    </AuthScreen>
  )
}
