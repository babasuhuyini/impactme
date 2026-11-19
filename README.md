# ImpactMe

**Make Every Day Count.** Your personal space to plan, organize, reflect and grow.

ImpactMe brings your tasks, daily plan and journal together in one calm, private app. It was previously called Daybook.

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
- **Settings:** your name, light/dark/system theme, 12- or 24-hour time, first day of the week, calendar view, notifications and reminder defaults, install and updates, backup and restore.
- Works on desktop, tablet and phone. Keyboard shortcuts: `Q` quick add, `J` new journal entry, `Alt + ↑/↓` to reorder tasks.

More is on the way: a richer journal, habits, goals, notes, a focus timer and insights.

## How reminders work

ImpactMe has no server, so reminders come from the app on your device:

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

## Running it on your computer

You need [Node.js](https://nodejs.org).

- Double-click **Start ImpactMe.bat**, or run `npm install` then `npm run dev`.
- Open http://localhost:5173. Data saved there is separate from the online version.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server at http://localhost:5173 |
| `npm test` | Unit tests (data conversion, backups, repeats, Quick Add phrases, calendar layout, reminders) |
| `npm run test:e2e` | Builds the app and runs end-to-end tests in Microsoft Edge |
| `npm run build` | Production build in `dist/` |

## Deployment

Every push to `main` runs the unit tests, builds the app and publishes it to GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Nothing is published if a test fails.

The app uses hash URLs (`/#/tasks`) and relative asset paths, so it works from the repository's sub-folder on GitHub Pages. The service worker ([src/sw.js](src/sw.js)) stores each release on the device for offline use; a new release waits until you press **Update**.

## Built with

- **React 19**, **Vite** and **React Router**.
- **Dexie** for IndexedDB.
- **vite-plugin-pwa** and **Workbox** for the service worker, offline support and install manifest.
- **Plus Jakarta Sans** and **Literata**, bundled with the app so it doesn't depend on Google Fonts.
- **Vitest** and **Playwright** for tests.
