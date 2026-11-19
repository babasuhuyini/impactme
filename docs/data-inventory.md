# ImpactMe: personal data inventory

Prepared from the code (branch `sign-in-and-sync`, November 2026) for registering with Ghana's Data Protection Commission and for writing the privacy policy. It records facts, not legal conclusions. Items marked **[CONFIRM]** can't be known from the code: check them in the dashboards named and fill them in.

- Data controller: **[TAYYIB: name, address, contact email]**
- Laws in scope: Ghana Data Protection Act, 2012 (Act 843); EU GDPR and UK GDPR once EU or UK users are offered the service.
- Lawful basis for each purpose: **[TAYYIB: confirm with legal adviser]**. This document lists purposes only.

## 1. Who the data is about

People who use ImpactMe. Accounts are optional. Minimum age for an account: 16 (asked at sign-up and recorded).

## 2. Without an account: data stays on the device

Nothing below leaves the device. ImpactMe has no analytics, ads or tracking.

| Where (in the browser) | What | Why | Kept until |
|---|---|---|---|
| IndexedDB `impactme` › `tasks`, `projects` | Tasks (title, notes, dates, times, priority, category, tags, subtasks, repeats, reminders), projects | The app's features | The person deletes them, or clears the browser's site data |
| IndexedDB › `journal` | Journal entries: text, mood, energy, tags, gratitude, date. **Can reveal health (special personal data).** | Journal feature | As above |
| IndexedDB › `kv` › `settings` | Preferred name, theme, time format, week start, calendar view, sorting, reminder settings, last backup time | Preferences | As above |
| IndexedDB › `reminderLog`, `snoozes` | Which reminders were shown or snoozed (task id, time) | Not showing a reminder twice | 30 days (log); until the snooze ends |
| IndexedDB › `kv` › `safety.beforeRestore` | Copy of all data from before the last backup restore | Undo a restore | Replaced at the next restore; removed on sign-out |
| localStorage `impactme.theme`, `impactme.welcomeDismissed` | Theme; whether the welcome screen was dismissed | Avoid a flash of the wrong theme; don't show the welcome again | Until browser data is cleared |
| localStorage (Daybook keys `todos.items`, `journal.entries`, etc.) | Data from Daybook, the app's earlier version, if it was used | Left as a fallback copy after migration | Until browser data is cleared |
| Cache Storage | The app's own files (no personal data) | Working offline | Replaced at each update |

## 3. With an account

### 3.1 Stored in Supabase (the account)

Region: **[CONFIRM: Supabase › Project Settings › General › Region. Must be Frankfurt `eu-central-1` or Ireland `eu-west-1`]**

| Table / place | What | Why | Kept until |
|---|---|---|---|
| `auth.users` (Supabase Auth) | Email address; password as a one-way hash (email accounts); name given at sign-up; for Google accounts, what Google shares: name, email, profile picture URL, Google account ID; sign-up, confirmation and last sign-in times | Signing in; showing the name and email in Settings | Account deletion |
| Supabase Auth sessions and audit log | Sign-in events; Supabase also records **IP address and browser (user agent)** for sessions and auth events **[CONFIRM in Supabase › Authentication › Logs and Sessions]** | Security of sign-in | **[CONFIRM: retention depends on plan]** |
| `public.tasks`, `public.projects` | The same records as on the device (as JSON), with a change time | Sync between the person's devices | Account deletion. A deleted record leaves a "tombstone" (its id, deleted flag and times, no content) until the account is deleted |
| `public.journal_entries` | Journal entries (as JSON). **Special personal data (health).** Only stored with explicit consent (`journal_health_v1`). | Sync, only if the person agreed | Withdrawing consent deletes them straight away; otherwise account deletion |
| `public.user_settings` | Synced settings only: name, time format, week start, calendar view, task sorting and visibility, default reminder, all-day reminder time | Same settings on every device | Account deletion |
| `public.consents` | Each answer to: 16 or older (`age_16_plus`), terms and privacy (`terms_privacy_v1`), journal health data (`journal_health_v1`); granted yes/no; server time | Evidence of consent | Account deletion. The person can't edit or delete earlier answers (kept as a history) |
| Supabase database backups | Copies of all of the above | Recovery | **[CONFIRM: Supabase › Database › Backups; depends on plan. Deleted accounts remain in backups until they expire]** |
| Supabase API and Edge Function logs | Request metadata, including IP addresses. The app and the `delete-account` function log no names, emails or content. | Operations, security | **[CONFIRM: depends on plan]** |

