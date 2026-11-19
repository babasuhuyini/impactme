// Row Level Security check for ImpactMe's sync tables.
//
// Signs in as two test users with the PUBLISHABLE key only and proves that
// user B can't read, insert, update, overwrite or delete user A's rows, and
// that a signed-out caller can't read anything.
//
// Setup (once): in Supabase › Authentication › Users › Add user, create two
// users with "Auto Confirm User" ticked. Then run (bash):
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   USER_A_EMAIL=... USER_A_PASSWORD=... \
//   USER_B_EMAIL=... USER_B_PASSWORD=... \
//   node supabase/tests/rls-check.mjs
//
// If CAPTCHA protection is already on, either run this before turning it on,
// or temporarily use Cloudflare's "always passes" Turnstile test secret in
// Supabase and set CAPTCHA_TOKEN=XXXX.DUMMY.TOKEN.XXXX.
//
// Rows written by the check stay in the test users' accounts (users can't
// delete rows). Delete the two test users afterwards to remove them.
// Never prints tokens or passwords.

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CAPTCHA_TOKEN } = process.env
const need = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'USER_A_EMAIL', 'USER_A_PASSWORD', 'USER_B_EMAIL', 'USER_B_PASSWORD']
const missing = need.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`)
  process.exit(2)
}
if (/^sb_secret_/.test(SUPABASE_PUBLISHABLE_KEY) || /service_role/.test(SUPABASE_PUBLISHABLE_KEY)) {
  console.error('That is a secret key. This check must run with the publishable key.')
  process.exit(2)
}

const base = SUPABASE_URL.replace(/\/$/, '')

async function signIn(label, email, password) {
  const body = { email, password }
  if (CAPTCHA_TOKEN) body.gotrue_meta_security = { captcha_token: CAPTCHA_TOKEN }
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`Sign-in failed for user ${label} (${res.status}): ${json.error_description || json.msg || json.error || 'unknown error'}`)
    console.error(`Check USER_${label}_EMAIL and USER_${label}_PASSWORD. In PowerShell, use single quotes around values that contain $.`)
    process.exit(2)
  }
  return { token: json.access_token, id: json.user.id }
}

// Calls the REST API. Returns { status, rows } where rows is an array or null.
async function rest(session, method, path, body, prefer = 'return=representation') {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Prefer: prefer }
  if (session) headers.Authorization = `Bearer ${session.token}`
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let rows = null
  try { rows = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  return { status: res.status, rows: Array.isArray(rows) ? rows : null, error: Array.isArray(rows) ? null : rows }
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  pass  ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`) }
}
const denied = (r) => r.status >= 400 || (Array.isArray(r.rows) && r.rows.length === 0)
const describe = (r) => `status ${r.status}, ${r.rows ? `${r.rows.length} rows` : (r.error?.code || r.error?.message || 'no body')}`

const run = Date.now()
const A = await signIn('A', process.env.USER_A_EMAIL, process.env.USER_A_PASSWORD)
const B = await signIn('B', process.env.USER_B_EMAIL, process.env.USER_B_PASSWORD)
if (A.id === B.id) {
  console.error('User A and user B are the same account. Use two different users.')
  process.exit(2)
}

// ---- Record tables -------------------------------------------------------
for (const table of ['tasks', 'journal_entries', 'projects']) {
  console.log(`\n${table}`)
  const id = `rls-check-${run}`
  const record = { id, title: 'rls check' }
  const t = run

  const a1 = await rest(A, 'POST', table, { id, data: record, deleted: false, changed_at: t })
  check('A can insert own row', a1.status === 201 && a1.rows?.[0]?.user_id === A.id, describe(a1))

  const aRead = await rest(A, 'GET', `${table}?id=eq.${id}`)
  check('A can read own row', aRead.rows?.length === 1, describe(aRead))

  const bSel = await rest(B, 'GET', `${table}?user_id=eq.${A.id}`)
  check("B can't select A's rows", denied(bSel), describe(bSel))

  const bSelAll = await rest(B, 'GET', table)
  check("B's unfiltered select has none of A's rows", (bSelAll.rows || []).every((r) => r.user_id === B.id), describe(bSelAll))

  const bIns = await rest(B, 'POST', table, { user_id: A.id, id: `${id}-b`, data: record, deleted: false, changed_at: t })
  check("B can't insert a row as A", bIns.status >= 400, describe(bIns))

  const bUpd = await rest(B, 'PATCH', `${table}?user_id=eq.${A.id}&id=eq.${id}`, { data: { id, title: 'hacked' }, changed_at: t + 10_000 })
  check("B can't update A's row", denied(bUpd), describe(bUpd))

  const bUps = await rest(B, 'POST', `${table}?on_conflict=user_id,id`,
    { user_id: A.id, id, data: { id, title: 'hacked' }, deleted: false, changed_at: t + 20_000 },
    'resolution=merge-duplicates,return=representation')
  check("B can't overwrite A's row with an upsert", bUps.status >= 400, describe(bUps))

  const bDel = await rest(B, 'DELETE', `${table}?user_id=eq.${A.id}`)
  check("B can't delete A's rows", denied(bDel), describe(bDel))

  const aDel = await rest(A, 'DELETE', `${table}?id=eq.${id}`)
  check("A can't hard-delete own rows (tombstones only)", denied(aDel), describe(aDel))

  const anon = await rest(null, 'GET', table)
  check('Signed-out caller reads nothing', denied(anon), describe(anon))

  const after = await rest(A, 'GET', `${table}?id=eq.${id}`)
  check("A's row is unchanged", after.rows?.[0]?.data?.title === 'rls check', describe(after))

  // Last change wins (trigger).
  const older = await rest(A, 'POST', `${table}?on_conflict=user_id,id`,
    { id, data: { id, title: 'older' }, deleted: false, changed_at: t - 1000 },
    'resolution=merge-duplicates,return=representation')
  const afterOlder = await rest(A, 'GET', `${table}?id=eq.${id}`)
  check('An older change does not replace a newer row', older.status < 400 && afterOlder.rows?.[0]?.data?.title === 'rls check', describe(afterOlder))

  const newer = await rest(A, 'POST', `${table}?on_conflict=user_id,id`,
    { id, data: null, deleted: true, changed_at: t + 1000 },
    'resolution=merge-duplicates,return=representation')
  check('A newer tombstone replaces the row', newer.rows?.[0]?.deleted === true && newer.rows?.[0]?.data === null, describe(newer))
}

