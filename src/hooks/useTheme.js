import { useEffect, useSyncExternalStore } from 'react'
import { updateSettings, useSettings } from '../data/store.js'

const query = matchMedia('(prefers-color-scheme: dark)')
const subscribeSystem = (notify) => {
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

// Returns [resolved 'light' | 'dark', preference 'system' | 'light' | 'dark', setPreference].
// index.html applies the same choice before first paint.
export default function useTheme() {
  const { theme: preference } = useSettings()
  const systemDark = useSyncExternalStore(subscribeSystem, () => query.matches)
  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1513' : '#ffffff')
  }, [theme])

  return [theme, preference, (value) => updateSettings({ theme: value })]
}
