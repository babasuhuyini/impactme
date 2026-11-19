import { expect, test } from '@playwright/test'

// Sign-in screens. The e2e build points at an unreachable Supabase address
// (.env.e2e); its answers are faked here, so no real project is touched.

const SUPABASE = 'http://127.0.0.1:54321'
const EMAIL = 'tester@example.com'
const PASSWORD = 'correct-horse-1'

// Optional: set SHOTS=<folder> to save screenshots for visual review.
async function shot(page, name) {
  if (!process.env.SHOTS) return
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${process.env.SHOTS}/account-${name}.png` })
}

// Fails on Content Security Policy errors, page errors, and on personal data
// (the test email or password) appearing in the console.
function watchConsole(page) {
  const problems = []
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  page.on('console', (m) => {
    const text = m.text()
    if (/Content Security Policy|Refused to/i.test(text)) problems.push(`CSP: ${text}`)
    if (text.includes(EMAIL) || text.includes(PASSWORD)) problems.push(`personal data in console: ${m.type()}`)
  })
  return problems
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

function fakeSession() {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    user_metadata: { name: 'Tester' },
    app_metadata: { provider: 'email', providers: ['email'] },
    created_at: new Date().toISOString(),
  }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp: now + 3600, role: 'authenticated', aud: 'authenticated', email: EMAIL })}.c2ln`
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh-fake', user }
}

// A fake Supabase: email sign-in, and the consents table.
async function fakeSupabase(page) {
  const calls = { consentInserts: [], upserts: {}, journalDeleted: 0, accountDeleted: 0 }
  await page.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) })

    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const { password } = req.postDataJSON()
      if (password !== PASSWORD) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(200, fakeSession())
    }
    // Email links: 'good' is a valid one-time token, anything else is used up.
    if (url.pathname === '/auth/v1/verify' && req.method() === 'POST') {
      const { token_hash: hash } = req.postDataJSON()
      if (hash === 'good') return json(200, fakeSession())
      return json(403, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' })
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/settings') return json(200, { external: { email: true, google: false } })
    if (url.pathname === '/rest/v1/consents' && req.method() === 'GET') return json(200, [])
    if (url.pathname === '/rest/v1/consents' && req.method() === 'POST') {
      calls.consentInserts.push(req.postDataJSON())
      return json(201)
    }
    if (url.pathname === '/rest/v1/rpc/delete_my_journal_entries') {
      calls.journalDeleted++
      return route.fulfill({ status: 204 })
    }
    if (url.pathname === '/functions/v1/delete-account' && req.method() === 'POST') {
      calls.accountDeleted++
      return json(200, { ok: true })
    }
    // Sync: an empty account that accepts uploads.
    const table = url.pathname.match(/^\/rest\/v1\/(tasks|journal_entries|projects|user_settings)$/)?.[1]
    if (table && req.method() === 'GET') return json(200, [])
    if (table && req.method() === 'POST') {
      ;(calls.upserts[table] ??= []).push(...[].concat(req.postDataJSON()))
      return json(201)
    }
    return json(404, { message: 'not faked' })
  })
  return calls
}

test.describe('first launch', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows Welcome to a new user once, and Continue without an account skips it', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('./')
    // The first page load in a fresh browser can sit on the splash for a while.
    await expect(page.getByRole('heading', { name: 'ImpactMe' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Make Every Day Count.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in with Apple' })).toHaveCount(0)
    await shot(page, 'welcome')

    await page.getByRole('button', { name: 'Continue without an account' }).click()
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.locator('.shell')).toBeVisible()
    await page.reload()
    await expect(page.locator('.shell')).toBeVisible()
    await expect(page.getByText('Make Every Day Count.')).toHaveCount(0)
    expect(problems).toEqual([])
  })

  test('Google sign-in explains when Google isn’t switched on yet', async ({ page }) => {
    await fakeSupabase(page)
    await page.goto('./#/welcome')
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page.getByRole('alert')).toHaveText(/Google sign-in isn’t available yet/)
  })
})