// ---- user_settings -------------------------------------------------------
console.log('\nuser_settings')
{
  const aUps = await rest(A, 'POST', 'user_settings?on_conflict=user_id',
    { data: { name: 'rls check' }, changed_at: run },
    'resolution=merge-duplicates,return=representation')
  check('A can upsert own settings', aUps.status < 400 && aUps.rows?.[0]?.user_id === A.id, describe(aUps))

  const bSel = await rest(B, 'GET', `user_settings?user_id=eq.${A.id}`)
  check("B can't select A's settings", denied(bSel), describe(bSel))

  const bUpd = await rest(B, 'PATCH', `user_settings?user_id=eq.${A.id}`, { data: { name: 'hacked' }, changed_at: run + 10_000 })
  check("B can't update A's settings", denied(bUpd), describe(bUpd))

  const bUps = await rest(B, 'POST', 'user_settings?on_conflict=user_id',
    { user_id: A.id, data: { name: 'hacked' }, changed_at: run + 20_000 },
    'resolution=merge-duplicates,return=representation')
  check("B can't overwrite A's settings with an upsert", bUps.status >= 400, describe(bUps))

  const bDel = await rest(B, 'DELETE', `user_settings?user_id=eq.${A.id}`)
  check("B can't delete A's settings", denied(bDel), describe(bDel))

  const anon = await rest(null, 'GET', 'user_settings')
  check('Signed-out caller reads nothing', denied(anon), describe(anon))

  const after = await rest(A, 'GET', 'user_settings')
  check("A's settings are unchanged", after.rows?.[0]?.data?.name === 'rls check', describe(after))
}

// ---- consents ------------------------------------------------------------
console.log('\nconsents')
{
  const kind = `rls_check_${run}`
  const aIns = await rest(A, 'POST', 'consents', { kind, granted: true, recorded_at: '2000-01-01T00:00:00Z' })
  check('A can record a consent', aIns.status === 201 && aIns.rows?.[0]?.user_id === A.id, describe(aIns))
  check('The server sets the consent time', aIns.rows?.[0] && !aIns.rows[0].recorded_at.startsWith('2000'), describe(aIns))

  const bSel = await rest(B, 'GET', `consents?user_id=eq.${A.id}`)
  check("B can't select A's consents", denied(bSel), describe(bSel))

  const bIns = await rest(B, 'POST', 'consents', { user_id: A.id, kind, granted: false })
  check("B can't record a consent as A", bIns.status >= 400, describe(bIns))

  const aUpd = await rest(A, 'PATCH', `consents?kind=eq.${kind}`, { granted: false })
  check("A can't change a consent record", denied(aUpd), describe(aUpd))

  const aDel = await rest(A, 'DELETE', `consents?kind=eq.${kind}`)
  check("A can't delete a consent record", denied(aDel), describe(aDel))

  const after = await rest(A, 'GET', `consents?kind=eq.${kind}`)
  check("A's consent record is unchanged", after.rows?.length === 1 && after.rows[0].granted === true, describe(after))

  const anon = await rest(null, 'GET', 'consents')
  check('Signed-out caller reads nothing', denied(anon), describe(anon))
}

// ---- delete_my_journal_entries ------------------------------------------
console.log('\ndelete_my_journal_entries')
{
  const id = `rls-check-journal-${run}`
  await rest(A, 'POST', 'journal_entries', { id, data: { id }, deleted: false, changed_at: run })
  const bId = `rls-check-journal-b-${run}`
  await rest(B, 'POST', 'journal_entries', { id: bId, data: { id: bId }, deleted: false, changed_at: run })

  const bCall = await rest(B, 'POST', 'rpc/delete_my_journal_entries', {})
  check('B can call it', bCall.status < 400, describe(bCall))

  const aStill = await rest(A, 'GET', `journal_entries?id=eq.${id}`)
  check("B's call leaves A's journal rows alone", aStill.rows?.length === 1, describe(aStill))

  const bGone = await rest(B, 'GET', 'journal_entries')
  check("B's own journal rows are gone", bGone.rows?.length === 0, describe(bGone))

  const anonCall = await rest(null, 'POST', 'rpc/delete_my_journal_entries', {})
  check("Signed-out caller can't call it", anonCall.status >= 400, describe(anonCall))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
