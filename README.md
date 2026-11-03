# ImpactMe

**Make Every Day Count.** Your personal space to plan, organize, reflect and grow.

ImpactMe brings your tasks, daily plan and journal together in one calm, private app. It was previously called Daybook.

**Use it:** https://babasuhuyini.github.io/impactme/

## What it does today

- **Dashboard:** a greeting, today's progress, what's due and overdue, the next 7 days, and a one-tap mood check-in.
- **My Tasks:** quick add with `#tags`, due dates, four priority levels (Urgent, High, Normal, Low), views, search, sort, and undo.
- **Journal:** autosaving entries with mood, energy, tags, gratitude, a 14-day mood chart and a writing streak.
- **Settings:** your name, light/dark/system theme, 12- or 24-hour time, backup and restore.
- Works on desktop, tablet and phone. Keyboard shortcuts: `Q` quick add, `J` new journal entry.

More is on the way: calendar, reminders, habits, goals, notes, a focus timer and insights.

## Your data

Everything is stored **only in your browser on your device** (IndexedDB). Nothing is sent to a server, and there is no account.

- Data doesn't sync between devices or browsers.
- Clearing your browser's site data deletes it. Use **Settings → Download backup** regularly.
- **Restore from backup** checks the file first, and lets you combine it with what's there or replace everything. A copy of your data from before the restore is kept, so you can undo it.

On first launch, ImpactMe copies any Daybook data into its new storage. The original Daybook copy is left in place.

## Running it on your computer

You need [Node.js](https://nodejs.org).

- Double-click **Start ImpactMe.bat**, or run `npm install` then `npm run dev`.
- Open http://localhost:5173. Data saved there is separate from the online version.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server at http://localhost:5173 |
| `npm test` | Unit tests (data conversion, backups, task rules) |
| `npm run test:e2e` | Builds the app and runs end-to-end tests in Microsoft Edge |
| `npm run build` | Production build in `dist/` |

## Deployment

Every push to `main` runs the unit tests, builds the app and publishes it to GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Nothing is published if a test fails.

The app uses hash URLs (`/#/tasks`) and relative asset paths, so it works from the repository's sub-folder on GitHub Pages.

## Built with

- **React 19**, **Vite** and **React Router**.
- **Dexie** for IndexedDB.
- **Plus Jakarta Sans** and **Literata**, bundled with the app so it doesn't depend on Google Fonts.
- **Vitest** and **Playwright** for tests.
