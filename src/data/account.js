// Account and sign-in state, in the same style as store.js: module state plus
// useSyncExternalStore. Signing in is optional; without an account the app
// works exactly as before.
//
// Every action returns { error } where error is a plain-language message or
// null. Nothing here logs emails, names, passwords or tokens.

import { useSyncExternalStore } from 'react'
import { SITE_URL, supabase } from '../lib/supabase.js'

// Consent kinds. Bump the version in a kind to ask everyone again.
export const CONSENT = {
  age: 'age_16_plus',
  terms: 'terms_privacy_v1',
  journal: 'journal_health_v1',
}

let client = null
let state = {
  // 'loading' only until the saved session has been read on start.
  status: supabase ? 'loading' : 'unavailable', // | 'signed-out' | 'signed-in'
  user: null, // { id, email, name, provider: 'google' | 'email' }
  // true after a password reset link: show "Set a new password".
  recovery: false,
  // A message about a sign-in link that didn't work, shown once by the UI.
  notice: null,
  // The signed-in user's answers on "Before you start".
  // status: 'unknown' (not loaded) | 'needed' | 'done' | 'error'
  consent: { status: 'unknown', journal: false },
  // Filled in by the sync engine (sync.js).
  syncStatus: 'idle', // | 'syncing' | 'offline' | 'error'
  syncError: null, // a plain-language message while syncStatus is 'error'
  lastSyncedAt: null,
  // 'unknown' | 'linked' (syncing with this account) | 'choose' (first sign-in
  // with data on this device: "Bring this device's data with you?")
  device: 'unknown',
  counts: null, // { tasks, projects, journal } for the choose screen
  // The data on this device belongs to another account (choose screen only offers removing it).
  otherAccount: false,
  // Signed out without choosing to (session expired) while this device is
  // still linked: "Sign in again to keep syncing".
  reauth: false,
  // A snapshot from "Not Now" exists: "Add this device's earlier data".
  earlierData: false,
  // "Sync this device" is switched off.
  paused: false,
}
const listeners = new Set()
const set = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((notify) => notify())
}

export const getAccount = () => state
export const subscribeAccount = (notify) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}
export const useAccount = () => useSyncExternalStore(subscribeAccount, getAccount)

export const clearNotice = () => set({ notice: null })
// For the sync engine. Skips updates that change nothing, so listeners that
// react to account changes can't loop.
export const setSyncState = (patch) => {
  if (Object.keys(patch).some((k) => state[k] !== patch[k])) set(patch)
}

/* Start ------------------------------------------------------------------ */

let unsubscribe = null

// Reads the saved session and listens for sign-in changes. `authClient` is
// only passed in tests.
export async function initAccount(authClient = supabase) {
  unsubscribe?.()
  unsubscribe = null
  client = authClient
  if (!client) {
    set({ status: 'unavailable', user: null, recovery: false })
    return
  }
  set({ status: 'loading', user: null, recovery: false, consent: { status: 'unknown', journal: false } })

  // A confirmation or reset link from an email (?token_hash=…&type=…) is
  // checked first, so the app opens already signed in. It works in any
  // browser or device: nothing from the sign-up browser is needed.
  const emailLink = await verifyEmailLink()

  const { data } = client.auth.onAuthStateChange((event, session) => applyAuthEvent(event, session))
  unsubscribe = () => data.subscription.unsubscribe()

  // Waits until the client has finished with any `?code=` in the address.
  const { data: sessionData } = await client.auth.getSession()
  if (state.status === 'loading') applyAuthEvent('INITIAL_SESSION', sessionData?.session ?? null)
  // A reset link: "Set a new password" (its event fired before we listened).
  if (emailLink?.ok && emailLink.type === 'recovery' && state.status === 'signed-in') set({ recovery: true })

  if (typeof location !== 'undefined' && typeof history !== 'undefined') {
    const redirect = readAuthRedirect(location.href, {
      signedIn: state.status === 'signed-in',
      emailLink: emailLink && (emailLink.ok ? emailLink.type : emailLink.blocked ? 'blocked' : 'failed'),
    })
    if (redirect) {
      history.replaceState(history.state, '', redirect.cleanUrl)
      if (redirect.notice) set({ notice: redirect.notice })
    }
  }
}

export function applyAuthEvent(event, session) {
  if (event === 'SIGNED_OUT' || !session) {
    if (event === 'SIGNED_OUT') forgetConsent()
    set({ status: 'signed-out', user: null, recovery: false, consent: { status: 'unknown', journal: false } })
    return
  }
  const user = toUser(session.user)
  const sameUser = state.user?.id === user.id
  set({
    status: 'signed-in',
    user,
    ...(event === 'PASSWORD_RECOVERY' ? { recovery: true } : {}),
    ...(sameUser ? {} : { consent: { status: 'unknown', journal: false } }),
  })
  if (!sameUser) {
    clearFlow()
    // Supabase advises against awaiting other auth calls inside its listener.
    setTimeout(() => loadConsent(), 0)
  }
}

