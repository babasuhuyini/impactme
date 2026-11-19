// "Before you start": shown once after the first sign-in, before anything
// syncs. Items 1 and 2 are required. Item 3 (journal, mood and energy, which
// can be health information) is optional; without it journal entries stay on
// the device. Every box starts unticked. Each answer is saved as a row in
// `consents`.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthScreen, PrimaryButton } from '../../components/account/AuthLayout.jsx'
import { CheckIcon, ShieldIcon } from '../../components/icons.jsx'
import { saveConsent, signOut } from '../../data/account.js'

function Item({ checked, onChange, required, children }) {
  return (
    <label className="consent-item">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="consent-box" aria-hidden="true">
        <CheckIcon width={16} height={16} strokeWidth={3} />
      </span>
      <span className="consent-text">{children}</span>
      {required && <span className="consent-required">Required</span>}
    </label>
  )
}

export default function Consent() {
  const [age, setAge] = useState(false)
  const [terms, setTerms] = useState(false)
  const [journal, setJournal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await saveConsent({ age, terms, journal })
    // On success the app moves on by itself.
    if (result.error) {
      setError(result.error)
      setBusy(false)
    }
  }

  return (
    <AuthScreen
      centered
      icon={ShieldIcon}
      title="Before you start"
      subtitle="A few things we need from you. Only the last one is optional."
      actions={
        <>
          {error && (
            <p className="auth-error center" role="alert">
              {error}
            </p>
          )}
          <PrimaryButton type="button" onClick={submit} busy={busy} disabled={!age || !terms}>
            {busy ? 'Saving…' : 'Continue'}
          </PrimaryButton>
          <button type="button" className="auth-link" onClick={() => signOut()}>
            Sign out instead
          </button>
        </>
      }
    >
      <div className="consent-card">
        <Item checked={age} onChange={setAge} required>
          I’m 16 or older.
        </Item>
        <Item checked={terms} onChange={setTerms} required>
          I agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </Item>
        <Item checked={journal} onChange={setJournal}>
          Store my journal, mood and energy entries in my account so they sync. These can include health
          information. <Link to="/privacy?section=health">Why we ask</Link>
        </Item>
      </div>
      {!journal && (
        <p className="consent-note">
          Your journal will stay on this device only. You can turn journal sync on later in Settings.
        </p>
      )}
    </AuthScreen>
  )
}
