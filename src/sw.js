// ImpactMe's service worker: keeps the app working offline and handles
// reminder notifications, including their buttons when no window is open.
// Built by vite-plugin-pwa, which fills in self.__WB_MANIFEST with the files
// of each release.

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { db } from './data/db.js'
import { REMINDER_SYNC_TAG, takeDueReminders } from './reminders/engine.js'
import { completeFromReminder, snoozeReminder } from './reminders/handlers.js'
import { showReminders } from './reminders/present.js'

// The whole app (code, styles, fonts, icons) is stored on the device, so it
// opens without a connection. Your data is in IndexedDB, which is always local.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// A new version waits until you choose "Update", so it never reloads mid-task.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// Open tabs reload their data when told something changed.
const channel = new BroadcastChannel('impactme-sync')

self.addEventListener('notificationclick', (event) => {
  const { action, notification } = event
  const data = notification.data ?? {}
  notification.close()
  event.waitUntil(handleClick(action, data))
})

async function handleClick(action, data) {
  if (data.taskId && action === 'done') {
    if (await completeFromReminder(db, data)) channel.postMessage({ table: 'tasks' })
    return
  }
  if (data.taskId && (action === 'snooze10' || action === 'snooze30')) {
    await snoozeReminder(db, data.taskId, action === 'snooze30' ? 30 : 10)
    channel.postMessage({ table: 'snoozes' })
    return
  }
  await openApp(data.taskId ? `#/?task=${encodeURIComponent(data.taskId)}` : (data.url ?? '#/'))
}

async function openApp(hash) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const client = windows.find((c) => c.url.startsWith(self.registration.scope))
  if (client) {
    await client.focus()
    client.postMessage({ type: 'open', hash })
  } else {
    await self.clients.openWindow(new URL(hash, self.registration.scope).href)
  }
}

// Chrome and Edge let an installed app check in now and then in the background
// (how often is up to the browser), which catches reminders while no window is open.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === REMINDER_SYNC_TAG) event.waitUntil(checkReminders())
})

// Ready for a future server: a push message only says "check now". Nothing about
// your tasks would be sent through it; the details are read from this device.
self.addEventListener('push', (event) => event.waitUntil(checkReminders()))

async function checkReminders() {
  if (self.Notification?.permission !== 'granted') return
  const { due, settings } = await takeDueReminders(db)
  await showReminders(self.registration, due, { settings })
}
