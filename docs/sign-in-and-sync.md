# ImpactMe: sign-in and sync (Phase 4)

Instructions for Claude Code. Read this whole file before writing any code.

## Goal

People can create an account and sign in, and everything they enter on one device shows up on their other devices (phone, tablet, desktop browser) once they sign in there too.

ImpactMe stays a web app (PWA) hosted on GitHub Pages. App Store and Play Store packaging comes later and is out of scope.

## Decisions already made (do not change without asking Tayyib)

- **Backend:** Supabase (Postgres, Auth, one Edge Function). No other backend services.
- **Accounts are optional.** The app keeps working fully without an account, exactly as it does today. Signing in adds sync.
- **Sign-in methods:** Google, and email + password. No email one-time codes. No Sign in with Apple yet. Do not build the Apple button at all for now.
- **Local-first stays.** Dexie/IndexedDB on the device remains the source the UI reads from. Supabase is a sync target, not the live data source.
- **Sync timing:** on app open, when the app becomes visible again, when the connection comes back, every 3 minutes while the app is visible, and about 5 seconds after the last local change. No realtime subscriptions.
- **Conflicts:** last change wins, per record, by the time the change was made on the device.
- **Hosting:** GitHub Pages for now (`https://babasuhuyini.github.io/impactme/`). Auth emails are sent from `auth.babasuhuyini.com`. A dedicated domain for the app may come later, so the site URL must come from config, never be hard-coded in more than one place.
- **Only one new dependency:** `@supabase/supabase-js`.
- **Audience:** worldwide, starting in Ghana. Build to meet Ghana's Data Protection Act, 2012 (Act 843) now, and to be ready for the EU GDPR and UK GDPR, because EU and UK users are expected later. See "Security and privacy" below.

## Ground rules

- Investigate before changing. Read the files named below and confirm how they work before editing them.
- Make the smallest change that does the job. Do not refactor unrelated code or restyle existing screens.
- Keep every existing unit test and end-to-end test passing. Run `npm test` after each phase.
- Fail clearly. Show the user a plain-language message when sync or sign-in fails. Never swallow errors silently.
- Never put a Supabase **secret** key (or legacy `service_role` key) in client code, the repo, or logs. Only the **publishable** key goes in the client.
- Never log access tokens, refresh tokens or passwords.
- When a step needs something only Tayyib can do (dashboard settings, keys, Google Cloud), stop and ask him. Do not invent values.
- Work phase by phase. At the end of each phase, report what changed and what to test, then wait.

## How the app works today (verify this before you start)

- `src/data/db.js`: Dexie database `impactme`, tables `tasks`, `journal`, `projects`, `kv` (settings and bookkeeping), `reminderLog`, `snoozes`. Schema is versioned; add a new `db.version(n)` block, never edit an old one.
- `src/data/store.js`: in-memory state is the source of truth for the UI. `collection(table)` exposes `put`, `update`, `remove`. Writes are queued and flushed to IndexedDB in `writePending()`. Deletes are hard deletes. Other tabs are told to reload through a `BroadcastChannel` named `impactme-sync`.
- `updateSettings()` writes settings to `kv` under the key `settings`.
- `restoreData()` writes backup data straight to IndexedDB.
- `src/sw.js` (service worker) writes to IndexedDB directly when a reminder notification's **Mark done** or **Snooze** button is pressed (`completeFromReminder`, `snoozeReminder`).
- `src/data/models.js`: `normalizeTask`, `normalizeEntry`, `normalizeProject`, `normalizeSettings` validate any record read from storage. Every task, entry and project has `id` (UUID), `createdAt`, `updatedAt`.
- Routing uses `HashRouter` (`/#/tasks`). `App.jsx` reads `?task=` from the **router** location (inside the hash), not from `window.location.search`.
- `reminders.js` compares reminder times with `task.updatedAt`. Do not change what `updatedAt` means.

Search the codebase for every direct write to `db.tasks`, `db.journal`, `db.projects` and `db.kv` (settings) before building the sync queue. Every one of them must be covered.

## What syncs and what doesn't

| Data | Syncs? |
|---|---|
| Tasks, time blocks, subtasks, repeats, reminders set on a task | Yes |
| Journal entries | Yes |
| Projects | Yes |
| Settings: `name`, `timeFormat`, `weekStart`, `calendarView`, `tasksSort`, `tasksShowCompleted`, `defaultReminder`, `allDayReminderTime` | Yes |
| Settings: `theme`, `remindersEnabled`, `namePromptDismissed`, `lastBackupAt` | No, these stay per device |
| `reminderLog`, `snoozes` | No, per device |
| Backups, migration bookkeeping, safety snapshot | No |

