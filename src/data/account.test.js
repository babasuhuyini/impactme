import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyAuthEvent,
  createAccount,
  friendlyAuthError,
  getAccount,
  initAccount,
  readAuthRedirect,
  saveConsent,
  setNewPassword,
  signInWithEmail,
} from './account.js'

const SITE = 'https://example.github.io/impactme/'

function fakeClient({ session = null } = {}) {
  const calls = []
  let listener = null
  const auth = {
    onAuthStateChange(fn) {
      listener = fn
      return { data: { subscription: { unsubscribe() {} } } }
    },
    getSession: async () => ({ data: { session } }),
    signInWithPassword: async (args) => (calls.push(['signInWithPassword', args]), { error: null }),
    signUp: async (args) => (calls.push(['signUp', args]), { error: null }),
    updateUser: async (args) => (calls.push(['updateUser', args]), { error: null }),
  }
  return { auth, calls, emit: (event, s) => listener(event, s) }
}

const session = (provider = 'email') => ({
  user: { id: 'u1', email: 'a@example.com', user_metadata: { name: 'Ama' }, app_metadata: { provider } },
})

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

describe('auth state', () => {
  it('is unavailable without a client', async () => {
    await initAccount(null)
    expect(getAccount().status).toBe('unavailable')
  })

  it('reads the saved session on start', async () => {
    await initAccount(fakeClient({ session: session('google') }))
    expect(getAccount()).toMatchObject({
      status: 'signed-in',
      user: { id: 'u1', email: 'a@example.com', name: 'Ama', provider: 'google' },
    })
  })

  it('is signed out when there is no session', async () => {
    await initAccount(fakeClient())
    expect(getAccount()).toMatchObject({ status: 'signed-out', user: null })
  })

  it('follows sign-in, password recovery and sign-out events', async () => {
    const client = fakeClient()
    await initAccount(client)
    client.emit('SIGNED_IN', session())
    expect(getAccount()).toMatchObject({ status: 'signed-in', recovery: false })
    client.emit('PASSWORD_RECOVERY', session())
    expect(getAccount().recovery).toBe(true)
    client.emit('TOKEN_REFRESHED', session())
    expect(getAccount().recovery).toBe(true)
    client.emit('SIGNED_OUT', null)
    expect(getAccount()).toMatchObject({ status: 'signed-out', user: null, recovery: false })
  })

  it('clears recovery after a new password is saved', async () => {
    await initAccount(fakeClient())
    applyAuthEvent('PASSWORD_RECOVERY', session())
    const { error } = await setNewPassword('new-password-1')
    expect(error).toBeNull()
    expect(getAccount().recovery).toBe(false)
  })
})

describe('actions', () => {
  it('passes the CAPTCHA token and trims the email', async () => {
    const client = fakeClient()
    await initAccount(client)
    await signInWithEmail({ email: ' a@example.com ', password: 'pw', captchaToken: 'tok' })
    expect(client.calls[0]).toEqual([
      'signInWithPassword',
      { email: 'a@example.com', password: 'pw', options: { captchaToken: 'tok' } },
    ])
  })

  it('creates an account with the name and the site address for the email link', async () => {
    const client = fakeClient()
    await initAccount(client)
    await createAccount({ name: ' Ama ', email: 'a@example.com', password: 'password1', captchaToken: 't' })
    const [, args] = client.calls[0]
    expect(args.options.data).toEqual({ name: 'Ama' })
    expect(args.options.captchaToken).toBe('t')
    expect('emailRedirectTo' in args.options).toBe(true)
  })

  it('returns a plain message instead of throwing', async () => {
    const client = fakeClient()
    client.auth.signInWithPassword = async () => ({ error: { code: 'invalid_credentials', status: 400 } })
    await initAccount(client)
    const { error } = await signInWithEmail({ email: 'a@example.com', password: 'x' })
    expect(error).toBe('That email and password don’t match. Try again, or create an account.')
  })

  it('never logs the error message, which can contain an email', () => {
    friendlyAuthError({ code: 'x', status: 400, message: 'secret@example.com is bad' })
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('secret@example.com')
  })
})

describe('readAuthRedirect', () => {
  it('ignores ordinary addresses', () => {
    expect(readAuthRedirect(`${SITE}#/tasks`)).toBeNull()
    expect(readAuthRedirect(`${SITE}?task=1#/`)).toBeNull()
  })

  it('removes an expired-link error and explains it', () => {
    const r = readAuthRedirect(
      `${SITE}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#/`
    )
    expect(r.cleanUrl).toBe(`${SITE}#/`)
    expect(r.notice.message).toMatch(/expired/)
  })

  it('handles errors sent in the hash', () => {
    const r = readAuthRedirect(`${SITE}#error=access_denied&error_description=cancelled`)
    expect(r.cleanUrl).toBe(`${SITE}#/`)
    expect(r.notice.tone).toBe('error')
  })

  it('never shows the error text from the address', () => {
    const r = readAuthRedirect(`${SITE}?error=server_error&error_description=Call+this+number`)
    expect(r.notice.message).not.toMatch(/number/)
  })

  it('explains a link opened in a different browser', () => {
    const r = readAuthRedirect(`${SITE}?code=abc#/`)
    expect(r.cleanUrl).toBe(`${SITE}#/`)
    expect(r.notice.message).toMatch(/different browser/)
  })

  it('tidies a leftover code quietly when signed in', () => {
    const r = readAuthRedirect(`${SITE}?code=abc&task=7#/`, { signedIn: true })
    expect(r.cleanUrl).toBe(`${SITE}?task=7#/`)
    expect(r.notice).toBeNull()
  })
})

