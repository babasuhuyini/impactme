import { useSyncExternalStore } from 'react'

// True at phone widths (the app switches layout at 860px).
const query = typeof matchMedia === 'function' ? matchMedia('(max-width: 860px)') : null
const subscribe = (notify) => {
  query?.addEventListener('change', notify)
  return () => query?.removeEventListener('change', notify)
}

export default function usePhone() {
  return useSyncExternalStore(subscribe, () => Boolean(query?.matches))
}
