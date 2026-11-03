// Runs in every open ImpactMe tab or window. It checks for due reminders when
// the app starts, when it comes back into view (after sleep, or switching
// back), whenever tasks change, and on a timer aimed at the next reminder.
// What's been sent is recorded in IndexedDB, not in this tab, so reloads,
// restarts and several open tabs never send a reminder twice.

import { db } from '../data/db.js'
import { flush, subscribeStore, tasks } from '../data/store.js'
import { reminderBody } from '../lib/reminders.js'
import { takeDueReminders } from './engine.js'
import { addInAppReminders, pruneInAppReminders } from './inApp.js'
import { getRegistration, notificationPermission } from './notifications.js'
import { showReminders, taskTag } from './present.js'

// Even with no reminder coming up, look again this often. Browsers slow down
// timers in background tabs, so this also bounds how late a reminder can be.
const POLL = 30_000

let timer = null
let running = null
let again = false
let started = false

export function startReminders() {
  if (started) return
  started = true
  check()
  const onVisible = () => document.visibilityState === 'visible' && check()
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('focus', check)
  addEventListener('online', check)
  addEventListener('pageshow', check)

  // Another tab, or the service worker (snooze, mark done), changed something.
  if (typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel('impactme-sync').onmessage = ({ data }) =>
      ['tasks', 'snoozes', 'settings'].includes(data?.table) && soon()
  }
  // A task was edited in this tab.
  subscribeStore(soon)
}

let soonTimer = null
function soon() {
  clearTimeout(soonTimer)
  soonTimer = setTimeout(() => {
    check()
    tidy()
  }, 400)
}

export function check() {
  if (running) {
    again = true
    return running
  }
  running = run()
    .catch((error) => console.error('Reminder check failed', error))
    .finally(() => {
      running = null
      if (again) {
        again = false
        check()
      }
    })
  return running
}

async function run() {
  // Make sure edits from this tab are saved first, so they count.
  await flush()
  const now = Date.now()
  const { due, settings, next } = await takeDueReminders(db, now)
  if (due.length) await deliver(due, settings, now)
  clearTimeout(timer)
  const wait = next == null ? POLL : Math.min(Math.max(next - Date.now(), 0) + 200, POLL)
  timer = setTimeout(check, wait)
}

async function deliver(due, settings, now) {
  if (notificationPermission() === 'granted') {
    try {
      const registration = await getRegistration()
      if (registration) return await showReminders(registration, due, { settings, now })
      // No service worker (development): plain notifications, without buttons.
      for (const item of due) {
        new Notification(item.task.title, {
          body: reminderBody(item, { now, timeFormat: settings.timeFormat }),
          tag: taskTag(item.task.id),
        })
      }
      return
    } catch (error) {
      console.error('Couldn’t show a notification; showing it in the app instead', error)
    }
  }
  addInAppReminders(
    due.map((item) => ({
      taskId: item.task.id,
      dueDate: item.task.dueDate,
      kind: item.task.kind,
      title: item.task.title,
      body: reminderBody(item, { now, timeFormat: settings.timeFormat }),
    }))
  )
}

// Closes reminders for tasks that have been completed, deleted or moved.
async function tidy() {
  const current = new Map(tasks.all().map((t) => [t.id, t]))
  const isStale = ({ taskId, dueDate }) => {
    const task = current.get(taskId)
    return !task || task.status === 'done' || task.dueDate !== dueDate
  }
  pruneInAppReminders(isStale)
  if (notificationPermission() !== 'granted') return
  const registration = await getRegistration()
  if (!registration) return
  for (const n of await registration.getNotifications()) if (n.data?.taskId && isStale(n.data)) n.close()
}
