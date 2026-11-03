// Reminders shown inside the app, for when system notifications aren't
// available or allowed. One card per task.

import { useSyncExternalStore } from 'react'

let items = []
const listeners = new Set()
const set = (next) => {
  items = next
  listeners.forEach((notify) => notify())
}

// item: { taskId, dueDate, title, body, kind }
export function addInAppReminders(list) {
  const fresh = new Map(list.map((item) => [item.taskId, item]))
  set([...items.filter((i) => !fresh.has(i.taskId)), ...fresh.values()])
}

export const dismissInAppReminder = (taskId) => set(items.filter((i) => i.taskId !== taskId))

// Drops cards for tasks that have been completed, deleted or moved.
export function pruneInAppReminders(isStale) {
  const kept = items.filter((i) => !isStale(i))
  if (kept.length !== items.length) set(kept)
}

export const useInAppReminders = () =>
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => items
  )