### 3.2 Also on the device while signed in

| Where | What | Why | Kept until |
|---|---|---|---|
| localStorage `sb-<project-ref>-auth-token` | The sign-in session: access token, refresh token, the person's email and id | Staying signed in | Sign-out or account deletion |
| localStorage `impactme.consent` | Account id and the journal consent answer | Opening the app offline without asking again | Sign-out |
| sessionStorage `impactme.signInFlow` | The email being used on the sign-in screens | Moving between sign-in screens | Closing the tab, or signing in |
| sessionStorage `impactme.deleteAfterSignIn` | Account id and a choice, while confirming a delete with Google | Reopening the delete dialog after Google | 10 minutes, closing the tab, or finishing |
| IndexedDB › `syncQueue`, `kv` › `sync.*` | Which records changed and when; the linked account id; sync progress | Sync | Sign-out or account deletion |
| IndexedDB › `kv` › `sync.unlinkedDeviceData` | The device's earlier data, if "Not Now" was chosen at first sign-in | Adding it to the account later | Until added; it is **not** removed at sign-out (it was the device's own data before signing in) |

Signing out removes tasks, journal, projects, the sync data, reminder history, the restore copy and the synced settings from the device. Data on the device is not encrypted by ImpactMe; the browser's and operating system's protections apply.

## 4. Processors and other recipients

| Who | What they receive | Why | Agreement |
|---|---|---|---|
| **Supabase** | Everything in 3.1 | Database, sign-in, the `delete-account` function | Data Processing Agreement **[CONFIRM signed]** |
| **Resend** | Email address; content of sign-up confirmation and password reset emails | Sending those emails from `auth.babasuhuyini.com` | DPA **[CONFIRM signed]**; log retention **[CONFIRM]** |
| **Google** | That the person signs in to ImpactMe with Google | "Continue with Google", only if the person chooses it | Google's terms |
| **Cloudflare** (Turnstile) | Signals from the browser on the sign-in, sign-up and reset forms, including IP address | Stopping bots | **[CONFIRM: Cloudflare's Turnstile privacy terms]** |
| **GitHub** (GitHub Pages) | Visitors' IP addresses in GitHub's own logs when the app is downloaded | Hosting the app's files | GitHub's terms **[CONFIRM]** |

Nothing is sold or shared for advertising. There are no analytics or tracking scripts.

## 5. Who can see account data

- **The person**, through the app. Row Level Security restricts every table to its owner; tested with two accounts (`supabase/tests/rls-check.mjs`: 58 checks passed, 18 November 2026).
- **The project owner (Tayyib)**, through the Supabase dashboard or a secret key: can read all account data, including journal entries. Journal entries are not end-to-end encrypted.
- **Processors** as in section 4, under their agreements.

## 6. The person's rights, and how the app supports them

| Right | How |
|---|---|
| See a copy of their data | Settings › Privacy › Download a Copy of My Data (a backup file of everything on the device) |
| Correct it | Normal editing |
| Delete it | Delete individual items; Settings › Account › Delete Account (confirms it's them, then deletes the account and every row, by cascade). Turning journal sync off deletes journal entries from the account |
| Take it elsewhere | The backup file is JSON |
| Withdraw consent | Settings › Privacy › Sync journal entries (journal); deleting the account (everything else) |

Requests made outside the app (for example by email) are handled by the controller: **[TAYYIB: process and contact]**.

## 7. Security measures (summary)

Row Level Security on every table, tested; secret keys only in Supabase; Content Security Policy; Cloudflare Turnstile on sign-in forms; Google sign-in uses PKCE; email links are one-time, short-lived codes that the app verifies and then removes from the address; recent sign-in required to delete an account; record size limits; dependency vulnerability check on every release; no personal data in logs. See `docs/breach-response.md` for incidents.

## 8. Open points for the controller

1. Fill in every **[CONFIRM]** and **[TAYYIB]** above.
2. Decide whether inactive accounts are deleted after a period. Today nothing is deleted automatically.
3. Decide whether tombstones (deleted-record markers, no content) should be purged after a period.
4. Decide whether the "Not Now" copy of a device's earlier data should be removed at sign-out.