Known limitation to note in the README: a reminder can fire on every device where ImpactMe is open. Fixing that is out of scope.

---

## Security and privacy (applies to every phase)

These are requirements, not suggestions. If a phase can't meet one, stop and tell Tayyib.

### Data protection rules the build must support

- **Laws in scope:** Ghana's Act 843 now; EU GDPR and UK GDPR as soon as EU or UK users arrive. Design for the stricter rules from the start.
- **Health-type data:** mood, energy and journal entries can reveal physical or mental health, which is "special personal data" under Act 843 and "special category" data under GDPR. They may only be stored on the server with the user's **explicit consent** (see Phase 3, consent step).
- **Minimum age: 16.** Asked at account creation. (16 is the highest default age in the EU; Tayyib may lower it later after legal advice.)
- **User rights the app must support:** see their data (the existing backup download), correct it (normal editing), delete it (Delete Account, which really removes it), and take it with them (the backup file).
- **No selling, ads or tracking.** No analytics, ad or tracking scripts of any kind. Act 843 prohibits selling personal data, and tracking scripts would need a cookie consent banner under EU rules. The Supabase session in local storage is strictly necessary for sign-in and needs no banner.
- **Collect only what's needed:** email, name, sign-in method, the user's own app data, and the consent record. Nothing else (no phone number, no location, no device fingerprinting).
- **Never write legal text yourself.** Privacy policy and terms content comes from Tayyib. Create the pages with clearly marked placeholders.

### Security rules for the code

- **Row Level Security on every table**, proved by an automated test with two users (Phase 1).
- **Keys:** only the publishable key in the app. The Supabase secret key lives only in the Edge Function's environment. The Resend API key and the CAPTCHA secret live only in the Supabase dashboard. Nothing secret in the repo, `.env.example`, tests, logs or commit messages.
- **CAPTCHA:** Cloudflare Turnstile on sign-up, sign-in and password reset (Supabase supports it natively; pass `captchaToken` in the auth calls). This stops bots from creating fake accounts and from using up the 100-emails-a-day Resend allowance.
- **Content Security Policy:** GitHub Pages can't send security headers, so add a `<meta http-equiv="Content-Security-Policy">` tag to `index.html`. The Supabase session lives in local storage, so injected script would mean account takeover. Start from: `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://<project-ref>.supabase.co; frame-src https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`. `index.html` has an inline theme script: move it into a file or allow it by its hash, then check the app, service worker and Turnstile all still work.
- **No raw HTML from user text:** confirm nothing uses `dangerouslySetInnerHTML` or `innerHTML` with user content.
- **No personal data in logs:** no emails, names, journal text, task titles or tokens in `console` output or Edge Function logs.
- **Edge Function `delete-account`:** verify the caller's JWT, delete only that caller, accept requests only from the site's origin (CORS), and return no user data.
- **Dependencies:** add `npm audit --audit-level=high` to the GitHub Actions build. Do not add packages beyond `@supabase/supabase-js` without asking.
- **Shared devices:** data saved on the device isn't encrypted, so sign-out must clear it (Phase 4). Do not keep any account data on the device after sign-out.

### Documents Claude Code drafts (from facts in the code, no legal wording)

- `docs/data-inventory.md`: every piece of personal data the app handles, why, where it is stored (device, Supabase region, Resend, Google), who can access it, and how long it's kept (including Supabase backup retention). Tayyib needs this for DPC registration and the privacy policy.
- `docs/breach-response.md`: a one-page checklist. Who checks what first, how to revoke keys and sessions, and the duty to tell Ghana's Data Protection Commission and affected users as soon as reasonably practicable (under GDPR: the supervisory authority within 72 hours). Leave names and contacts as placeholders for Tayyib.

---

## Phase 0: setup Tayyib does (ask him for each item)

1. Create a Supabase project in an **EU region** (Frankfurt `eu-central-1` or Ireland `eu-west-1`). Not "London" or the general "Europe" grouping: London and Zurich aren't in the EU. This keeps data in the EU for future EU users and is still close to Ghana.
   - Accept Supabase's Data Processing Agreement (see supabase.com/legal/dpa for how to sign it).
   - Turn on two-factor sign-in for the Supabase account.
