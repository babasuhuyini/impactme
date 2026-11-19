// "Bring this device's data with you?": first sign-in on a device that
// already has tasks, projects or journal entries (or data from another
// account). Nothing is merged without asking.

import { useState } from 'react'
import { AuthScreen, PrimaryButton } from '../../components/account/AuthLayout.jsx'
import { UploadIcon } from '../../components/icons.jsx'
import { showToast } from '../../components/Toast.jsx'
import { useAccount } from '../../data/account.js'
import { chooseDeviceData } from '../../data/sync.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function BringData() {
  const { counts, consent } = useAccount()
  const [busy, setBusy] = useState(null)
  if (!counts) return null

  const choose = async (add) => {
    setBusy(add ? 'add' : 'later')
    try {
      await chooseDeviceData(add)
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

  return (
    <AuthScreen
      centered
      icon={UploadIcon}
      title="Bring this device’s data with you?"
      subtitle="This device already has some ImpactMe data. Add it to your account to see it on your other devices."
      actions={
        <>
          <PrimaryButton type="button" onClick={() => choose(true)} busy={busy === 'add'} disabled={Boolean(busy)}>
            {busy === 'add' ? 'Adding…' : 'Add to My Account'}
          </PrimaryButton>
          <button type="button" className="auth-link" onClick={() => choose(false)} disabled={Boolean(busy)}>
            Not Now
          </button>
        </>
      }
    >
      <div className="consent-card bring-list">
        {rows.map(([label, n]) => (
          <div key={label} className="bring-row">
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      {counts.journal > 0 && !consent.journal && (
        <p className="consent-note">
          Journal sync is off, so your {plural(counts.journal, 'journal entry', 'journal entries')} won’t be added to
          your account. They stay on this device.
        </p>
      )}
      <p className="consent-note">
        Not Now keeps this data aside. You can add it later in Settings.
      </p>
    </AuthScreen>
  )
}
