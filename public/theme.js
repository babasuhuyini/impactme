// Apply the saved theme before first paint so there's no light/dark flash.
// ImpactMe mirrors its theme setting here; Daybook used 'ui.theme'.
// A file rather than an inline script, so the Content Security Policy can
// forbid inline scripts.
try {
  let saved = localStorage.getItem('impactme.theme')
  if (!saved) saved = JSON.parse(localStorage.getItem('ui.theme'))
  const dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
} catch {
  document.documentElement.dataset.theme = 'light'
}