2. Copy the **Project URL** and the **publishable key** (`sb_publishable_...`). Supabase is phasing out the legacy `anon` key by the end of 2026, so use the publishable key.
3. **Authentication › URL Configuration**
   - Site URL: `https://babasuhuyini.github.io/impactme/`
   - Redirect URLs: `https://babasuhuyini.github.io/impactme/` and `http://localhost:5173/`
4. **Authentication › Sign In / Providers › Email**: email + password on, "Confirm email" on, minimum password length 8.
5. **Google sign-in**: in Google Cloud Console, create an OAuth client (type: Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Consent screen app name: ImpactMe. Paste the client ID and secret into Supabase › Providers › Google.
6. **Email sending from babasuhuyini.com.** Supabase's built-in email only delivers to members of the project's team, at about 2 emails per hour, so real users would never get their confirmation or reset emails. Send through Resend using a subdomain of babasuhuyini.com instead. The website and any existing email on babasuhuyini.com are not touched.
   1. Create a free Resend account (3,000 emails a month, 100 a day; enough to start).
   2. In Resend › Domains, add **`auth.babasuhuyini.com`**. A separate subdomain keeps ImpactMe's sending reputation apart from the main domain.
   3. Resend lists DNS records (DKIM, plus SPF and MX for its bounce address). Add each one exactly as shown where babasuhuyini.com's DNS is managed. Do not edit or delete any existing records.
   4. Also add a DMARC record for the subdomain: type `TXT`, name `_dmarc.auth` (that is, `_dmarc.auth.babasuhuyini.com`), value `v=DMARC1; p=none;`. It only applies to the subdomain, so the main domain is unaffected.
   5. Wait until Resend shows the domain as **Verified**. DNS changes can take from minutes to a few hours.
   6. In Resend, create an API key with **sending access only**. This key is a secret: it goes into the Supabase dashboard and nowhere else (not the repo, not `.env`, not chat).
   7. Supabase › Authentication › Emails › **SMTP Settings**: turn on custom SMTP.
      - Sender email: `no-reply@auth.babasuhuyini.com`
      - Sender name: `ImpactMe`
      - Host: `smtp.resend.com`, Port: `465`, Username: `resend`, Password: the Resend API key
   8. Supabase › Authentication › **Rate Limits**: check the limit for emails sent per hour and raise it if it's too low for sign-up traffic.
   9. Supabase › Authentication › Emails › **Templates**: edit "Confirm signup" and "Reset password" to ImpactMe's wording. Keep the confirmation link variable. Add the line "Open this link in the same browser you used to sign up."
   10. Test with an address that is **not** on the Supabase team (for example a personal Gmail): sign up, check the email arrives in the inbox (not spam), and in Gmail use "Show original" to confirm SPF, DKIM and DMARC all say PASS.
   - When ImpactMe gets its own domain later: add that domain in Resend, verify it, then change the sender email in Supabase. Nothing in the app code changes.
7. **CAPTCHA:** create a free Cloudflare account, add a Turnstile widget for the site's domains (`babasuhuyini.github.io`, `localhost`), then paste the **secret** key into Supabase's Authentication settings under CAPTCHA protection (provider: Turnstile). The **site** key is public and goes into the GitHub variables below.
8. **Accounts:** turn on two-factor sign-in for GitHub, Google Cloud, Resend, Cloudflare and the DNS provider for babasuhuyini.com. In the GitHub repo, turn on secret scanning and push protection.
9. **Google OAuth consent screen:** add the privacy policy and terms URLs once those pages exist (Phase 5).
10. Accept Resend's Data Processing Agreement.
11. In the GitHub repo, add Actions **variables** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`, and `VITE_SITE_URL` = the site URL above.

---

## Phase 1: database

Write `supabase/migrations/0001_sign_in_and_sync.sql` for Tayyib to run in the SQL editor (or with the Supabase CLI).

### Tables

Three record tables with the same shape: `tasks`, `journal_entries`, `projects`.

```sql
create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,                         -- the record's id from the device (UUID string)
  data jsonb,                               -- the whole normalized record; null when deleted
  deleted boolean not null default false,   -- tombstone, so deletions reach other devices
  changed_at bigint not null,               -- ms timestamp of the change on the device; decides conflicts
  server_updated_at timestamptz not null default clock_timestamp(),  -- pull cursor
  primary key (user_id, id)
);
create index tasks_pull on public.tasks (user_id, server_updated_at);
```

Repeat for `journal_entries` and `projects`.

Settings:

```sql
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  changed_at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
```

Records are stored as `jsonb` on purpose: the device already validates every record with the `normalize*` functions, and the shape will keep changing. Relational columns come later with the organization tier.

Consent records (required for the health-type data and the age check):

```sql
create table public.consents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,               -- 'terms_privacy_v1', 'journal_health_v1', 'age_16_plus'
  granted boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, kind, recorded_at)
);
```

RLS on `consents`: `select` and `insert` for the owner only; no `update` or `delete` (the history is kept until the account is deleted, which cascades).

### Trigger on every table

Before insert or update:

- If an existing row has a **newer** `changed_at` than the incoming one, keep the existing row (return `null` from the `BEFORE UPDATE` trigger so the update is skipped).
- Otherwise set `server_updated_at = clock_timestamp()`.

### Row Level Security (required)

Enable RLS on all four tables. Policies: `select`, `insert`, `update` only where `user_id = auth.uid()` (with the matching `with check`). No `delete` policy; deletion happens through tombstones, or through the account-deletion cascade.

Acceptance: write `supabase/tests/rls.test.md` (or a runnable script) that signs in as two test users and proves, for every table, that user B can't select, insert, update or overwrite user A's rows with the publishable key. Run it and report the results before Phase 2.

---

## Phase 2: Supabase client and auth state

1. `npm install @supabase/supabase-js`.
2. `src/lib/supabase.js` creates one client:
   ```js
   createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
     auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
   })
   ```
   - **Use PKCE. Never the implicit flow.** The implicit flow puts tokens in the URL hash (`#access_token=...`), which collides with `HashRouter`. PKCE returns `?code=...` in the query string, which the router ignores. After the session is created, remove `?code=` from the address bar with `history.replaceState`.
   - If the env variables are missing, accounts are switched off: hide all sign-in entry points and log one console warning. The app must still run exactly as today. In the GitHub Actions build, fail the build if they are missing.
