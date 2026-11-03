import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/literata/opsz.css'
import App from './App.jsx'
import { showToast } from './components/Toast.jsx'
import { initStore, onStorageError, requestPersistence } from './data/store.js'
import './styles/base.css'
import './styles/shell.css'
import './styles/dashboard.css'
import './styles/journal.css'
import './styles/todos.css'
import './styles/settings.css'

const root = createRoot(document.getElementById('root'))

onStorageError(() =>
  showToast('Your last change couldn’t be saved. Check that this browser isn’t out of storage, then try again.', {
    tone: 'error',
    duration: 0,
  })
)

function StartupError({ error }) {
  return (
    <div className="startup-error" role="alert">
      <h1>ImpactMe couldn’t open its storage</h1>
      <p>
        Your data is stored in this browser. It may be blocked by private browsing, a browser setting, or a full
        disk. Nothing has been deleted.
      </p>
      <p className="startup-error-detail">{error?.message}</p>
      <button className="btn primary" onClick={() => location.reload()}>
        Try again
      </button>
    </div>
  )
}

initStore()
  .then(() => {
    root.render(
      <StrictMode>
        {/* Hash URLs (/#/journal) work on static hosts like GitHub Pages, which can't route deep links. */}
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>
    )
    // Ask the browser not to clear ImpactMe's data when space runs low. Firefox shows
    // a prompt for this, so there it's left to the button in Settings.
    if (!/firefox/i.test(navigator.userAgent)) requestPersistence()
  })
  .catch((error) => {
    console.error(error)
    root.render(<StartupError error={error} />)
  })
