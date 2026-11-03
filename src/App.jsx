import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import BottomNav from './components/BottomNav.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import ReminderTray from './components/ReminderTray.jsx'
import ToastHost, { showToast } from './components/Toast.jsx'
import TaskEditorHost from './components/tasks/TaskEditor.jsx'
import { openTask } from './components/tasks/editorStore.js'
import Calendar from './pages/Calendar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Journal from './pages/Journal.jsx'
import Todos from './pages/Todos.jsx'
import Settings from './pages/Settings.jsx'
import useJournal from './hooks/useJournal.js'
import { rollForwardBlocks } from './data/actions.js'
import { tasks } from './data/store.js'
import { startReminders } from './reminders/scheduler.js'
import { BrandMark, PlusIcon } from './components/icons.jsx'

const phoneQuery = matchMedia('(max-width: 860px)')
const subscribePhone = (notify) => {
  phoneQuery.addEventListener('change', notify)
  return () => phoneQuery.removeEventListener('change', notify)
}

const isTyping = (el) => el?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')

// Daybook links used /todos; keep old bookmarks working.
function LegacyTodos() {
  const { view } = useParams()
  return <Navigate to={view ? `/tasks/${view}` : '/tasks'} replace />
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { create } = useJournal()
  const writing = /^\/journal\/.+/.test(pathname)
  const phone = useSyncExternalStore(subscribePhone, () => phoneQuery.matches)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [pathname])

  // Keep repeating time blocks on their current date, now and whenever the app comes back into view.
  useEffect(() => {
    rollForwardBlocks()
    startReminders()
    const onVisible = () => document.visibilityState === 'visible' && rollForwardBlocks()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Clicking a reminder notification opens its task: /?task=<id>.
  useEffect(() => {
    const id = new URLSearchParams(search).get('task')
    if (!id) return
    navigate(pathname, { replace: true })
    if (tasks.get(id)) openTask(id)
    else showToast('That task has been deleted.')
  }, [search, pathname, navigate])

  useEffect(() => {
    const onMessage = ({ data }) => data?.type === 'open' && navigate(data.hash.replace(/^#/, ''))
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [navigate])

  const newEntry = () => {
    setQuickAddOpen(false)
    navigate(`/journal/${create().id}`)
  }

  // Q: quick add a task. J: new journal entry. Ignored while typing.
  // Attached once, before the first paint, so a key pressed straight away still works.
  const newEntryRef = useRef(newEntry)
  newEntryRef.current = newEntry
  useLayoutEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'q') {
        e.preventDefault()
        setQuickAddOpen(true)
      } else if (key === 'j') {
        e.preventDefault()
        newEntryRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={navOpen ? 'shell nav-open' : 'shell'}>
      <Sidebar
        onQuickAdd={() => {
          setNavOpen(false)
          setQuickAddOpen(true)
        }}
        onNavigate={() => setNavOpen(false)}
        // On phones the closed drawer is off screen; keep it away from keyboards and screen readers.
        inert={phone && !navOpen}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <div className={writing ? 'main writing' : 'main'}>
        <header className="topbar">
          <BrandMark size={24} className="brand-mark" />
          <span className="topbar-title">ImpactMe</span>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard onQuickAdd={() => setQuickAddOpen(true)} />} />
          <Route path="/tasks/project/:projectId" element={<Todos />} />
          <Route path="/tasks/:view?" element={<Todos />} />
          <Route path="/calendar/:view?/:date?" element={<Calendar />} />
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
      <TaskEditorHost />
      <ReminderTray />
      <ToastHost />
    </div>
  )
}
