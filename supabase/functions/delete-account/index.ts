// ImpactMe: delete-account Edge Function.
//
// Deletes the account of the person calling it, and nothing else. Their rows
// in tasks, journal_entries, projects, user_settings and consents go with it
// (on delete cascade).
//
// - Who: read only from the caller's sign-in token (Authorization header),
//   checked with Supabase Auth. No user id is ever taken from the request body.
// - Where from: only the site's own origins (ALLOWED_ORIGINS).
// - Recent sign-in required: the caller must have signed in within the last
//   10 minutes (the app asks for the password again, or a fresh Google
//   sign-in), so an unlocked device alone isn't enough.
// - Returns no user data, and logs nothing personal.
//
// Environment (Supabase › Edge Functions › Secrets; never in the repo):
//   ALLOWED_ORIGINS      comma-separated, e.g. https://babasuhuyini.github.io,http://localhost:5173
//   IMPACTME_SECRET_KEY  the project's secret key (sb_secret_...). Falls back to
//                        the built-in SUPABASE_SERVICE_ROLE_KEY while legacy keys exist.
//   SUPABASE_URL         provided by Supabase.
//
// Deploy with JWT verification off (this function verifies the token itself,
// and the browser's CORS preflight carries no token):
//   supabase functions deploy delete-account --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.119.1'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SECRET_KEY = Deno.env.get('IMPACTME_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// How recently the caller must have signed in (password or Google) to delete.
const REAUTH_WINDOW_SECONDS = 10 * 60

// The token's claims. Only read after Supabase Auth has verified the token.
function readClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

// When the person last authenticated: the newest `amr` timestamp. Refreshing
// a session doesn't change it; signing in again does.
function authenticatedAt(claims: Record<string, unknown> | null): number {
  const amr = Array.isArray(claims?.amr) ? claims.amr : []
  const times = amr.map((entry) => Number((entry as { timestamp?: unknown })?.timestamp)).filter(Number.isFinite)
  return times.length ? Math.max(...times) : 0
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? corsHeaders(origin) : {}),
    },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? ''
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: 'forbidden' }, null)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, origin)

  if (!SUPABASE_URL || !SECRET_KEY) {
    console.error('delete-account: missing configuration')
    return reply(500, { error: 'not_configured' }, origin)
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return reply(401, { error: 'not_signed_in' }, origin)

  const admin = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Supabase Auth checks the token (signature, expiry, session) and says who it is.
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user?.id) return reply(401, { error: 'invalid_session' }, origin)

  // Deleting an account is permanent, so the person must have proved who they
  // are recently (password typed again, or a fresh Google sign-in), not just
  // hold a session on an unlocked device. The token is already verified above.
  const claims = readClaims(token)
  if (claims?.sub !== data.user.id) return reply(401, { error: 'invalid_session' }, origin)
  if (Date.now() / 1000 - authenticatedAt(claims) > REAUTH_WINDOW_SECONDS) {
    return reply(401, { error: 'reauth_required' }, origin)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id)
  if (deleteError) {
    console.error('delete-account: delete failed', deleteError.status ?? 'unknown')
    return reply(500, { error: 'delete_failed' }, origin)
  }

  console.log('delete-account: one account deleted')
  return reply(200, { ok: true }, origin)
})