3. `src/data/account.js`: a small store, in the same style as `store.js` (module state + `useSyncExternalStore`), exposing `useAccount()` → `{ status: 'signed-out' | 'signed-in' | 'unavailable', user, syncStatus, lastSyncedAt }`. Listen to `supabase.auth.onAuthStateChange`.
4. Auth actions:
   - Google: `signInWithOAuth({ provider: 'google', options: { redirectTo: SITE_URL } })`.
   - Sign in: `signInWithPassword({ email, password })`.
   - Create account: `signUp({ email, password, options: { emailRedirectTo: SITE_URL, data: { name } } })`. Then show "Confirm your email".
   - Forgot password: `resetPasswordForEmail(email, { redirectTo: SITE_URL })`. When the user returns, the `PASSWORD_RECOVERY` event fires: show "Set a new password", then `updateUser({ password })`.
   - Note for the UI copy: with PKCE, the confirmation and reset links must be opened in the **same browser** that requested them. Say so on the "Check your email" screens.
5. Check that the service worker (`src/sw.js`) does not interfere with Supabase requests or with returning to `/?code=...`. It should serve the precached `index.html` and let the app read the query string.

---

## Phase 3: sign-in screens

The designs are on the canvas "ImpactMe redesign directions", page **Sign in & account** (phone screens in the top row, web versions below). Where this file and the canvas disagree, this file wins. Tayyib can share screenshots. Build these screens in the new design language, as full-screen routes outside the main app shell. Do not restyle the rest of the app in this phase.

### Design rules for these screens