export function toUser(user) {
  const meta = user?.user_metadata ?? {}
  return {
    id: user.id,
    email: user.email ?? '',
    name: meta.name || meta.full_name || '',
    provider: user.app_metadata?.provider === 'google' ? 'google' : 'email',
  }
}

/* Links that come back from Supabase ------------------------------------- */

const AUTH_PARAMS = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'token_hash']

// The kinds of email link the app verifies itself (see the email templates in
// docs/email-templates.md).
const EMAIL_LINK_TYPES = new Set(['email', 'signup', 'recovery'])

// Verifies ?token_hash=…&type=… from a confirmation or reset email. Returns
// null when the address has none, else { ok, type }. The token is one-time
// and short-lived; it is removed from the address straight after.
async function verifyEmailLink() {
  if (typeof location === 'undefined') return null
  const params = new URLSearchParams(location.search)
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  if (!tokenHash || !EMAIL_LINK_TYPES.has(type)) return null
  // Someone is already signed in on this device: a link must never switch them
  // into another account (a link can come from anyone). They sign out first.
  try {
    const { data } = await client.auth.getSession()
    if (data?.session) return { ok: false, type, blocked: true }
  } catch {
    // Can't tell: carry on, the link is checked below.
  }
  try {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) console.warn('Email link failed', error.code ?? error.name ?? 'unknown')
    return { ok: !error, type }
  } catch (error) {
    console.warn('Email link failed', error?.name ?? 'unknown')
    return { ok: false, type }
  }
}

// After a sign-in, confirmation or reset link, the address may still carry
// auth parameters: an error (expired link, cancelled Google sign-in), or a
// `?code=` the client couldn't use because the link was opened in a different
// browser. Returns { cleanUrl, notice } or null when there's nothing to tidy.
// Error text from the address is never shown: it could be anything.
export function readAuthRedirect(href, { signedIn = false, emailLink } = {}) {
  const url = new URL(href)
  const params = {}
  for (const key of AUTH_PARAMS) {
    if (url.searchParams.has(key)) {
      params[key] = url.searchParams.get(key)
      url.searchParams.delete(key)
    }
  }
  // `type` only belongs to an email link.
  if (params.token_hash) url.searchParams.delete('type')
  // Errors can also arrive in the hash (#error=...), which isn't a route.
  const hash = url.hash.slice(1)
  if (hash && !hash.startsWith('/')) {
    const hashParams = new URLSearchParams(hash)
    if (AUTH_PARAMS.some((k) => hashParams.has(k))) {
      for (const key of AUTH_PARAMS) if (hashParams.has(key)) params[key] = hashParams.get(key)
      url.hash = '#/'
    }
  }
  if (!Object.keys(params).length) return null

  let notice = null
  if (params.token_hash) {
    if (emailLink === 'blocked') {
      notice = {
        tone: 'info',
        message: 'You’re already signed in on this device. To use that link, sign out first in Settings, then open it again.',
      }
    } else if (emailLink === 'failed') {
      notice = { tone: 'error', message: 'That link has expired or was already used. Ask for a new one.' }
    } else if (emailLink === 'email' || emailLink === 'signup') {
      notice = { tone: 'info', message: 'Your email is confirmed. Welcome to ImpactMe.' }
    }
  } else if (params.error || params.error_code || params.error_description) {
    const code = params.error_code || params.error
    if (code === 'otp_expired' || /expired|invalid/i.test(params.error_description ?? '')) {
      notice = { tone: 'error', message: 'That link has expired or was already used. Ask for a new one.' }
    } else if (code === 'access_denied') {
      notice = { tone: 'error', message: 'Sign-in was cancelled or didn’t finish. Please try again.' }
    } else {
      notice = { tone: 'error', message: 'Sign-in didn’t work. Please try again.' }
    }
  } else if (params.code && !signedIn) {
    notice = {
      tone: 'info',
      message:
        'This link was opened in a different browser from the one you started in. If you were confirming your email, it’s confirmed: sign in here to continue. To reset a password, open the link in the browser where you asked for it.',
    }
  }
  return { cleanUrl: url.toString(), notice }
}

/* Actions ---------------------------------------------------------------- */

const OFFLINE = 'You’re offline. Connect to the internet and try again.'

