# ImpactMe

**Make Every Day Count.** Your personal space to plan, organize, reflect and grow.

ImpactMe brings your tasks, daily plan and journal together in one calm, private app. Use it on one device without an account, or sign in to sync your devices. It was previously called Daybook.

**Use it:** https://babasuhuyini.github.io/impactme/

## What it does today

- **Dashboard:** a greeting, today’s progress ring, your schedule in time order (tasks and time blocks), what’s overdue, the next 7 days, and a one-tap mood check-in.
- **My Tasks:** Inbox, Today, Upcoming, Overdue, All and Completed views, plus your own **projects**. Every task can have notes, a date, start and end times, priority (Urgent, High, Normal, Low), project, category, tags and subtasks. Search, filter, sort, drag into your own order, and select several tasks to complete, move or delete at once.
- **Quick add** (button, + on phones, or `Q`) understands plain words: “Submit report tomorrow at 9 AM”, “Pay rent every month on the 1st”, “Study every weekday at 7 PM #uni”. It shows what it understood so you can correct it before saving. This runs on your device, with no AI service.
- **Repeating tasks:** daily, weekdays, weekends, weekly, monthly, yearly or custom (every N days/weeks/months/years, chosen weekdays), ending never, on a date or after a number of times. Completing one keeps a record and schedules the next.
- **Calendar:** day, week, month and agenda views. Click a time to add something, drag to reschedule, drag the bottom edge to change the length, and drag unscheduled tasks onto the calendar. Overlapping items are flagged, never moved. **Time blocks** reserve time for things like lunch or focus work. Export to Google, Outlook or Apple Calendar as an .ics file.
- **Reminders:** add as many as five to any task: at the time, 5, 10, 15 or 30 minutes, 1 hour or 1 day before, or a custom time. They arrive as notifications with **Mark done** and **Snooze** buttons, or inside the app if notifications are off. See [How reminders work](#how-reminders-work).
- **Install it as an app** on your phone, tablet or computer, and use it **offline**. ImpactMe tells you when a new version is ready and updates when you choose.
- **Journal:** autosaving entries with mood, energy, tags, gratitude, a 14-day mood chart and a writing streak.
- **Accounts and sync (optional):** sign in with Google or email to use ImpactMe on your phone, tablet and computer. See [Accounts and sync](#accounts-and-sync).
- **Settings:** your account, sync and privacy choices, your name, light/dark/system theme, 12- or 24-hour time, first day of the week, calendar view, notifications and reminder defaults, install and updates, backup and restore.
- Works on desktop, tablet and phone. Keyboard shortcuts: `Q` quick add, `J` new journal entry, `Alt + ↑/↓` to reorder tasks.

More is on the way: a richer journal, habits, goals, notes, a focus timer and insights.

## How reminders work

Reminders don't use a server: they come from the app on your device.

- **While ImpactMe is open** (in a tab, minimised, in the background or as an installed app), reminders arrive on time, at most about a minute late.
- **When the browser is closed or the device is off or asleep,** a reminder can't arrive at that moment. ImpactMe shows anything you missed in the last 24 hours as soon as you open it again.
- **Installed in Chrome or Edge,** ImpactMe may also check in the background now and then; the browser decides when.
- **iPhone and iPad** show notifications only for apps added to the Home Screen (iOS 16.4 or later).
- Each reminder is sent once, even with several tabs open. Completing, deleting or moving a task clears its reminder.
- Reminders use your device's local time, so they stay right through daylight saving changes and travel.

Reminders that arrive while the browser is completely closed would need a push server. The service worker already handles a "check now" push message, so a server could be added later without sending your task details anywhere.

## Your data

An account is optional.

- **Without an account**, everything is stored **only in your browser on your device** (IndexedDB). Nothing is sent to a server, and data doesn't sync between devices or browsers.
- **Signed in**, your data is still saved on your device, and also stored in your ImpactMe account so it can sync to your other devices. Journal, mood and energy entries can include health information, so they only go to your account if you agree to it; you can turn that off in **Settings → Privacy**, which removes them from your account.
- Signing out removes your account's data from that device. **Settings → Account → Delete Account** deletes your account and everything in it.
- Clearing your browser's site data deletes what's on that device. Use **Settings → Download backup** regularly.
- Known limitation: if ImpactMe is open on several devices, a reminder can appear on each of them.
- **Restore from backup** checks the file first, and lets you combine it with what's there or replace everything. A copy of your data from before the restore is kept, so you can undo it.

On first launch, ImpactMe copies any Daybook data into its new storage. The original Daybook copy is left in place.

## Accounts and sync

An account is optional. Without one, ImpactMe works exactly as before, on one device.

**How sync works, in plain words**

- Your device always keeps its own copy, so ImpactMe stays fast and works offline. Your account is where your devices meet.
- ImpactMe syncs when you open it, when you come back to it, when your connection returns, every 3 minutes while it's open, and a few seconds after you change something. **Settings → Sync → Sync Now** syncs straight away.
- If the same task is changed on two devices, the change made last wins.
- Deleting something on one device deletes it on the others. **Undo** brings it back everywhere.
- Synced: tasks (with time blocks, subtasks, repeats and reminders), projects, and your name, time format, first day of the week, calendar view, task sorting and reminder defaults.
- Not synced, kept per device: theme, whether reminders are switched on, and reminder history.
- **Journal, mood and energy entries** can include health information, so they sync only if you agree to it when you first sign in. You can change this any time in **Settings → Privacy**. Turning it off removes them from your account; they stay on your device.
- The first time you sign in on a device that already has data, ImpactMe asks whether to add it to your account. Nothing is merged without asking.
- **Signing out** sends any last changes, warns you about anything that hasn't synced, then removes your account's data from that device, so nothing is left behind on a shared device.
- **Deleting your account** asks you to confirm it's you (your password, or signing in with Google again), then deletes the account and everything in it.

**Privacy and security**

- Your account data is stored with Supabase in the EU. Row Level Security means each account can only ever read or change its own data, and this is tested with two accounts ([supabase/tests/rls-check.mjs](supabase/tests/rls-check.mjs)).
- Sign-in, sign-up and password reset are protected by Cloudflare Turnstile to stop bots.
- No ads, analytics or tracking scripts. A Content Security Policy blocks scripts from anywhere else.
- See [docs/data-inventory.md](docs/data-inventory.md) for exactly what is stored, where, and for how long.

## Running it on your computer

You need [Node.js](https://nodejs.org).

- Double-click **Start ImpactMe.bat**, or run `npm install` then `npm run dev`.
- Open http://localhost:5173. Data saved there is separate from the online version.
- On Windows, if PowerShell says running scripts is disabled, use `npm.cmd run dev`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

Without the settings below, accounts are switched off and ImpactMe runs on your device only.

### With accounts and sync (Supabase)

1. Create a Supabase project in an EU region (Frankfurt or Ireland).
2. In the SQL Editor, run the files in [supabase/migrations](supabase/migrations) in order (`0001`, then `0002`).
3. Deploy the Edge Function [supabase/functions/delete-account](supabase/functions/delete-account/index.ts) under the name `delete-account`, with **Enforce JWT verification** off (the function checks the sign-in itself). Add the secrets `ALLOWED_ORIGINS` (your site and `http://localhost:5173`, comma-separated) and `IMPACTME_SECRET_KEY` (a secret key from Project Settings → API Keys). Secret keys go in Supabase only, never in this repo.
4. In **Authentication → URL Configuration**, set the Site URL to your site, and add your site and `http://localhost:5173/` as Redirect URLs.
5. Copy [.env.example](.env.example) to `.env.local` and fill it in:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL, e.g. `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The **publishable** key (`sb_publishable_…`). Never a secret key. |
   | `VITE_SITE_URL` | `http://localhost:5173/` locally; your site's address when deployed |
   | `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile **site** key (its secret key goes in Supabase › Authentication › Attack Protection) |

   `.env.local` is git-ignored. These four values are public by design: they end up in the app every visitor downloads.

The full setup, including Google sign-in, email sending through Resend and CAPTCHA, is in [docs/sign-in-and-sync.md](docs/sign-in-and-sync.md).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server at http://localhost:5173 |
| `npm test` | Unit tests (data conversion, backups, repeats, Quick Add phrases, calendar layout, reminders, sign-in, sync) |
| `npm run test:e2e` | Builds the app and runs end-to-end tests in Microsoft Edge (Supabase is faked; no real project is touched) |
| `node supabase/tests/rls-check.mjs` | Proves two accounts can't reach each other's data in a real Supabase project (instructions in the file) |
| `npm run build` | Production build in `dist/` |

## Deployment

Every push to `main` checks dependencies for known vulnerabilities (`npm audit --audit-level=high`), runs the unit tests, builds the app and publishes it to GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Nothing is published if any of these fail.

The build needs four repository **variables** (Settings → Secrets and variables → Actions → Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL` and `VITE_TURNSTILE_SITE_KEY`. The build stops if one is missing, or if a secret key was put where the publishable key belongs.

GitHub Pages can't send security headers, so the Content Security Policy is added to `index.html` at build time ([vite.config.js](vite.config.js)).

The app uses hash URLs (`/#/tasks`) and relative asset paths, so it works from the repository's sub-folder on GitHub Pages. The service worker ([src/sw.js](src/sw.js)) stores each release on the device for offline use; a new release waits until you press **Update**.

## Built with

- **React 19**, **Vite** and **React Router**.
- **Dexie** for IndexedDB.
- **Supabase** (Postgres, Auth and one Edge Function) for optional accounts and sync, through `@supabase/supabase-js`.
- **Cloudflare Turnstile** to keep bots out of sign-up and sign-in.
- **vite-plugin-pwa** and **Workbox** for the service worker, offline support and install manifest.
- **Plus Jakarta Sans** and **Literata**, bundled with the app so it doesn't depend on Google Fonts.
- **Vitest** and **Playwright** for tests.
