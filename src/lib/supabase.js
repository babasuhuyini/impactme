// The one Supabase client. Accounts are optional: when the build has no
// Supabase settings, `supabase` is null, every sign-in entry point is hidden,
// and the app runs exactly as it does without an account.
//
// Settings come from the environment (.env.local when developing, repository
// variables in GitHub Actions). Only the publishable key ever goes here.

import { createClient } from '@supabase/supabase-js'

const env = import.meta.env

// The app's address. Sign-in, confirmation and reset links return here. This is
// the only place it's read, so moving to a new domain is a config change.
export const SITE_URL = env.VITE_SITE_URL || ''
export const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY || ''

function configProblem() {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SITE_URL'].filter((k) => !env[k])
  if (missing.length) return `Accounts are switched off: ${missing.join(', ')} not set.`
  if (/^sb_secret_|service_role/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    return 'Accounts are switched off: VITE_SUPABASE_PUBLISHABLE_KEY is a secret key. Use the publishable key.'
  }
  return null
}

const problem = configProblem()
if (problem) console.warn(problem)

export const supabase = problem
  ? null
  : createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // PKCE returns `?code=` in the query string, which HashRouter ignores.
        // The implicit flow would put tokens in the hash and clash with routing.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })

export const accountsAvailable = supabase !== null
