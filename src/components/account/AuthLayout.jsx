// Shared layout for the sign-in and account screens: full screen, outside the
// main app shell.
//
// Phones: form screens are anchored to the bottom, so the form sits just above
// the primary button and the button just above the on-screen keyboard; the
// step icon floats in the free space above the title. Screens without a text
// field centre their content above the button instead (`centered`).
// Wide screens (over 860px): the same content in a centred card.

import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, EyeIcon, EyeOffIcon } from '../icons.jsx'
import googleG from '../../assets/google-g.svg'

// Pins the screen to the part of the page you can actually see. When the
// keyboard opens, mobile browsers (iOS Safari and Chrome on Android) keep the
// page the same size and slide the visible area down over it. Shrinking the
// screen to that height alone left it at the top of the page, above the visible
// area, so the fields went off the top. So the screen follows the visible area's
// position as well as its height, and the focused field is scrolled back into view.
function useVisibleViewport(ref) {
  useEffect(() => {
    const el = ref.current
    const vv = window.visualViewport
    if (!el) return
    let frame = 0
    const apply = () => {
      frame = 0
      const height = vv?.height ?? window.innerHeight
      const top = vv?.offsetTop ?? 0
      el.style.setProperty('--auth-vh', `${height}px`)
      el.style.setProperty('--auth-top', `${top}px`)
    }
    const update = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    // After the keyboard opens or closes, bring the focused field back into view.
    const onResize = () => {
      update()
      const active = document.activeElement
      if (active && el.contains(active) && active.matches('input, textarea, select')) {
        requestAnimationFrame(() => active.scrollIntoView({ block: 'center' }))
      }
    }
    apply()
    vv?.addEventListener('resize', onResize)
    vv?.addEventListener('scroll', update)
    addEventListener('resize', onResize)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', onResize)
      vv?.removeEventListener('scroll', update)
      removeEventListener('resize', onResize)
    }
  }, [ref])
}

// Goes back within the app, or to `fallback` when this screen was opened directly.
export function useBack(fallback = '/welcome') {
  const navigate = useNavigate()
  return () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback, { replace: true }))
}

export function AuthScreen({ icon: Icon, badge, title, subtitle, children, actions, onBack, onSubmit, centered = false }) {
  const screen = useRef(null)
  useVisibleViewport(screen)
  const Panel = onSubmit ? 'form' : 'div'
  const submit = (e) => {
    e.preventDefault()
    onSubmit(e)
  }
  const icon = badge ?? (Icon && (
    <div className="auth-icon" aria-hidden="true">
      <Icon width={30} height={30} strokeWidth={1.9} />
    </div>
  ))
  const heading = (
    <>
      <h1 className="auth-title">{title}</h1>
      {subtitle && <p className="auth-sub">{subtitle}</p>}
    </>
  )

  return (
    <div className="auth" ref={screen}>
      <Panel className={centered ? 'auth-panel centered' : 'auth-panel'} onSubmit={onSubmit && submit} noValidate>
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack} aria-label="Back">
            <ArrowLeftIcon width={22} height={22} />
          </button>
        )}
        {centered ? (
          <div className="auth-group">
            {icon}
            {heading}
            <div className="auth-content">{children}</div>
          </div>
        ) : (
          <>
            <div className="auth-top">{icon}</div>
            {heading}
            <div className="auth-content">{children}</div>
          </>
        )}
        {actions && <div className="auth-actions">{actions}</div>}
      </Panel>
    </div>
  )
}

export function Field({ label, error, hint, children }) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errorId : undefined })}
      {hint}
      {error && (
        <p className="auth-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function PasswordInput({ value, onChange, autoComplete, autoFocus, ...field }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="auth-password">
      <input
        {...field}
        className="auth-input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        autoCapitalize="none"
        spellCheck={false}
      />
      <button
        type="button"
        className="auth-reveal"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOffIcon width={20} height={20} /> : <EyeIcon width={20} height={20} />}
      </button>
    </div>
  )
}

export const MIN_PASSWORD = 8

export function PasswordRule({ password }) {
  const ok = password.length >= MIN_PASSWORD
  return (
    <p className={ok ? 'auth-rule ok' : 'auth-rule'}>
      <span aria-hidden="true">{ok ? '✓' : '•'}</span> At least {MIN_PASSWORD} characters
    </p>
  )
}

export function GoogleButton({ onClick, disabled }) {
  return (
    <button type="button" className="auth-google" onClick={onClick} disabled={disabled}>
      <img src={googleG} width="20" height="20" alt="" />
      Continue with Google
    </button>
  )
}

export function PrimaryButton({ children, busy, disabled, type = 'submit', onClick }) {
  return (
    <button type={type} className="auth-primary" disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
      {children}
    </button>
  )
}