test('email, password and create-account screens check what you type', async ({ page }) => {
  const problems = watchConsole(page)
  await page.goto('./#/welcome')
  await page.getByRole('button', { name: 'Continue with Email' }).click()
  await expect(page.getByRole('heading', { name: 'Continue with email' })).toBeVisible()
  await page.getByLabel('Email').fill('not-an-email')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toHaveText(/valid email/)
  await shot(page, 'email-error')

  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible()
  await expect(page.getByText(EMAIL)).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('secret')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await shot(page, 'password')

  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  await page.getByRole('button', { name: 'Create Account' }).click()
  await expect(page.getByText('Enter your name.')).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('short')
  await expect(page.locator('.auth-rule')).not.toHaveClass(/ok/)
  await page.getByLabel('Password', { exact: true }).fill('long enough')
  await expect(page.locator('.auth-rule')).toHaveClass(/ok/)
  await shot(page, 'create')

  await page.goto('./#/account/reset')
  await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(EMAIL)
  expect(problems).toEqual([])
})

test('sign in, wrong password, then Before you start, then the app', async ({ page }) => {
  const problems = watchConsole(page)
  const calls = await fakeSupabase(page)
  await page.goto('./#/account/email')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'That email and password don’t match. Try again, or create an account.'
  )

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  const boxes = page.locator('.consent-item input')
  await expect(boxes).toHaveCount(3)
  for (const box of await boxes.all()) await expect(box).not.toBeChecked()
  const go = page.getByRole('button', { name: 'Continue' })
  await expect(go).toBeDisabled()
  await expect(page.getByText('Your journal will stay on this device only.')).toBeVisible()
  await shot(page, 'consent')

  await page.getByText('I’m 16 or older.').click()
  await expect(go).toBeDisabled()
  await page.locator('.consent-item').nth(1).click({ position: { x: 20, y: 20 } })
  await expect(go).toBeEnabled()
  await go.click()

  await expect(page.locator('.shell')).toBeVisible()
  expect(calls.consentInserts).toHaveLength(1)
  expect(calls.consentInserts[0]).toEqual([
    { kind: 'age_16_plus', granted: true },
    { kind: 'terms_privacy_v1', granted: true },
    { kind: 'journal_health_v1', granted: false },
  ])

  await page.goto('./#/settings')
  await expect(page.locator('.account-who')).toContainText(EMAIL)
  await page.getByRole('button', { name: 'Sign Out' }).click()
  await expect(page.getByText('Sign in to sync your devices')).toBeVisible()
  expect(problems).toEqual([])
})

test('a signed-out person who has data sees the Settings row, not Welcome', async ({ page }) => {
  await page.goto('./#/settings')
  await page.getByText('Sign in to sync your devices').click()
  await expect(page.getByRole('heading', { name: 'ImpactMe' })).toBeVisible()
})

test('Privacy Policy and Terms open without signing in', async ({ page }) => {
  const problems = watchConsole(page)
  await page.goto('./#/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
  await expect(page.getByText('[TO BE WRITTEN BY TAYYIB]').first()).toBeVisible()
  await page.goto('./#/terms')
  await expect(page.getByRole('heading', { name: 'Terms', exact: true })).toBeVisible()
  expect(problems).toEqual([])
})

test('a link opened in another browser is explained and removed from the address', async ({ page }) => {
  await page.goto('./?code=abc123#/')
  await expect(page.getByText(/opened in a different browser/)).toBeVisible()
  await expect(page).not.toHaveURL(/code=/)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })

  test('forms are anchored to the bottom, with no sideways scrolling', async ({ page }) => {
    await page.goto('./#/welcome')
    await shot(page, 'phone-welcome')
    await page.getByRole('button', { name: 'Continue with Email' }).click()
    await page.getByLabel('Email').fill(EMAIL)
    await shot(page, 'phone-email')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible()
    await shot(page, 'phone-password')

    const button = await page.getByRole('button', { name: 'Sign In' }).boundingBox()
    expect(844 - (button.y + button.height)).toBeLessThan(60)
    const icon = await page.locator('.auth-icon').boundingBox()
    const title = await page.getByRole('heading', { name: 'Enter your password' }).boundingBox()
    expect(icon.y).toBeLessThan(title.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    await page.getByRole('link', { name: 'Create an account' }).click()
    await shot(page, 'phone-create')
    await expect(page.locator('.auth-icon')).toHaveCount(0)
  })
})

