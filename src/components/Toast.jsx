import { useEffect, useSyncExternalStore } from 'react'
import { XIcon } from './icons.jsx'

// One toast at a time, shown from anywhere: showToast('Task deleted', { undo }),
// or with any button: showToast('…', { action: { label: 'Update', onClick } }).
let current = null
const listeners = new Set()
const set = (toast) => {
  current = toast
  listeners.forEach((notify) => notify())
}
const subscribe = (notify) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

export function showToast(message, { undo, action, tone = 'default', duration = 5000 } = {}) {
  set({ id: Date.now() + Math.random(), message, undo, action, tone, duration })
}

export const dismissToast = () => set(null)

export default function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current)

  useEffect(() => {
    if (!toast || !toast.duration) return
    const timer = setTimeout(() => current === toast && set(null), toast.duration)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null
  return (
    <div
      key={toast.id}
      className={toast.tone === 'error' ? 'toast error' : 'toast'}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          className="toast-action"
          onClick={() => {
            toast.undo()
            set(null)
          }}
        >
          Undo
        </button>
      )}
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action.onClick()
            set(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={() => set(null)} aria-label="Dismiss">
        <XIcon width={14} height={14} />
      </button>
    </div>
  )
}