- Background `#EEF2F0` (`--surface-2`). Fonts: Plus Jakarta Sans (already bundled).
- Titles 28px, weight 800, letter-spacing -0.03em, centred. Subtitle 16px, colour `#5D6B65`, centred.
- Fields: 52px tall, radius 12, white, 1px ring `#E1E7E4`; focused: 2px ring `#0E8A6A`. Label above, 13px weight 700.
- Primary button: 52px tall, full width, radius 14, fill `#0B7A5D` (existing `--accent-hover`), white 17px weight 700. White text on the main brand green `#0E8A6A` fails contrast (4.32:1), so use the darker fill.
- Secondary links: 15px weight 700, colour `#0A7356` (`--accent-ink`).
- Google button: white, 1px border `#CBD4CF`, radius 14, 52px. Use Google's official "G" logo and follow Google's sign-in branding guidelines. Do not draw the logo yourself.
- **Form screens are bottom-anchored on phones:** the form sits directly above the primary button, and the button sits just above the on-screen keyboard. Free space above the title holds a 64px step icon (radius 19, background `#E2F3ED`, icon colour `#0A7356`): envelope for email, lock for password, key for reset. If there is no room (Create account), leave the icon out.
  - **Screens without a text field** (Confirm your email, Before you start, Bring this device's data) have no keyboard, so they work differently: the icon, title and content form one group centred in the space above the button, with the icon 22px above the title, and the button sits 34px from the bottom.
  - On the web, the keyboard doesn't shrink the layout on iOS. Size the screen container to `window.visualViewport.height` (update on `visualViewport` `resize`), so the button stays above the keyboard.
- On wide screens (over 860px), show the same content in a centred white card, max-width 440px, radius 22, on `#F6F8F7`.

### Screens

1. **Welcome**: no Apple button for now. Shown on first launch to new users only (no data and never dismissed). ImpactMe logo, "ImpactMe", "Make Every Day Count.", "Your personal space to plan, organize, reflect and grow." Buttons: Continue with Google, Continue with Email, then the text link **Continue without an account**. Legal line: Terms and Privacy Policy links. Existing users with data never see this; they get a "Sign in to sync your devices" row at the top of Settings instead.
2. **Continue with email**: email field, Continue.
3. **Enter your password**: email shown with a Change link, password field with show/hide, then one row with **Create an account** (left) and **Forgot password?** (right), then Sign In.
   - Deviation from the canvas design: the design says "Welcome back" with the person's initial, which assumes we know the email has an account. Supabase deliberately doesn't reveal that, to protect users. Use the neutral title "Enter your password". On a wrong email or password, show "That email and password don't match. Try again, or create an account."
4. **Create account**: name, password with an "At least 8 characters" check, Create Account.
5. **Confirm your email**: mail icon, "We sent a link to {email}. Open it in this browser to finish creating your account.", "Can't find it? Check your spam folder.", Use a different email. Bottom button: Resend Email, disabled with a countdown ("Resend Email in 0:42") until the cooldown ends.
6. **Reset password**: email field, Send Reset Link, then a "Check your email" state.
7. **Set a new password**: after the reset link. Password field, Save Password.
8. **Before you start (consent)**: shown once, right after the first successful sign-in and before anything syncs, for both Google and email sign-ups (for email: after the address is confirmed).
   - Shield icon, title "Before you start", subtitle "A few things we need from you. Only the last one is optional."
   - The three items sit in one white card, separated by hairlines. Checkboxes are 24px, radius 7, border `#B9C4BF`; ticked: fill `#0B7A5D` with a white tick. Items 1 and 2 show a small "Required" label on the right. All three are **unticked** by default:
     1. "I'm 16 or older."
     2. "I agree to the Terms and Privacy Policy." (both linked)
     3. "Store my journal, mood and energy entries in my account so they sync. These can include health information." with a short "Why we ask" link that opens the relevant part of the privacy policy.
   - Continue is disabled until 1 and 2 are ticked. If 3 is left unticked, the account works, tasks and projects sync, but journal entries **stay on the device only**. Settings › Account lets the user turn journal sync on later (which records consent) or off (which deletes journal rows from the server after a confirmation).
   - Save each answer as a row in `consents`. Ask again only if the policy version changes.
   - While item 3 is unticked, show a note under the card: "Your journal will stay on this device only. You can turn journal sync on later in Settings."
9. **Bring this device's data with you?**: see Phase 4, first sign-in.
10. All sign-in, sign-up and reset forms include the Turnstile widget (invisible or managed mode), and pass its token as `captchaToken`.

Errors: show inline under the field (not alerts) in `#C93C31`.

---

## Phase 4: sync engine

### Local changes

Add `db.version(4)` with a table `syncQueue: '&key, table'`. Each entry: `{ key: '<table>:<id>', table, id, op: 'put' | 'delete', changedAt }`. Settings use `key: 'settings:settings'`.

- Record a queue entry **in the same IndexedDB transaction** as every data write, but only while this device is linked to an account (`kv` key `sync.userId` set).
- Cover every write path: `writePending()` in `store.js`, `updateSettings()`, `restoreData()`, and the service worker's reminder actions in `src/sw.js` (`completeFromReminder`). Search for any others.
- `changedAt` is `Date.now()` at the moment of the change. It is separate from the record's `updatedAt`, which keeps its current meaning.
- A newer change to the same record replaces the older queue entry (same `key`).

Journal entries are only queued and pushed when the user has granted `journal_health_v1`. Without it, journal rows are never sent and never pulled.

### Push

1. Read the queue in batches of up to 200.
2. For `put`: read the **current** record from IndexedDB and upsert `{ id, data: record, deleted: false, changed_at: changedAt }`. For `delete`: upsert `{ id, data: null, deleted: true, changed_at: changedAt }`. Settings: upsert `user_settings` with only the synced keys.
3. On success, delete each queue entry only if its `changedAt` hasn't changed since it was read (a newer edit may have arrived during the push).

### Pull

1. For each table, select rows where `server_updated_at > cursor - 5 seconds` (the overlap covers transactions that commit out of order), ordered by `server_updated_at`, 500 at a time, until none are left. Store the cursor per table in `kv` (`sync.cursor.<table>`).
2. For each row:
   - If the record has a queue entry with a **newer** `changedAt`, skip the row (the local change will be pushed).
   - Otherwise apply it: `deleted` → remove locally; else normalize `data` with the matching `normalize*` function and save it.
3. Apply remote changes through a new store function (for example `applyRemote(table, puts, deleteIds)`) that updates IndexedDB and in-memory state, emits, and broadcasts to other tabs, **without** adding queue entries.
4. Applying the same row twice must be harmless.

### When sync runs

- After sign-in and on app start (if signed in), when the page becomes visible, on the `online` event, every 3 minutes while visible, and 5 seconds after the last local change (debounced).
- Push first, then pull.
- Only one tab syncs at a time: wrap a run in `navigator.locks.request('impactme-sync', { ifAvailable: true }, ...)`.
- Skip when offline. Expose status (`idle`, `syncing`, `offline`, `error`) and `lastSyncedAt` through `useAccount()`.
- On a network error, retry on the next trigger. On an auth error that refresh can't fix, show "Sign in again to keep syncing" in Settings › Account.

### First sign-in on a device ("Bring this device's data with you?")

When a user signs in and `sync.userId` is empty:

- **No local tasks, entries or projects:** link the device (`sync.userId = user.id`) and pull.
- **Local data exists:** show the screen with counts (tasks, projects, journal entries).
  - **Add to My Account:** link, add a `put` queue entry for every local record and the settings, push, then pull.
  - **Not Now:** save the local data as a snapshot in `kv` (`sync.unlinkedDeviceData`, same shape as a backup from `createBackup`), clear `tasks`, `journal` and `projects`, link, then pull. Settings › Account shows "Add this device's earlier data" while the snapshot exists; that action merges it with the same newest-wins rule as `restoreData` merge mode and queues it.

If `sync.userId` is set to a **different** user than the one signing in, never merge automatically. Treat the local data as "local data exists" above.

### Sign out

1. Run a final push.
2. If the queue still has entries (offline), warn: "{n} changes haven't synced yet. If you sign out now, they'll be lost." Buttons: Cancel, Sign Out Anyway.
3. Sign out, then clear `tasks`, `journal`, `projects`, `syncQueue`, the cursors, `sync.userId`, `reminderLog` and `snoozes`. Keep device-only settings. The app then works locally as a signed-out app.

---

## Phase 5: account screens and account deletion

- **Settings, signed out:** a top row "Sign in to sync your devices" that opens Welcome.
- **Settings › Account, signed in:** initial avatar, name, email, sign-in method (Google or Email). Sync section: "Sync this device" toggle and "Last synced". Account section: Download a copy of my data (existing backup), Sign Out, Delete Account (red).
- **Delete account:** a sheet saying what is deleted, with a toggle "Also remove data from this device" (off by default), then Delete Account (red) and Cancel.
  - Write a Supabase Edge Function `supabase/functions/delete-account`. It reads the user's JWT from the `Authorization` header, gets the user with it, and deletes that user with an admin client created from the project's secret key, read from the function's environment. The `on delete cascade` foreign keys remove their rows.
  - After success: sign out locally. If the toggle is on, clear local data as in sign-out. If off, keep the local data and unlink (clear `sync.userId`, the queue and the cursors).
- **Settings › Account › Privacy:** "Sync journal entries" toggle (records consent; turning it off asks for confirmation, then deletes journal rows from the server), links to the Privacy Policy and Terms, and "Download a copy of my data".
- **Privacy Policy and Terms pages:** routes `#/privacy` and `#/terms`, readable without signing in, styled like the rest of the new screens. Content is a placeholder headed "[TO BE WRITTEN BY TAYYIB]" with the section headings only (what we collect, why, where it is stored, processors: Supabase, Resend, Google, Cloudflare; how long we keep it; your rights and how to use them; age; contact; changes). Do not write the policy text.
- Update the copy that says data never leaves the device: Settings ("Everything stays on this device") and the README "Your data" section. Signed-out: it stays on the device. Signed-in: it is also stored in the user's ImpactMe account so it can sync.

---

## Phase 6: deploy

- `deploy.yml`: pass `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY` and `VITE_SITE_URL` from repository variables into the build step. Fail the build if any is missing.
- Add `npm audit --audit-level=high` as a build step that fails the build.
- Add `.env.example` with the variable names and no values. Make sure `.env` and `.env.local` are git-ignored.
- README: add how to run locally with a Supabase project, and how sync works in plain language.

---

## Tests

### Unit tests (Vitest with `fake-indexeddb`, which is already installed)

Put the Supabase calls behind a small transport (`push(table, rows)`, `pull(table, since)`), so the engine can be tested with a fake.

- A local put or delete adds a queue entry only when linked; `applyRemote` never does.
- A newer local change wins over an older remote row, and the reverse.
- A remote tombstone removes the local record; a newer local edit beats an older tombstone.
- Undo after delete: the restored record syncs back and isn't deleted again.
- Pulling the same rows twice changes nothing.
- Only the synced settings keys go up; device-only keys never change from a pull.
- First sign-in: "Add to My Account" queues everything; "Not Now" snapshots and clears.
- Sign out clears exactly the listed tables and keys.
- Without `journal_health_v1` consent, journal entries are never queued, pushed or pulled; tasks and projects still sync.
- Withdrawing journal consent removes journal rows from the server and stops syncing them.

### Manual test with two browsers (write this checklist into the PR description)

1. Sign up with email in browser A, confirm, add tasks, a project and a journal entry.
2. Sign in with the same account in browser B (or on a phone). Everything appears.
3. Edit the same task in both while one is offline. Reconnect. The later change wins on both.
4. Delete a task in A. It disappears from B on the next sync.
5. Complete a task from a reminder notification in A (service worker path). The change reaches B.
6. Sign out in B with an unsynced change while offline. The warning appears.
7. Delete the account from A. Signing in again fails, and the Supabase tables (including `consents`) have no rows for that user.
8. Sign up without ticking the journal consent. Journal entries stay on that device only.
9. Open the browser console on every screen: no Content Security Policy errors, and no personal data in the console output.
10. Try to sign up from a script without a CAPTCHA token: Supabase rejects it.

---

## Out of scope for this phase

Sign in with Apple, App Store and Play Store packaging, realtime updates, multi-factor sign-in for users, organization or shared projects, de-duplicating reminders across devices, purging old tombstones, end-to-end encryption of journal entries, the wider UI upgrade outside the sign-in and account screens.

## Before public launch (not code, but blockers)

- **Register with Ghana's Data Protection Commission** as a data controller (Act 843 requires this before processing personal data; renew every two years). Use `docs/data-inventory.md` for the form. Check fees and forms at dpc.gov.gh.
- **Privacy Policy and Terms written** (ideally reviewed by a Ghanaian data protection lawyer) and published at `#/privacy` and `#/terms`.
- **Breach response:** fill the names and contacts in `docs/breach-response.md`.
- Supabase **Pro plan**, then turn on **leaked password protection** (Pro and above) and confirm backups are running.
- Before actively offering ImpactMe in the EU or UK: check whether an EU and a UK representative are required (GDPR Article 27 and the UK equivalent), and review consent and retention wording against GDPR.

- A custom domain for the app is optional for launch. If you add one, update Site URL, Redirect URLs, Google OAuth settings and `VITE_SITE_URL`.
- If the app moves to its own domain, move the sender email to it too (see Phase 0, step 6).
- Before changing the app's address, tell signed-out users to sign in or download a backup: data saved in a browser stays with the old address.
- Supabase Pro plan, so the project isn't paused after a week of inactivity.
- Privacy policy and terms pages (the Welcome screen links to them).