// Turns a Supabase auth error into a message for people. Only the error code
// and status are logged, never the message, which may contain an email.
export function friendlyAuthError(error) {
  if (!error) return null
  const code = error.code ?? ''
  // For a failed CAPTCHA, also log Cloudflare's reason code (for example
  // "timeout-or-duplicate"); it's a fixed code with no personal data.
  const reason = code === 'captcha_failed' ? (/\(([a-z-]+)\)/.exec(error.message ?? '')?.[1] ?? '') : ''
  console.warn('Account request failed', code || error.name || 'unknown', error.status ?? '', reason)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return OFFLINE
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return OFFLINE
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password don’t match. Try again, or create an account.'
    case 'email_not_confirmed':
      return 'Confirm your email first. Open the link we sent you, then sign in.'
    case 'weak_password':
      return 'Choose a stronger password, at least 8 characters.'
    case 'same_password':
      return 'Choose a password you haven’t used for this account before.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead.'
    case 'captcha_failed':
      return 'The security check didn’t work. Please try again.'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Check the email address and try again.'
    case 'signup_disabled':
      return 'New accounts can’t be created right now. Please try again later.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute, then try again.'
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Your sign-in has expired. Sign in again.'
    default:
      if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.'
      return 'Something went wrong. Please try again.'
  }
}

async function call(run) {
  if (!client) return { error: 'Accounts aren’t available in this version of ImpactMe.' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: OFFLINE }
  try {
    const { error } = await run(client.auth)
    return { error: friendlyAuthError(error) }
  } catch (error) {
    return { error: friendlyAuthError(error) }
  }
}

// Leaves the page for Google, then comes back to SITE_URL with `?code=`.
// Checks first that Google is switched on in Supabase; otherwise the browser
// would land on a bare error page.
export async function signInWithGoogle() {
  if (!client) return { error: 'Accounts aren’t available in this version of ImpactMe.' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: OFFLINE }
  try {
    const res = await fetch(`${client.supabaseUrl}/auth/v1/settings`, { headers: { apikey: client.supabaseKey } })
    const settings = await res.json()
    if (!settings?.external?.google) return { error: 'Google sign-in isn’t available yet. Continue with email instead.' }
  } catch (error) {
    return { error: friendlyAuthError({ name: 'AuthRetryableFetchError', status: 0 }) }
  }
  return call((auth) => auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE_URL } }))
}

export const signInWithEmail = ({ email, password, captchaToken }) =>
  call((auth) => auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } }))

// On success the person must confirm their email before they can sign in.
// Supabase answers the same way whether or not the email already has an
// account, so this never reveals who has one.
export const createAccount = ({ name, email, password, captchaToken }) =>
  call((auth) =>
    auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: SITE_URL, data: { name: name.trim() }, captchaToken },
    })
  )

export const resendConfirmation = ({ email, captchaToken }) =>
  call((auth) =>
    auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: SITE_URL, captchaToken } })
  )

export const sendPasswordReset = ({ email, captchaToken }) =>
  call((auth) => auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL, captchaToken }))

// After a reset link (state.recovery is true).
export async function setNewPassword(password) {
  const result = await call((auth) => auth.updateUser({ password }))
  if (!result.error) set({ recovery: false })
  return result
}

// Signs out of this device only (sync.js signOutDevice() wraps this with the
// final push and clearing the account's data). Works offline: the library
// removes the session here first, then tries to revoke it on the server, so a
// failed request doesn't leave anyone signed in on a shared device.
export async function signOut() {
  if (!client) return { error: null }
  try {
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) console.warn('Sign-out request failed', error.code ?? error.name ?? 'unknown')
  } catch (error) {
    console.warn('Sign-out request failed', error?.name ?? 'unknown')
  }
  return { error: null }
}

/* Confirming it's you (before deleting the account) ----------------------- */

// The server requires a sign-in within 10 minutes to delete an account; the
// app treats 8 minutes as recent so there's time to press Delete.
export const RECENT_SIGN_IN_MS = 8 * 60 * 1000

// When this session last proved who it is (password or Google), from the
// `amr` timestamps in the access token, or 0 if unknown. Refreshing a session
// doesn't change it; signing in again does.
export async function lastSignInAt() {
  try {
    const { data } = await client.auth.getSession()
    const part = data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')), (c) => c.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    const times = (claims.amr ?? []).map((a) => Number(a.timestamp)).filter(Number.isFinite)
    return times.length ? Math.max(...times) * 1000 : 0
  } catch {
    return 0
  }
}

// Email accounts: the password again (a fresh sign-in as the same person).
export const confirmWithPassword = ({ password, captchaToken }) =>
  state.user ? signInWithEmail({ email: state.user.email, password, captchaToken }) : { error: 'Sign in first.' }

