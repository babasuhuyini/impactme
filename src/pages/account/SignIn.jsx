// Sign-in screens: Welcome, Continue with email, Enter your password, Create
// account, Confirm your email, Reset password and Set a new password.
// The email being used is kept in the account store's flow, so each screen
// can be reloaded on its own.

import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  AuthScreen,
  Field,
  GoogleButton,
  MIN_PASSWORD,
  PasswordInput,
  PasswordRule,
  PrimaryButton,
  useBack,
} from '../../components/account/AuthLayout.jsx'
import Turnstile, { captchaEnabled } from '../../components/account/Turnstile.jsx'
import { BrandMark, KeyIcon, LockIcon, MailIcon } from '../../components/icons.jsx'
import { showToast } from '../../components/Toast.jsx'
import {
  createAccount,
  getFlow,
  resendConfirmation,
  sendPasswordReset,
  setFlow,
  setNewPassword,
  signInWithEmail,
  signInWithGoogle,
} from '../../data/account.js'

const WELCOME_KEY = 'impactme.welcomeDismissed'
export function welcomeDismissed() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return true
  }
}
function dismissWelcome() {
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    // Storage blocked: the welcome may show again next time.
  }
}

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const RESEND_COOLDOWN = 60_000

// A CAPTCHA token, refreshed after each submit.
function useCaptcha() {
  const [token, setToken] = useState(null)
  const [resetKey, setResetKey] = useState(0)
  return {
    token,
    ready: !captchaEnabled || Boolean(token),
    widget: <Turnstile onToken={setToken} resetKey={resetKey} />,
    used: () => setResetKey((k) => k + 1),
  }
}

function CaptchaWait({ captcha }) {
  if (captcha.ready) return null
  return <p className="auth-hint">Running a quick security check…</p>
}

/* 1. Welcome --------------------------------------------------------------- */