describe('consent', () => {
  // A client whose consents table holds `rows` (newest first), or fails.
  function consentClient(rows, { fail = false } = {}) {
    const client = fakeClient()
    client.inserted = []
    client.from = () => ({
      select: () => ({
        order: async () => (fail ? { data: null, error: { code: 'network' } } : { data: rows, error: null }),
      }),
      insert: async (r) => (client.inserted.push(r), { error: null }),
    })
    return client
  }
  const signIn = async (client) => {
    await initAccount(client)
    client.emit('SIGNED_IN', session())
    await new Promise((r) => setTimeout(r, 10))
  }
  const memory = new Map()
  beforeEach(() => {
    memory.clear()
    globalThis.localStorage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
    }
  })
  afterEach(() => delete globalThis.localStorage)

  it('is needed when there are no answers yet', async () => {
    await signIn(consentClient([]))
    expect(getAccount().consent).toEqual({ status: 'needed', journal: false })
  })

  it('is done when the latest age and terms answers are yes, and reads the journal answer', async () => {
    await signIn(
      consentClient([
        { kind: 'journal_health_v1', granted: false },
        { kind: 'age_16_plus', granted: true },
        { kind: 'terms_privacy_v1', granted: true },
        { kind: 'journal_health_v1', granted: true },
      ])
    )
    expect(getAccount().consent).toEqual({ status: 'done', journal: false })
  })

  it('asks again for a new policy version', async () => {
    await signIn(
      consentClient([
        { kind: 'age_16_plus', granted: true },
        { kind: 'terms_privacy_v0', granted: true },
      ])
    )
    expect(getAccount().consent.status).toBe('needed')
  })

  it('needs both required boxes, and saves one row per answer', async () => {
    const client = consentClient([])
    await signIn(client)
    expect((await saveConsent({ age: true, terms: false, journal: true })).error).toBeTruthy()
    expect(client.inserted).toEqual([])
    expect((await saveConsent({ age: true, terms: true, journal: true })).error).toBeNull()
    expect(client.inserted[0].map((r) => [r.kind, r.granted])).toEqual([
      ['age_16_plus', true],
      ['terms_privacy_v1', true],
      ['journal_health_v1', true],
    ])
    expect(getAccount().consent).toEqual({ status: 'done', journal: true })
  })

  it('offline, uses the answers this device last saw for the same user only', async () => {
    const client = consentClient([])
    await signIn(client)
    await saveConsent({ age: true, terms: true, journal: false })
    client.emit('SIGNED_OUT', null)
    expect(memory.size).toBe(0) // forgotten on sign-out

    await saveConsentAs(client)
    const offline = consentClient(null, { fail: true })
    await signIn(offline)
    expect(getAccount().consent).toEqual({ status: 'done', journal: false })
  })

  async function saveConsentAs(client) {
    await signIn(client)
    await saveConsent({ age: true, terms: true, journal: false })
  }
})

describe('email links (?token_hash=…&type=…)', () => {
  it('removes the one-time token and says the email is confirmed', () => {
    const r = readAuthRedirect(`${SITE}?token_hash=abc123&type=email#/`, { emailLink: 'email' })
    expect(r.cleanUrl).toBe(`${SITE}#/`)
    expect(r.notice).toEqual({ tone: 'info', message: 'Your email is confirmed. Welcome to ImpactMe.' })
  })

  it('explains an expired or used link', () => {
    const r = readAuthRedirect(`${SITE}?token_hash=abc123&type=recovery#/`, { emailLink: 'failed' })
    expect(r.cleanUrl).toBe(`${SITE}#/`)
    expect(r.notice.message).toMatch(/expired or was already used/)
  })

  it('leaves a `type` parameter alone when it isn’t part of an email link', () => {
    expect(readAuthRedirect(`${SITE}?type=x#/`)).toBeNull()
  })

  describe('verifying on start', () => {
    let replaced
    beforeEach(() => {
      replaced = null
      globalThis.history = { state: null, replaceState: (_s, _t, url) => (replaced = url) }
    })
    afterEach(() => {
      delete globalThis.location
      delete globalThis.history
    })

    function linkClient(result) {
      const client = fakeClient()
      client.verified = []
      client.auth.verifyOtp = async (args) => {
        client.verified.push(args)
        return result
      }
      return client
    }

    it('a reset link opens “Set a new password”, signed in, on any device', async () => {
      globalThis.location = new URL(`${SITE}?token_hash=tok&type=recovery#/`)
      const client = linkClient({ error: null })
      client.auth.getSession = async () => ({ data: { session: session() } })
      await initAccount(client)
      expect(client.verified).toEqual([{ token_hash: 'tok', type: 'recovery' }])
      expect(getAccount()).toMatchObject({ status: 'signed-in', recovery: true })
      expect(replaced).toBe(`${SITE}#/`)
    })

    it('a used link changes nothing and says so', async () => {
      globalThis.location = new URL(`${SITE}?token_hash=old&type=email#/`)
      await initAccount(linkClient({ error: { code: 'otp_expired', status: 403 } }))
      expect(getAccount()).toMatchObject({ status: 'signed-out', recovery: false })
      expect(getAccount().notice.message).toMatch(/expired/)
      expect(replaced).toBe(`${SITE}#/`)
    })

    it('ignores link types the app doesn’t handle', async () => {
      globalThis.location = new URL(`${SITE}?token_hash=tok&type=magiclink#/`)
      const client = linkClient({ error: null })
      await initAccount(client)
      expect(client.verified).toEqual([])
    })
  })
})
