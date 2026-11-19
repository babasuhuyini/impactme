// The only place sync talks to Supabase. The engine (sync.js) uses this small
// interface, so tests can swap in a fake server.
//
//   push(table, rows)        upsert { id, data, deleted, changed_at } rows
//   pull(table, since, n)    rows changed after `since`, oldest first, at most n
//   pushSettings(row)        upsert { data, changed_at }
//   pullSettings(since)      the settings row if changed after `since`, else null
//   deleteJournal()          remove this user's journal rows (consent withdrawn)
//
// Row Level Security on the server limits every call to the signed-in user.

export const REMOTE_TABLE = { tasks: 'tasks', journal: 'journal_entries', projects: 'projects' }

// kind: 'network' (retry later) | 'auth' (sign in again) | 'server'
export class SyncError extends Error {
  constructor(kind, code) {
    super(`Sync failed (${kind}${code ? `: ${code}` : ''})`)
    this.kind = kind
    this.code = code
  }
}

function check({ data, error, status }) {
  if (!error) return data
  const code = error.code || ''
  if (status === 0 || /fetch|network/i.test(error.message ?? '')) throw new SyncError('network', code)
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303') throw new SyncError('auth', code)
  throw new SyncError('server', code || String(status))
}

async function run(request) {
  try {
    return check(await request)
  } catch (error) {
    if (error instanceof SyncError) throw error
    throw new SyncError('network', error?.name)
  }
}

export function supabaseTransport(client) {
  const COLUMNS = 'id,data,deleted,changed_at,server_updated_at'
  return {
    push: (table, rows) => run(client.from(REMOTE_TABLE[table]).upsert(rows, { onConflict: 'user_id,id' })),

    pull(table, since, limit) {
      let query = client.from(REMOTE_TABLE[table]).select(COLUMNS).order('server_updated_at').limit(limit)
      if (since) query = query.gt('server_updated_at', since)
      return run(query).then((rows) => rows ?? [])
    },

    pushSettings: (row) => run(client.from('user_settings').upsert(row, { onConflict: 'user_id' })),

    pullSettings(since) {
      let query = client.from('user_settings').select('data,changed_at,server_updated_at')
      if (since) query = query.gt('server_updated_at', since)
      return run(query.maybeSingle())
    },

    deleteJournal: () => run(client.rpc('delete_my_journal_entries')),

    // After an auth error: true if a fresh session was obtained.
    async refresh() {
      const { data, error } = await client.auth.refreshSession()
      return !error && Boolean(data?.session)
    },
  }
}