test('first sign-in with data on this device asks first, then adds it to the account', async ({ page }) => {
  const problems = watchConsole(page)
  const calls = await fakeSupabase(page)
  await page.goto('./#/tasks')
  await page.getByLabel('New task').fill('Buy plantains')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Buy plantains')).toBeVisible()

  await page.goto('./#/account/email')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByText('I’m 16 or older.').click()
  await page.locator('.consent-item').nth(1).click({ position: { x: 20, y: 20 } })
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Bring this device’s data with you?' })).toBeVisible()
  await expect(page.locator('.bring-row').filter({ hasText: 'Tasks' })).toContainText('1')
  await shot(page, 'bring-data')
  await page.getByRole('button', { name: 'Add to My Account' }).click()

  await expect(page.locator('.shell')).toBeVisible()
  await expect.poll(() => (calls.upserts.tasks ?? []).map((r) => r.data?.title)).toContain('Buy plantains')
  await expect.poll(() => (calls.upserts.user_settings ?? []).length).toBeGreaterThan(0)
  expect(problems).toEqual([])
})

test('Settings: journal sync off removes it from the account; Delete Account keeps this device’s data', async ({ page }) => {
  const problems = watchConsole(page)
  const calls = await fakeSupabase(page)
  await page.goto('./#/account/email')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByText('I’m 16 or older.').click()
  await page.locator('.consent-item').nth(1).click({ position: { x: 20, y: 20 } })
  await page.locator('.consent-item').nth(2).click({ position: { x: 20, y: 20 } })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.shell')).toBeVisible()

  await page.goto('./#/tasks')
  await page.getByLabel('New task').fill('Keep me')
  await page.keyboard.press('Enter')

  await page.goto('./#/settings')
  const journalSwitch = page.getByRole('checkbox', { name: /Sync journal entries/ })
  await expect(journalSwitch).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Sync this device/ })).toBeChecked()
  await shot(page, 'settings-signed-in')
  await journalSwitch.click()
  await page.getByRole('button', { name: 'Turn Off' }).click()
  await expect.poll(() => calls.journalDeleted).toBe(1)
  await expect(journalSwitch).not.toBeChecked()

  await page.getByRole('button', { name: 'Delete Account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  await expect(dialog.getByRole('checkbox', { name: /Also remove data from this device/ })).not.toBeChecked()
  await shot(page, 'delete-account')
  // Deleting needs the password again (a fresh sign-in).
  const remove = dialog.getByRole('button', { name: 'Delete Account' })
  await expect(remove).toBeDisabled()
  await dialog.getByLabel(/Enter your password/).fill('wrong-password')
  await remove.click()
  await expect(dialog.getByRole('alert')).toHaveText('That password isn’t right. Try again.')
  expect(calls.accountDeleted).toBe(0)
  await dialog.getByLabel(/Enter your password/).fill(PASSWORD)
  await remove.click()
  await expect(page.getByText('Your account was deleted. Your data is still on this device.')).toBeVisible()
  expect(calls.accountDeleted).toBe(1)
  await expect(page.getByText('Sign in to sync your devices')).toBeVisible()

  await page.goto('./#/tasks')
  await expect(page.getByText('Keep me')).toBeVisible()
  expect(problems).toEqual([])
})

test('an email link works on a device that never started the sign-up', async ({ page }) => {
  const problems = watchConsole(page)
  await fakeSupabase(page)
  await page.goto('./?token_hash=good&type=email#/')
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Your email is confirmed. Welcome to ImpactMe.')).toBeVisible()
  expect(page.url()).not.toMatch(/token_hash|type=/)
  expect(problems).toEqual([])
})

test('a used email link explains itself and signs no one in', async ({ page }) => {
  await fakeSupabase(page)
  await page.goto('./?token_hash=used&type=email#/settings')
  await expect(page.getByText(/That link has expired or was already used/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Sign in to sync your devices')).toBeVisible()
  expect(page.url()).not.toMatch(/token_hash/)
})
