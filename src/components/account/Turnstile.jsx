// Cloudflare Turnstile, the CAPTCHA on sign-in, sign-up and reset forms. It
// stops bots from creating accounts and using up the email allowance. In
// managed mode most people never see it; it only asks for a click when unsure.
// Each token works once, so the form changes `resetKey` after every submit.

import { useEffect, useRef, useState } from 'react'
import { TURNSTILE_SITE_KEY } from '../../lib/supabase.js'

export const captchaEnabled = Boolean(TURNSTILE_SITE_KEY)

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading = null

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => {
      loading = null
      reject(new Error('Turnstile failed to load'))
    }
    document.head.append(script)
  })
  return loading
}

export default function Turnstile({ onToken, resetKey = 0 }) {
  const box = useRef(null)
  const widget = useRef(null)
  const [failed, setFailed] = useState(false)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!captchaEnabled) return
    let cancelled = false
    loadScript()
      .then((turnstile) => {
        if (cancelled || !box.current) return
        widget.current = turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          size: 'flexible',
          appearance: 'interaction-only',
          callback: (token) => {
            setFailed(false)
            onTokenRef.current(token)
          },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            setFailed(true)
            onTokenRef.current(null)
          },
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (widget.current != null) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [])

  // A new token after each submit.
  useEffect(() => {
    if (!resetKey || widget.current == null) return
    onTokenRef.current(null)
    window.turnstile?.reset(widget.current)
  }, [resetKey])

  if (!captchaEnabled) return null
  return (
    <div className="auth-captcha">
      <div ref={box} />
      {failed && (
        <p className="auth-error" role="alert">
          The security check couldn’t load. Check your connection, then reload the page.
        </p>
      )}
    </div>
  )
}
