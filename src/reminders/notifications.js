// Browser notification support and permission, for the app (not the service worker).

import { useEffect, useState } from 'react'
import { REMINDER_SYNC_TAG } from './engine.js'

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

// 'default' (not asked yet) | 'granted' | 'denied' | 'unsupported'
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported')

export const isAppleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

// The active service worker, or null (it isn't used in development, and
// doesn't exist until the first visit has finished setting up).
export async function getRegistration() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    return registration?.active ? registration : null
  } catch {
    return null
  }
}

// Only ever called from a button press, as browsers expect.
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  const result = await Notification.requestPermission()
  if (result === 'granted') registerBackgroundCheck()
  return result
}

export async function sendTestNotification() {
  const title = 'Notifications are working'
  const options = {
    body: 'This is how ImpactMe will remind you about tasks.',
    tag: 'impactme-test',
  }
  const registration = await getRegistration()
  if (registration) {
    await registration.showNotification(title, {
      ...options,
      icon: new URL('icons/icon-192.png', registration.scope).href,
      badge: new URL('icons/badge-96.png', registration.scope).href,
    })
  } else {
    new Notification(title, options)
  }
}

// Installed apps in Chrome and Edge may check for reminders in the background
// now and then. The browser decides whether and how often; elsewhere this does nothing.
export async function registerBackgroundCheck() {
  try {
    const registration = await getRegistration()
    if (!registration?.periodicSync) return false
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' })
    if (status.state !== 'granted') return false
    await registration.periodicSync.register(REMINDER_SYNC_TAG, { minInterval: 15 * 60 * 1000 })
    return true
  } catch {
    return false
  }
}

// Permission can change in the browser's site settings at any time, so
// re-read it whenever ImpactMe comes back into view.
export function useNotificationPermission() {
  const [permission, setPermission] = useState(notificationPermission)
  useEffect(() => {
    const refresh = () => setPermission(notificationPermission())
    let status = null
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        status = s
        s.onchange = refresh
      })
      .catch(() => {})
    addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      if (status) status.onchange = null
      removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return [permission, setPermission]
}