// Google accounts: a fresh Google sign-in. The page leaves for Google; the
// delete dialog reopens on return (it never deletes without a final click).
const DELETE_INTENT_KEY = 'impactme.deleteAfterSignIn'
export async function confirmWithGoogle({ removeLocal }) {
  try {
    sessionStorage.setItem(
      DELETE_INTENT_KEY,
      JSON.stringify({ userId: state.user?.id, removeLocal: Boolean(removeLocal), at: Date.now() })
    )
  } catch {
    // Storage blocked: after returning, Delete Account just has to be opened again.
  }
  const result = await signInWithGoogle()
  if (result.error) clearDeleteIntent()
  return result
}

// A delete in progress before a Google sign-in, if it's this user's and recent.
export function getDeleteIntent() {
  try {
    const intent = JSON.parse(sessionStorage.getItem(DELETE_INTENT_KEY))
    if (intent && intent.userId === state.user?.id && Date.now() - intent.at < 10 * 60 * 1000) return intent
  } catch {
    // Nothing usable.
  }
  return null
}

export function clearDeleteIntent() {
  try {
    sessionStorage.removeItem(DELETE_INTENT_KEY)
  } catch {
    // Nothing to clear.
  }
}

/* Consent ---------------------------------------------------------------- */

// Reads the latest answer for each kind. Ask again only when a required kind
// (a new policy version) has no "granted" answer.
export async function loadConsent() {
  const userId = state.user?.id
  if (!client || !userId) return
  try {
    const { data, error } = await client
      .from('consents')
      .select('kind, granted, recorded_at')
      .order('recorded_at', { ascending: false })
    if (error) throw error
    if (state.user?.id !== userId) return
    const latest = {}
    for (const row of data ?? []) if (!(row.kind in latest)) latest[row.kind] = row.granted
    const done = latest[CONSENT.age] === true && latest[CONSENT.terms] === true
    const consent = { status: done ? 'done' : 'needed', journal: latest[CONSENT.journal] === true }
    rememberConsent(userId, consent)
    set({ consent })
  } catch (error) {
    console.warn('Couldn’t read consent records', error?.code ?? error?.name ?? 'unknown')
    if (state.user?.id !== userId) return
    // Offline: use the answers this device last saw for this user.
    const cached = recalledConsent(userId)
    set({ consent: cached ?? { ...state.consent, status: 'error' } })
  }
}

// The last known answers, so opening the app offline doesn't ask again.
// Removed on sign-out.
const CONSENT_KEY = 'impactme.consent'
function rememberConsent(userId, consent) {
  try {
    if (consent.status === 'done') localStorage.setItem(CONSENT_KEY, JSON.stringify({ userId, journal: consent.journal }))
    else localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Storage blocked.
  }
}
function recalledConsent(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(CONSENT_KEY))
    return saved?.userId === userId ? { status: 'done', journal: Boolean(saved.journal) } : null
  } catch {
    return null
  }
}
function forgetConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Storage blocked.
  }
}

// Saves the answers from "Before you start", one row per answer.
export async function saveConsent({ age, terms, journal }) {
  if (!age || !terms) return { error: 'Tick the first two boxes to continue.' }
  const result = await call(() =>
    client.from('consents').insert([
      { kind: CONSENT.age, granted: true },
      { kind: CONSENT.terms, granted: true },
      { kind: CONSENT.journal, granted: Boolean(journal) },
    ])
  )
  if (!result.error) {
    const consent = { status: 'done', journal: Boolean(journal) }
    rememberConsent(state.user.id, consent)
    set({ consent })
  }
  return result
}

// Settings › Account › "Sync journal entries": records the new answer.
export async function setJournalConsent(granted) {
  const result = await call(() => client.from('consents').insert({ kind: CONSENT.journal, granted: Boolean(granted) }))
  if (!result.error) {
    const consent = { ...state.consent, journal: Boolean(granted) }
    rememberConsent(state.user.id, consent)
    set({ consent })
  }
  return result
}

/* The email being used across the sign-in screens -------------------------- */

// Kept for this tab only, so a reload on "Confirm your email" still knows the
// address. Cleared once someone signs in.
const FLOW_KEY = 'impactme.signInFlow'
let flow = null

export function getFlow() {
  if (flow) return flow
  try {
    flow = JSON.parse(sessionStorage.getItem(FLOW_KEY)) ?? {}
  } catch {
    flow = {}
  }
  return flow
}

export function setFlow(patch) {
  flow = { ...getFlow(), ...patch }
  try {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow))
  } catch {
    // Storage blocked: the flow still works until the page reloads.
  }
}

export function clearFlow() {
  flow = {}
  try {
    sessionStorage.removeItem(FLOW_KEY)
  } catch {
    // Nothing to clear.
  }
}
