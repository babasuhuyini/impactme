import { useSyncExternalStore } from 'react'

// Which task (or new-task draft) the editor window is showing, from any screen.
let current = null
const listeners = new Set()
const set = (value) => {
  current = value
  listeners.forEach((notify) => notify())
}

export const openTask = (id) => set({ id, key: Date.now() })
export const newTaskDraft = (fields = {}) => set({ draft: fields, key: Date.now() })
export const closeTaskEditor = () => set(null)

export const useTaskEditor = () =>
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => current
  )
