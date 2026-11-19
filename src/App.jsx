import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import BottomNav from './components/BottomNav.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import ReminderTray from './components/ReminderTray.jsx'
import ToastHost, { showToast } from './components/Toast.jsx'
import TaskEditorHost from './components/tasks/TaskEditor.jsx'
import { openTask, useTaskEditor } from './components/tasks/editorStore.js'
import Calendar from './pages/Calendar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Journal from './pages/Journal.jsx'
import Todos from './pages/Todos.jsx'
import Settings from './pages/Settings.jsx'
import useJournal from './hooks/useJournal.js'
import { rollForwardBlocks } from './data/actions.js'
import { clearNotice, getDeleteIntent, useAccount } from './data/account.js'
import { journal, projects, tasks } from './data/store.js'
import AccountRoutes, { isAccountRoute, isSignInRoute } from './pages/account/AccountRoutes.jsx'
import { welcomeDismissed } from './pages/account/SignIn.jsx'
import { startReminders } from './reminders/scheduler.js'
import { BrandMark, PlusIcon } from './components/icons.jsx'


const isTyping = (el) => el?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')

// Daybook links used /todos; keep old bookmarks working.
function LegacyTodos() {
  const { view } = useParams()
  return <Navigate to={view ? `/tasks/${view}` : '/tasks'} replace />
}

export default function App() {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { create } = useJournal()
  const writing = /^\/journal\/.+/.test(pathname)
  // Phone screens with their own back link in place of the shared header.
  const ownHeader = /^\/(tasks\/.+|calendar|journal)/.test(pathname)
  // The calendar's toolbar is its top bar on desktop.
  const ownTopbar = pathname.startsWith('/calendar')
  // Task details open beside the page on desktop.
  const taskOpen = Boolean(useTaskEditor())


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

  // Accounts: the Welcome screen on a first launch, then the screens a
  // signed-in person must see first (new password after a reset link,
  // "Before you start" until consent is recorded).
  const account = useAccount()
  const checkedWelcome = useRef(false)
  useEffect(() => {
    if (checkedWelcome.current || account.status === 'loading') return
    checkedWelcome.current = true
    const empty = !tasks.all().length && !journal.all().length && !projects.all().length
    if (account.status === 'signed-out' && empty && !welcomeDismissed() && pathname === '/') {
      navigate('/welcome', { replace: true })
    }
  }, [account.status, pathname, navigate])

  useEffect(() => {
    if (account.status !== 'signed-in') return
    if (account.recovery) {
      if (pathname !== '/account/new-password') navigate('/account/new-password', { replace: true })
      return
    }
    const consent = account.consent.status
    if ((consent === 'needed' || consent === 'error') && pathname !== '/account/consent') {
      if (pathname !== '/privacy' && pathname !== '/terms') navigate('/account/consent', { replace: true })
    } else if (consent === 'done' && account.device === 'choose') {
      if (pathname !== '/account/bring-data') navigate('/account/bring-data', { replace: true })
    } else if (
      consent === 'done' &&
      (isSignInRoute(pathname) || pathname === '/account/consent' || pathname === '/account/bring-data')
    ) {
      navigate('/', { replace: true })
    }
  }, [account.status, account.recovery, account.consent.status, account.device, pathname, navigate])

  // Back from signing in with Google again to confirm deleting the account:
  // Settings reopens the Delete Account dialog.
  useEffect(() => {
    if (account.status !== 'signed-in' || account.consent.status !== 'done' || account.device !== 'linked') return
    if (pathname !== '/settings' && getDeleteIntent()) navigate('/settings', { replace: true })
  }, [account.status, account.consent.status, account.device, pathname, navigate])

  // A sign-in link that didn't work (expired, opened in another browser).
  useEffect(() => {
    if (!account.notice) return
    showToast(account.notice.message, { tone: account.notice.tone === 'error' ? 'error' : undefined, duration: 12000 })
    clearNotice()
  }, [account.notice])

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

  if (isAccountRoute(pathname)) {
    return (
      <>
        <AccountRoutes />
        <ToastHost />
      </>
    )
  }

  return (
    <div className={taskOpen ? 'shell panel-open' : 'shell'}>
      <Sidebar />

      <div className={writing ? 'main writing' : 'main'}>
        {/* Desktop: a slim bar with the actions every page shares. */}
        <header className={ownTopbar ? 'topbar hidden' : 'topbar'}>
          <div className="topbar-actions">
            <button
              className="icon-btn topbar-btn"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Quick add (Q)"
              title="Quick add (Q)"
            >
              <PlusIcon width={18} height={18} />
            </button>
          </div>
        </header>
        {/* Phones: the brand and a round + button above each screen. */}
        <header className={ownHeader ? 'phone-bar hidden' : 'phone-bar'}>
          <BrandMark size={28} className="brand-mark" />
          <button className="round-btn primary" onClick={() => setQuickAddOpen(true)} aria-label="Quick add">
            <PlusIcon width={18} height={18} strokeWidth={2.2} />
          </button>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard onQuickAdd={() => setQuickAddOpen(true)} />} />
          <Route path="/tasks/project/:projectId" element={<Todos />} />
          <Route path="/tasks/:view?" element={<Todos />} />
          <Route path="/calendar/:view?/:date?" element={<Calendar onQuickAdd={() => setQuickAddOpen(true)} />} />
          <Route path="/todos/:view?" element={<LegacyTodos />} />
          <Route path="/journal/:entryId?" element={<Journal />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <BottomNav />
      </div>

      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onWriteJournal={newEntry} />
      <TaskEditorHost />
      <ReminderTray />
      <ToastHost />
    </div>
  )
}
