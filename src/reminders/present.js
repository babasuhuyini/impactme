// Turns due reminders into system notifications. Shared by the app and the
// service worker; `registration` is a ServiceWorkerRegistration.

import { reminderBody } from '../lib/reminders.js'

// More than this many at once (say, after a weekend with the laptop shut)
// become one summary instead of a pile of notifications.
const SUMMARY_AFTER = 3

const ACTIONS = [
  { action: 'done', title: 'Mark done' },
  { action: 'snooze10', title: 'Snooze 10 min' },
  { action: 'snooze30', title: 'Snooze 30 min' },
]

// Browsers show a limited number of buttons (usually two); clicking the
// notification itself opens the task.
function actionsFor(task) {
  const max = globalThis.Notification?.maxActions ?? 2
  return ACTIONS.filter((a) => a.action !== 'done' || task.kind === 'task').slice(0, max)
}

const asset = (registration, path) => new URL(path, registration.scope).href

export const taskTag = (taskId) => `task-${taskId}`

export async function showReminders(registration, due, { settings, now = Date.now() }) {
  if (!due.length) return
  const icon = asset(registration, 'icons/icon-192.png')
  const badge = asset(registration, 'icons/badge-96.png')

  if (due.length > SUMMARY_AFTER) {
    const titles = due.map((d) => d.task.title)
    await registration.showNotification(`${due.length} reminders`, {
      body: titles.slice(0, 4).join(', ') + (titles.length > 4 ? ` and ${titles.length - 4} more` : ''),
      tag: 'impactme-summary',
      icon,
      badge,
      data: { url: '#/tasks/today' },
    })
    return
  }

  for (const item of due) {
    await registration.showNotification(item.task.title, {
      body: reminderBody(item, { now, timeFormat: settings.timeFormat }),
      // One notification per task: a newer reminder replaces the older one.
      tag: taskTag(item.task.id),
      renotify: true,
      timestamp: item.at,
      icon,
      badge,
      actions: actionsFor(item.task),
      data: { taskId: item.task.id, dueDate: item.task.dueDate },
    })
  }
}
