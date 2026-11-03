import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TimeGrid from '../components/calendar/TimeGrid.jsx'
import MonthView from '../components/calendar/MonthView.jsx'
import AgendaView from '../components/calendar/AgendaView.jsx'
import UnscheduledPanel from '../components/calendar/UnscheduledPanel.jsx'
import useCalendarDrag from '../components/calendar/useCalendarDrag.js'
import { newTaskDraft, openTask } from '../components/tasks/editorStore.js'
import { showToast } from '../components/Toast.jsx'
import { AlertIcon, ChevronIcon, ChevronLeftIcon, DownloadIcon } from '../components/icons.jsx'
import { tasks, updateSettings, useSettings, useTasks } from '../data/store.js'
import { completeTask } from '../data/actions.js'
import { downloadFile } from '../data/backup.js'
import { buildEvents, countConflicts, rangeFor, resolveWeekStart, shiftAnchor } from '../lib/calendar.js'
import { buildICS } from '../lib/ics.js'
import { fromMinutes, parseDateKey, toDateKey, toMinutes } from '../lib/dates.js'
import { formatClock } from '../lib/format.js'
import { formatDue, isOpenTask } from '../lib/todos.js'

const VIEWS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['agenda', 'Agenda'],
]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const narrowQuery = matchMedia('(max-width: 640px)')
const useNarrow = () =>
  useSyncExternalStore(
    (notify) => {
      narrowQuery.addEventListener('change', notify)
      return () => narrowQuery.removeEventListener('change', notify)
    },
    () => narrowQuery.matches
  )

function useNowMinutes() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return { today: toDateKey(now), minutes: now.getHours() * 60 + now.getMinutes() }
}

function rangeLabel(view, range, anchor) {
  const first = parseDateKey(range.from)
  const thisYear = first.getFullYear() === new Date().getFullYear()
  if (view === 'day')
    return parseDateKey(anchor).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }) })
  if (view === 'month') return parseDateKey(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  if (view === 'agenda') return `Next 30 days from ${formatDue(anchor).toLowerCase()}`
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  try {
    return fmt.formatRange(first, parseDateKey(range.to))
  } catch {
    return `${fmt.format(first)} – ${fmt.format(parseDateKey(range.to))}`
  }
}

export default function Calendar() {
  const { view: viewParam, date: dateParam } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const narrow = useNarrow()
  const allTasks = useTasks()
  const { today, minutes } = useNowMinutes()
  const [showUnscheduled, setShowUnscheduled] = useState(false)

  const preferred = narrow && settings.calendarView === 'week' ? 'day' : settings.calendarView
  const view = VIEWS.some(([key]) => key === viewParam) ? viewParam : preferred
  const anchor = DATE_RE.test(dateParam ?? '') ? dateParam : today
  const weekStart = resolveWeekStart(settings.weekStart)
  const range = rangeFor(view, anchor, weekStart)

  const events = useMemo(() => buildEvents(allTasks, range.from, range.to), [allTasks, range.from, range.to])
  const unscheduled = allTasks.filter((t) => isOpenTask(t) && !t.dueDate)
  const overdue = allTasks.filter((t) => isOpenTask(t) && t.dueDate && t.dueDate < today && anchor <= today)
  const timeline = view === 'day' || view === 'week'
  const conflicts = timeline ? countConflicts(events, range.days) : 0

  const go = (nextView, date = anchor) => navigate(`/calendar/${nextView}/${date}`)

  function pickView(nextView) {
    updateSettings({ calendarView: nextView })
    go(nextView)
  }

  const open = (event) => openTask(event.task.id)

  function addAt(day, time) {
    newTaskDraft({
      dueDate: day,
      startTime: time,
      endTime: time ? fromMinutes(Math.min(toMinutes(time) + 60, 24 * 60 - 1)) : null,
    })
  }

  function reschedule(item, to) {
    const before = tasks.get(item.task.id)
    if (!before) return
    const timed = !to.allDay && to.start != null
    tasks.update(before.id, {
      dueDate: to.date,
      startTime: timed ? fromMinutes(to.start) : null,
      endTime: timed ? fromMinutes(to.end) : null,
    })
    const when = `${formatDue(to.date)}${timed ? `, ${formatClock(fromMinutes(to.start))}` : ''}`
    showToast(item.date == null ? `Scheduled for ${when}` : `Moved to ${when}`, { undo: () => tasks.put(before) })
  }

  const drag = { ...useCalendarDrag({ onDrop: reschedule, onClick: open }), open }

  function exportCalendar() {
    const count = allTasks.filter((t) => t.dueDate && t.status !== 'done').length
    if (!count) return showToast('There’s nothing scheduled to export yet.')
    downloadFile('impactme-calendar.ics', buildICS(allTasks), 'text/calendar')
    showToast(`Exported ${count} ${count === 1 ? 'item' : 'items'}. Open the file to add them to Google, Outlook or Apple Calendar.`, {
      duration: 8000,
    })
  }

  return (
    <div className={`calendar-page view-${view}`}>
      <header className="cal-toolbar">
        <div className="cal-nav">
          <button className="btn secondary sm" onClick={() => go(view, today)}>
            Today
          </button>
          <button className="icon-btn" onClick={() => go(view, shiftAnchor(view, anchor, -1))} aria-label="Previous">
            <ChevronLeftIcon width={18} height={18} />
          </button>
          <button className="icon-btn" onClick={() => go(view, shiftAnchor(view, anchor, 1))} aria-label="Next">
            <ChevronIcon width={18} height={18} />
          </button>
          <h1 className="cal-title" aria-live="polite">
            {rangeLabel(view, range, anchor)}
          </h1>
        </div>
        <div className="cal-actions">
          {conflicts > 0 && (
            <span className="conflict-note" title="Items whose times overlap are outlined. Nothing is moved automatically.">
              <AlertIcon width={14} height={14} />
              {conflicts} overlapping
            </span>
          )}
          {timeline && (
            <button
              className={showUnscheduled ? 'btn secondary sm active' : 'btn secondary sm'}
              aria-pressed={showUnscheduled}
              onClick={() => setShowUnscheduled((v) => !v)}
            >
              Unscheduled
              {unscheduled.length > 0 && <span className="tab-count">{unscheduled.length}</span>}
            </button>
          )}
          <div className="segmented" role="radiogroup" aria-label="Calendar view">
            {VIEWS.map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={view === key}
                className={view === key ? 'segment active' : 'segment'}
                onClick={() => pickView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={exportCalendar} aria-label="Export to other calendar apps (.ics)" title="Export (.ics)">
            <DownloadIcon width={18} height={18} />
          </button>
        </div>
      </header>

      <div className={showUnscheduled && timeline ? 'cal-body with-panel' : 'cal-body'}>
        {timeline && (
          <TimeGrid
            days={range.days}
            events={events}
            today={today}
            nowMinutes={minutes}
            preview={drag.preview}
            drag={drag}
            onSlot={addAt}
            onDayClick={(day) => go('day', day)}
          />
        )}
        {view === 'month' && (
          <MonthView
            days={range.days}
            month={anchor.slice(0, 7)}
            events={events}
            today={today}
            preview={drag.preview}
            drag={drag}
            onSlot={addAt}
            onDayClick={(day) => go('day', day)}
          />
        )}
        {view === 'agenda' && (
          <AgendaView
            days={range.days}
            events={events}
            overdue={overdue}
            onOpen={open}
            onComplete={(task) => showToast('Task completed', { undo: completeTask(task) })}
          />
        )}
        {showUnscheduled && timeline && <UnscheduledPanel tasks={unscheduled} drag={drag} />}
      </div>
    </div>
  )
}
