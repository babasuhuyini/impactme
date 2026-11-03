// Installing ImpactMe as an app, working offline, and updating to new versions.

import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { showToast } from './components/Toast.jsx'
import { registerBackgroundCheck } from './reminders/notifications.js'

let state = {
  offlineReady: false,
  updateReady: false,
  // The browser's install prompt, kept so a button can show it later.
  installPrompt: null,
  installed: false,
}
const listeners = new Set()
const set = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((notify) => notify())
}

export const usePWA = () =>
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => state
  )

// Chrome, Edge and Samsung Internet offer this; it has to be caught as the page loads.
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  set({ installPrompt: event })
})
addEventListener('appinstalled', () => set({ installPrompt: null, installed: true }))

export async function promptInstall() {
  const prompt = state.installPrompt
  if (!prompt) return false
  prompt.prompt()
  const { outcome } = await prompt.userChoice
  set({ installPrompt: null })
  return outcome === 'accepted'
}

let updateSW = null
let registration = null
const HOUR = 60 * 60 * 1000

export function setupPWA() {
  if (!('serviceWorker' in navigator)) return
  updateSW = registerSW({
    onNeedRefresh() {
      set({ updateReady: true })
      showToast('A new version of ImpactMe is ready.', {
        action: { label: 'Update', onClick: applyUpdate },
        duration: 0,
      })
    },
    // Shown in Settings rather than as a toast, which could push aside an "Undo".
    onOfflineReady() {
      set({ offlineReady: true })
    },
    onRegisteredSW(_url, reg) {
      registration = reg ?? null
      if (navigator.serviceWorker.controller) set({ offlineReady: true })
      if (globalThis.Notification?.permission === 'granted') registerBackgroundCheck()
      // Look for a new version every hour while the app is open.
      if (reg) setInterval(() => navigator.onLine && reg.update(), HOUR)
    },
    onRegisterError(error) {
      console.error('Offline support couldn’t be set up', error)
    },
  })
}

// Switches to the new version and reloads. Unsaved changes are written first
// (the store saves when the page is hidden or closed).
export const applyUpdate = () => updateSW?.(true)

// Returns 'update' | 'latest' | 'offline' | 'unavailable'.
export async function checkForUpdate() {
  if (!registration) return 'unavailable'
  if (!navigator.onLine) return 'offline'
  await registration.update()
  // A new version downloads in the background; give it a moment to finish.
  const installing = registration.installing
  if (installing) {
    await new Promise((resolve) => {
      const done = () => installing.state !== 'installing' && resolve()
      installing.addEventListener('statechange', done)
      setTimeout(resolve, 15000)
    })
  }
  return state.updateReady || registration.waiting ? 'update' : 'latest'
}
