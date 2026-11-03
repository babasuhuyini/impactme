import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import BottomNav from './components/BottomNav.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import ToastHost from './components/Toast.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Journal from './pages/Journal.jsx'
import Todos from './pages/Todos.jsx'
import Settings from './pages/Settings.jsx'
import useJournal from './hooks/useJournal.js'
import { BrandMark, PlusIcon } from './components/icons.jsx'

const isTyping = (el) => el?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')

// Daybook links used /todos; keep old bookmarks working.
function LegacyTodos() {
  const { view } = useParams()
  return <Navigate to={view ? `/tasks/${view}` : '/tasks'} replace />
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { create } = useJournal()
  const writing = /^\/journal\/.+/.test(pathname)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [pathname])

  const newEntry = () => {
    setQuickAddOpen(false)
    navigate(`/journal/${create().id}`)
  }

  // Q: quick add a task. J: new journal entry. Ignored while typing.
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'q') {
        e.preventDefault()
        setQuickAddOpen(true)
      } else if (key === 'j') {
        e.preventDefault()
        newEntry()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div className={navOpen ? 'shell nav-open' : 'shell'}>
      <Sidebar
        onQuickAdd={() => {
          setNavOpen(false)
          setQuickAddOpen(true)
        }}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <div className={writing ? 'main writing' : 'main'}>
        <header className="topbar">
          <BrandMark size={24} className="brand-mark" />
          <span className="topbar-title">ImpactMe</span>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard onQuickAdd={() => setQuickAddOpen(true)} />} />
          <Route path="/tasks/:view?" element={<Todos />} />
          <Route path="/todos/:view?" element={<LegacyTodos />} />
          <Route path="/journal/:entryId?" element={<Journal />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <button className="fab" onClick={() => setQuickAddOpen(true)} aria-label="Quick add">
          <PlusIcon width={24} height={24} strokeWidth={2.4} />
        </button>
        <BottomNav onMore={() => setNavOpen(true)} />
      </div>

      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onWriteJournal={newEntry} />
      <ToastHost />
    </div>
  )
}
