import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TimeGrid from '../components/calendar/TimeGrid.jsx'
import MonthView from '../components/calendar/MonthView.jsx'
import AgendaView from '../components/calendar/AgendaView.jsx'
import UnscheduledPanel from '../components/calendar/UnscheduledPanel.jsx'
import useCalendarDrag from '../components/calendar/useCalendarDrag.js'
import { newTaskDraft, openTask } from '../components/tasks/editorStore.js'
import { showToast } from '../components/Toast.jsx'
import { AlertIcon, ChevronIcon, ChevronLeftIcon, DownloadIcon, GripIcon, PlusIcon } from '../components/icons.jsx'
import usePhone from '../hooks/usePhone.js'
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


function useNowMinutes() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return { today: toDateKey(now), minutes: now.getHours() * 60 + now.getMinutes() }
}

const monthName = (anchor) => parseDateKey(anchor).toLocaleDateString(undefined, { month: 'long' })

// Desktop title (UI upgrade): "November 2026" for week and month.
function CalendarTitle({ view, range, anchor }) {
  if (view === 'week' || view === 'month') {
    const date = parseDateKey(view === 'week' ? range.from : anchor)
    return (
      <>
        {date.toLocaleDateString(undefined, { month: 'long' })} <span className="cal-year">{date.getFullYear()}</span>
      </>
    )
  }
  return rangeLabel(view, range, anchor)
}

// Phones: the week around the selected day, with a dot on days that have something.
function WeekStrip({ days, selected, today, busy, onPick }) {
  return (
    <div className="week-strip" role="group" aria-label="Days this week">
      {days.map((day) => {
        const date = parseDateKey(day)
        const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
        const className = ['week-day', day === selected && 'selected', day === today && 'today'].filter(Boolean).join(' ')
        return (
          <button
            key={day}
            className={className}
            onClick={() => onPick(day)}
            aria-label={label}
            aria-pressed={day === selected}
            aria-current={day === today ? 'date' : undefined}
          >
            <span className="week-day-name" aria-hidden="true">
              {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
            </span>
            <span className="week-day-num" aria-hidden="true">
              {date.getDate()}
            </span>
            <span className={busy.has(day) ? 'week-day-dot on' : 'week-day-dot'} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
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

export default function Calendar({ onQuickAdd }) {
  const { view: viewParam, date: dateParam } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const phone = usePhone()
  const allTasks = useTasks()
  const { today, minutes } = useNowMinutes()
  // Phones open the unscheduled list as a sheet; desktop always shows it beside the grid.
  const [showUnscheduled, setShowUnscheduled] = useState(false)

  const preferred = phone && settings.calendarView === 'week' ? 'day' : settings.calendarView
  const view = VIEWS.some(([key]) => key === viewParam) ? viewParam : preferred
  const anchor = DATE_RE.test(dateParam ?? '') ? dateParam : today
  const weekStart = resolveWeekStart(settings.weekStart)
  const range = rangeFor(view, anchor, weekStart)

  const events = useMemo(() => buildEvents(allTasks, range.from, range.to), [allTasks, range.from, range.to])
  const unscheduled = allTasks.filter((t) => isOpenTask(t) && !t.dueDate)
  const overdue = allTasks.filter((t) => isOpenTask(t) && t.dueDate && t.dueDate < today && anchor <= today)
  const timeline = view === 'day' || view === 'week'
  const conflicts = timeline ? countConflicts(events, range.days) : 0
  const panelOpen = timeline && (phone ? showUnscheduled : true)
  // Phones, day view: the week strip shows dots for the whole week.
  const week = rangeFor('week', anchor, weekStart)
  const weekEvents = useMemo(
    () => (phone && view === 'day' ? buildEvents(allTasks, week.from, week.to) : []),
    [phone, view, allTasks, week.from, week.to]
  )
  const busyDays = useMemo(() => new Set(weekEvents.map((e) => e.date)), [weekEvents])

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
      {/* Phones: back to the month, Today, and + */}
      <div className="cal-phone-nav">
        <button className="back-link" onClick={() => pickView('month')}>
          <ChevronLeftIcon width={22} height={22} strokeWidth={2.4} />
          {monthName(anchor)}
        </button>
        <div className="cal-phone-actions">
          {anchor !== today && (
            <button className="text-btn" onClick={() => go(view, today)}>
              Today
            </button>
          )}
          <button className="round-btn primary" onClick={onQuickAdd} aria-label="Quick add">
            <PlusIcon width={18} height={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>

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
            <CalendarTitle view={view} range={range} anchor={anchor} />
          </h1>
        </div>
        <div className="cal-actions">
          {conflicts > 0 && (
            <span className="conflict-note" title="Items whose times overlap are outlined. Nothing is moved automatically.">
              <AlertIcon width={14} height={14} />
              {conflicts} overlapping
            </span>
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
          <button className="icon-btn cal-quick-add" onClick={onQuickAdd} aria-label="Quick add (Q)" title="Quick add (Q)">
            <PlusIcon width={18} height={18} />
          </button>
        </div>
      </header>

      {phone && view === 'day' && (
        <>
          <WeekStrip days={week.days} selected={anchor} today={today} busy={busyDays} onPick={(day) => go('day', day)} />
          <p className="cal-dayline">
            {parseDateKey(anchor).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </>
      )}

      <div className={panelOpen ? 'cal-body with-panel' : 'cal-body'}>
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
        {panelOpen && <UnscheduledPanel tasks={unscheduled} drag={drag} onClose={phone ? () => setShowUnscheduled(false) : undefined} />}
      </div>

      {/* Phones: a floating pill opens the unscheduled list. */}
      {phone && timeline && !showUnscheduled && unscheduled.length > 0 && (
        <button className="unscheduled-pill" onClick={() => setShowUnscheduled(true)}>
          <GripIcon width={14} height={14} aria-hidden="true" />
          {unscheduled.length} unscheduled
        </button>
      )}
    </div>
  )
}
