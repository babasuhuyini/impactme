import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { showToast } from '../components/Toast.jsx'
import {
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  ChecklistIcon,
  FlagIcon,
  FlameIcon,
  PlusIcon,
  ShieldIcon,
} from '../components/icons.jsx'
import useJournal from '../hooks/useJournal.js'
import { tasks, updateSettings, useSettings, useTasks } from '../data/store.js'
import { addDays, toDateKey } from '../lib/dates.js'
import { dailyPrompt, formatLongDate, formatTime, greeting } from '../lib/format.js'
import { MOODS, computeStreak, entrySnippet, entryTitle, formatDayHeading, getMood } from '../lib/journal.js'
import { SORTS, formatDue, getPriority, isDone } from '../lib/todos.js'

const UPCOMING_DAYS = 7
const UPCOMING_LIMIT = 6

export default function Dashboard({ onQuickAdd }) {
  const navigate = useNavigate()
  const allTasks = useTasks()
  const settings = useSettings()
  const { entries, create } = useJournal()
  const today = toDateKey()

  const open = allTasks.filter((t) => !isDone(t))
  const dueToday = allTasks.filter((t) => t.dueDate === today)
  const doneToday = dueToday.filter(isDone)
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(SORTS.due.compare)
  const todayOpen = dueToday.filter((t) => !isDone(t)).sort(SORTS.priority.compare)
  const completedToday = allTasks
    .filter((t) => isDone(t) && t.completedAt && toDateKey(new Date(t.completedAt)) === today)
    .sort((a, b) => b.completedAt - a.completedAt)
  const horizon = addDays(today, UPCOMING_DAYS)
  const upcoming = open
    .filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= horizon)
    .sort(SORTS.due.compare)

  const todayEntries = entries.filter((e) => e.date === today)
  const isNewUser = allTasks.length === 0 && entries.length === 0

  function newEntry(fields) {
    navigate(`/journal/${create(fields).id}`)
  }

  return (
    <div className="page-scroll">
      <div className="dash">
        <header className="dash-head">
          <p className="dash-date">{formatLongDate()}</p>
          <h1 className="dash-greeting">
            {greeting()}
            {settings.name && `, ${settings.name}`}
          </h1>
          <p className="dash-prompt">{dailyPrompt()}</p>
          <div className="dash-actions">
            <button className="btn primary" onClick={onQuickAdd}>
              <PlusIcon width={16} height={16} strokeWidth={2.4} />
              New task
            </button>
            <button className="btn secondary" onClick={() => newEntry()}>
              <BookIcon width={16} height={16} />
              Write in journal
            </button>
          </div>
        </header>

        {!settings.name && !settings.namePromptDismissed && <NamePrompt />}

        {isNewUser ? (
          <GettingStarted onQuickAdd={onQuickAdd} onWrite={() => newEntry()} />
        ) : (
          <div className="dash-grid">
            <div className="dash-main">
              <section className="dash-section" aria-labelledby="today-heading">
                <SectionHead id="today-heading" title="Today" to="/tasks/today" count={todayOpen.length} />
                {overdue.length > 0 && (
                  <>
                    <p className="dash-sublabel alert">Overdue</p>
                    <ul className="dash-tasks">
                      {overdue.map((t) => (
                        <DashTask key={t.id} task={t} showDue />
                      ))}
                    </ul>
                  </>
                )}
                {todayOpen.length > 0 ? (
                  <>
                    {overdue.length > 0 && <p className="dash-sublabel">Due today</p>}
                    <ul className="dash-tasks">
                      {todayOpen.map((t) => (
                        <DashTask key={t.id} task={t} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="dash-empty">
                    {dueToday.length ? 'Everything due today is done.' : 'Nothing due today.'}{' '}
                    <button className="link" onClick={onQuickAdd}>
                      Add a task
                    </button>
                  </p>
                )}
              </section>

              <section className="dash-section" aria-labelledby="upcoming-heading">
                <SectionHead id="upcoming-heading" title="Next 7 days" to="/tasks/upcoming" count={upcoming.length} />
                {upcoming.length ? (
                  <UpcomingList tasks={upcoming.slice(0, UPCOMING_LIMIT)} more={upcoming.length - UPCOMING_LIMIT} />
                ) : (
                  <p className="dash-empty">Nothing scheduled for the coming week.</p>
                )}
              </section>
            </div>

            <aside className="dash-side">
              <section className="side-panel progress-panel" aria-label="Today's progress">
                <DayRing done={doneToday.length} total={dueToday.length} />
                <dl className="progress-stats">
                  <div>
                    <dt>Done</dt>
                    <dd>{doneToday.length}</dd>
                  </div>
                  <div>
                    <dt>Left</dt>
                    <dd>{dueToday.length - doneToday.length}</dd>
                  </div>
                  <div className={overdue.length ? 'alert' : undefined}>
                    <dt>Overdue</dt>
                    <dd>{overdue.length}</dd>
                  </div>
                </dl>
              </section>

              <JournalPanel entries={entries} todayEntries={todayEntries} onNew={newEntry} />

              {completedToday.length > 0 && (
                <section className="side-panel" aria-labelledby="done-heading">
                  <h2 id="done-heading" className="panel-title">
                    Completed today
                  </h2>
                  <ul className="done-list">
                    {completedToday.slice(0, 5).map((t) => (
                      <li key={t.id}>
                        <CheckIcon width={14} height={14} strokeWidth={2.6} />
                        <span>{t.title}</span>
                        <time>{formatTime(t.completedAt)}</time>
                      </li>
                    ))}
                  </ul>
                  {completedToday.length > 5 && (
                    <p className="panel-note">and {completedToday.length - 5} more</p>
                  )}
                </section>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHead({ id, title, to, count }) {
  return (
    <div className="section-head">
      <h2 id={id} className="section-title">
        {title}
        {count > 0 && <span className="tab-count">{count}</span>}
      </h2>
      <Link to={to} className="link section-link">
        View all
        <ArrowRightIcon width={14} height={14} />
      </Link>
    </div>
  )
}

function DashTask({ task, showDue }) {
  const priority = getPriority(task.priority)
  function complete() {
    tasks.update(task.id, { status: 'done', completedAt: Date.now() })
    showToast('Task completed', { undo: () => tasks.update(task.id, { status: 'open', completedAt: null }) })
  }
  return (
    <li className="dash-task" data-priority={task.priority}>
      <label className="check" title="Mark as done">
        <input type="checkbox" checked={false} onChange={complete} aria-label={`Complete "${task.title}"`} />
        <span className="checkmark">
          <CheckIcon width={12} height={12} strokeWidth={3} />
        </span>
      </label>
      <span className="dash-task-title">{task.title}</span>
      <span className="dash-task-meta">
        {task.priority !== 'normal' && (
          <span className="priority-badge">
            <FlagIcon width={13} height={13} />
            {priority.label}
          </span>
        )}
        {showDue && <span className="due-badge overdue">{formatDue(task.dueDate)}</span>}
      </span>
    </li>
  )
}

function UpcomingList({ tasks: list, more }) {
  const days = []
  for (const task of list) {
    const last = days[days.length - 1]
    if (last && last[0] === task.dueDate) last[1].push(task)
    else days.push([task.dueDate, [task]])
  }
  return (
    <>
      {days.map(([date, items]) => (
        <div key={date} className="upcoming-day">
          <p className="dash-sublabel">{formatDue(date)}</p>
          <ul className="dash-tasks">
            {items.map((t) => (
              <DashTask key={t.id} task={t} />
            ))}
          </ul>
        </div>
      ))}
      {more > 0 && (
        <Link to="/tasks/upcoming" className="link dash-more">
          {more} more this week
        </Link>
      )}
    </>
  )
}

// Today's progress drawn as the ImpactMe day ring.
function DayRing({ done, total }) {
  const r = 42
  const circumference = 2 * Math.PI * r
  const ratio = total ? done / total : 0
  const label = total ? `${done} of ${total} tasks due today done` : 'No tasks due today'
  return (
    <div className="day-ring" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="day-ring-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="day-ring-fill"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="day-ring-label">
        <strong>{total ? `${Math.round(ratio * 100)}%` : '—'}</strong>
        <span>{total ? 'of today done' : 'nothing due'}</span>
      </div>
    </div>
  )
}

function JournalPanel({ entries, todayEntries, onNew }) {
  const streak = computeStreak(entries)
  const latest = todayEntries[0]
  return (
    <section className="side-panel" aria-labelledby="journal-heading">
      <div className="panel-head">
        <h2 id="journal-heading" className="panel-title">
          Journal
        </h2>
        {streak > 1 && (
          <span className="streak" title="Days in a row with a journal entry">
            <FlameIcon width={14} height={14} />
            {streak}-day streak
          </span>
        )}
      </div>
      {latest ? (
        <Link to={`/journal/${latest.id}`} className="journal-preview">
          <span className="journal-preview-title">
            {getMood(latest.mood)?.emoji} {entryTitle(latest) || 'Untitled'}
          </span>
          {entrySnippet(latest) && <span className="journal-preview-text">{entrySnippet(latest, 120)}</span>}
          <span className="link">
            Continue writing <ArrowRightIcon width={14} height={14} />
          </span>
        </Link>
      ) : (
        <>
          <p className="panel-note">How are you feeling today?</p>
          <div className="mood-quick" role="group" aria-label="Log today's mood">
            {MOODS.map((m) => (
              <button
                key={m.value}
                data-mood={m.value}
                className="mood-quick-btn"
                onClick={() => onNew({ mood: m.value })}
                title={m.label}
                aria-label={`${m.label}: start today's entry`}
              >
                {m.emoji}
              </button>
            ))}
          </div>
          <button className="link" onClick={() => onNew()}>
            Write today’s entry
          </button>
        </>
      )}
      {todayEntries.length > 1 && <p className="panel-note">{todayEntries.length} entries today</p>}
      {!latest && entries[0] && (
        <p className="panel-note">Last entry: {formatDayHeading(entries[0].date).toLowerCase()}</p>
      )}
    </section>
  )
}

function NamePrompt() {
  const [name, setName] = useState('')
  return (
    <form
      className="name-prompt"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) updateSettings({ name })
      }}
    >
      <label htmlFor="name-prompt-input">What should ImpactMe call you?</label>
      <div className="name-prompt-row">
        <input
          id="name-prompt-input"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          autoComplete="given-name"
          maxLength={60}
        />
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Save
        </button>
        <button type="button" className="btn ghost" onClick={() => updateSettings({ namePromptDismissed: true })}>
          Not now
        </button>
      </div>
    </form>
  )
}

function GettingStarted({ onQuickAdd, onWrite }) {
  return (
    <section className="getting-started" aria-labelledby="start-heading">
      <h2 id="start-heading" className="section-title">
        Getting started
      </h2>
      <ol className="start-steps">
        <li>
          <span className="start-icon">
            <ChecklistIcon width={18} height={18} />
          </span>
          <div>
            <strong>Plan your day</strong>
            <p>Add the first thing you want to get done. Press Q anywhere to add a task.</p>
          </div>
          <button className="btn secondary sm" onClick={onQuickAdd}>
            Add a task
          </button>
        </li>
        <li>
          <span className="start-icon">
            <BookIcon width={18} height={18} />
          </span>
          <div>
            <strong>Reflect on it</strong>
            <p>Write a few lines about today and how you feel. Press J to start an entry.</p>
          </div>
          <button className="btn secondary sm" onClick={onWrite}>
            Start writing
          </button>
        </li>
        <li>
          <span className="start-icon">
            <ShieldIcon width={18} height={18} />
          </span>
          <div>
            <strong>Keep it safe</strong>
            <p>Everything stays in this browser on this device. Download a backup now and then.</p>
          </div>
          <Link className="btn secondary sm" to="/settings">
            Backup options
          </Link>
        </li>
      </ol>
    </section>
  )
}