export function Welcome() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const google = async () => {
    setBusy(true)
    setError(null)
    const result = await signInWithGoogle()
    // On success the page leaves for Google; only errors come back here.
    if (result.error) {
      setError(result.error)
      setBusy(false)
    }
  }
  const skip = () => {
    dismissWelcome()
    window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true })
  }

  return (
    <AuthScreen
      centered
      badge={<BrandMark size={72} className="auth-logo" />}
      title="ImpactMe"
      actions={
        <>
          <GoogleButton onClick={google} disabled={busy} />
          <PrimaryButton type="button" onClick={() => navigate('/account/email')}>
            Continue with Email
          </PrimaryButton>
          {error && (
            <p className="auth-error center" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="auth-link" onClick={skip}>
            Continue without an account
          </button>
          <p className="auth-legal">
            <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy Policy</Link>
          </p>
        </>
      }
    >
      <div className="auth-welcome">
        <p className="auth-tagline">Make Every Day Count.</p>
        <p className="auth-sub">Your personal space to plan, organize, reflect and grow.</p>
      </div>
    </AuthScreen>
  )
}

/* 2. Continue with email ----------------------------------------------------- */

export function EmailStep() {
  const navigate = useNavigate()
  const back = useBack('/welcome')
  const [email, setEmail] = useState(getFlow().email ?? '')
  const [error, setError] = useState(null)

  const submit = () => {
    if (!isEmail(email)) return setError('Enter a valid email address, like name@example.com.')
    setFlow({ email: email.trim() })
    navigate('/account/password')
  }

  return (
    <AuthScreen
      icon={MailIcon}
      title="Continue with email"
      subtitle="Sign in or create an account."
      onBack={back}
      onSubmit={submit}
      actions={<PrimaryButton>Continue</PrimaryButton>}
    >
      <Field label="Email" error={error}>
        {(field) => (
          <input
            {...field}
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        )}
      </Field>
    </AuthScreen>
  )
}

/* 3. Enter your password -------------------------------------------------- */

// Supabase doesn't say whether an email has an account (that protects
// people), so this title stays neutral rather than "Welcome back".
export function PasswordStep() {
  const navigate = useNavigate()
  const back = useBack('/account/email')
  const { email } = getFlow()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const captcha = useCaptcha()

  if (!email) return <Navigate to="/account/email" replace />

  const submit = async () => {
    if (!password) return setError('Enter your password.')
    setBusy(true)
    setError(null)
    const result = await signInWithEmail({ email, password, captchaToken: captcha.token })
    captcha.used()
    // On success the app moves on by itself once the account is ready.
    if (result.error) {
      setError(result.error)
      setBusy(false)
    }
  }

  return (
    <AuthScreen
      icon={LockIcon}
      title="Enter your password"
      onBack={back}
      onSubmit={submit}
      actions={
        <>
          {captcha.widget}
          <CaptchaWait captcha={captcha} />
          <PrimaryButton busy={busy} disabled={!captcha.ready}>
            {busy ? 'Signing In…' : 'Sign In'}
          </PrimaryButton>
        </>
      }
    >
      <EmailChip email={email} onChange={() => navigate('/account/email')} />
      <Field label="Password" error={error}>
        {(field) => (
          <PasswordInput
            {...field}
            value={password}
            onChange={(v) => {
              setPassword(v)
              setError(null)
            }}
            autoComplete="current-password"
            autoFocus
          />
        )}
      </Field>
      <div className="auth-row">
        <Link className="auth-link" to="/account/create">
          Create an account
        </Link>
        <Link className="auth-link" to="/account/reset">
          Forgot password?
        </Link>
      </div>
    </AuthScreen>
  )
}

function EmailChip({ email, onChange }) {
  return (
    <div className="auth-email">
      <span className="auth-email-value">{email}</span>
      <button type="button" className="auth-link" onClick={onChange}>
        Change
      </button>
    </div>
  )
}

/* 4. Create account ------------------------------------------------------- */

export function CreateAccount() {
  const navigate = useNavigate()
  const back = useBack('/account/password')
  const { email } = getFlow()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const captcha = useCaptcha()

  if (!email) return <Navigate to="/account/email" replace />

  const submit = async () => {
    const problems = {}
    if (!name.trim()) problems.name = 'Enter your name.'
    if (password.length < MIN_PASSWORD) problems.password = `Use at least ${MIN_PASSWORD} characters.`
    setErrors(problems)
    if (Object.keys(problems).length) return
    setBusy(true)
    const result = await createAccount({ name, email, password, captchaToken: captcha.token })
    captcha.used()
    setBusy(false)
    if (result.error) return setErrors({ form: result.error })
    setFlow({ sentAt: Date.now() })
    navigate('/account/confirm', { replace: true })
  }

  // No step icon: there isn't room above three fields on a phone.
  return (
    <AuthScreen
      title="Create account"
      onBack={back}
      onSubmit={submit}
      actions={
        <>
          {errors.form && (
            <p className="auth-error center" role="alert">
              {errors.form}
            </p>
          )}
          {captcha.widget}
          <CaptchaWait captcha={captcha} />
          <PrimaryButton busy={busy} disabled={!captcha.ready}>
            {busy ? 'Creating Account…' : 'Create Account'}
          </PrimaryButton>
        </>
      }
    >
      <EmailChip email={email} onChange={() => navigate('/account/email')} />
      <Field label="Name" error={errors.name}>
        {(field) => (
          <input
            {...field}
            className="auth-input"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Password" error={errors.password} hint={<PasswordRule password={password} />}>
        {(field) => <PasswordInput {...field} value={password} onChange={setPassword} autoComplete="new-password" />}
      </Field>
    </AuthScreen>
  )
}

/* 5. Confirm your email ------------------------------------------------------ */

function useCountdown(until) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!until || until <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])
  return Math.max(0, Math.ceil(((until ?? 0) - now) / 1000))
}

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function ConfirmEmail() {
  const navigate = useNavigate()
  const [{ email, sentAt }, setLocal] = useState(getFlow)
  const left = useCountdown(sentAt ? sentAt + RESEND_COOLDOWN : 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const captcha = useCaptcha()

  if (!email) return <Navigate to="/account/email" replace />

  const resend = async () => {
    setBusy(true)
    setError(null)
    const result = await resendConfirmation({ email, captchaToken: captcha.token })
    captcha.used()
    setBusy(false)
    if (result.error) return setError(result.error)
    setFlow({ sentAt: Date.now() })
    setLocal(getFlow())
    showToast('Email sent.')
  }

  return (
    <AuthScreen
      centered
      icon={MailIcon}
      title="Confirm your email"
      onBack={() => navigate('/account/email', { replace: true })}
      actions={
        <>
          {error && (
            <p className="auth-error center" role="alert">
              {error}
            </p>
          )}
          {left === 0 && captcha.widget}
          <PrimaryButton type="button" onClick={resend} busy={busy} disabled={left > 0 || !captcha.ready}>
            {left > 0 ? `Resend Email in ${clock(left)}` : busy ? 'Sending…' : 'Resend Email'}
          </PrimaryButton>
        </>
      }
    >
      <p className="auth-text">
        We sent a link to <strong>{email}</strong>. Open it to finish creating your account. It works on any of
        your devices.
      </p>
      <p className="auth-text muted">Can’t find it? Check your spam folder.</p>
      <button type="button" className="auth-link" onClick={() => navigate('/account/email', { replace: true })}>
        Use a different email
      </button>
      <button type="button" className="auth-link" onClick={() => navigate('/account/password')}>
        Already confirmed? Sign in
      </button>
    </AuthScreen>
  )
}

/* 6. Reset password ---------------------------------------------------------- */

export function ResetPassword() {
  const back = useBack('/account/password')
  const [email, setEmail] = useState(getFlow().email ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const captcha = useCaptcha()

  const submit = async () => {
    if (!isEmail(email)) return setError('Enter a valid email address, like name@example.com.')
    setBusy(true)
    setError(null)
    const result = await sendPasswordReset({ email, captchaToken: captcha.token })
    captcha.used()
    setBusy(false)
    if (result.error) return setError(result.error)
    setFlow({ email: email.trim() })
    setSent(true)
  }

  if (sent) {
    return (
      <AuthScreen
        centered
        icon={MailIcon}
        title="Check your email"
        onBack={back}
        actions={
          <PrimaryButton type="button" onClick={back}>
            Back to Sign In
          </PrimaryButton>
        }
      >
        <p className="auth-text">
          If there’s an account for <strong>{email.trim()}</strong>, we sent a link to reset its password.
        </p>
        <p className="auth-text muted">Can’t find it? Check your spam folder.</p>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      icon={KeyIcon}
      title="Reset password"
      subtitle="We’ll email you a link to set a new password."
      onBack={back}
      onSubmit={submit}
      actions={
        <>
          {captcha.widget}
          <CaptchaWait captcha={captcha} />
          <PrimaryButton busy={busy} disabled={!captcha.ready}>
            {busy ? 'Sending…' : 'Send Reset Link'}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Email" error={error}>
        {(field) => (
          <input
            {...field}
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        )}
      </Field>
    </AuthScreen>
  )
}

/* 7. Set a new password ------------------------------------------------------ */

// Opened by the app after a reset link (account.recovery).
export function NewPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    setBusy(true)
    setError(null)
    const result = await setNewPassword(password)
    setBusy(false)
    if (result.error) return setError(result.error)
    showToast('Your new password is saved.')
    navigate('/', { replace: true })
  }

  return (
    <AuthScreen
      icon={LockIcon}
      title="Set a new password"
      onSubmit={submit}
      actions={
        <PrimaryButton busy={busy}>{busy ? 'Saving…' : 'Save Password'}</PrimaryButton>
      }
    >
      <Field label="New password" error={error} hint={<PasswordRule password={password} />}>
        {(field) => (
          <PasswordInput
            {...field}
            value={password}
            onChange={(v) => {
              setPassword(v)
              setError(null)
            }}
            autoComplete="new-password"
            autoFocus
          />
        )}
      </Field>
    </AuthScreen>
  )
}
