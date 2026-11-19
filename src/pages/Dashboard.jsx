import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { showToast } from '../components/Toast.jsx'
import {
  BellIcon,
  BookIcon,
  CheckIcon,
  ChecklistIcon,
  ChevronIcon,
  FlagIcon,
  PlusIcon,
  RepeatIcon,
  ShieldIcon,
} from '../components/icons.jsx'
import MoodFace from '../components/journal/MoodFace.jsx'
import useJournal from '../hooks/useJournal.js'
import { useAccount } from '../data/account.js'
import { updateSettings, useProjects, useSettings, useTasks } from '../data/store.js'
import { addDays, toDateKey } from '../lib/dates.js'
import { dailyPrompt, formatClock, formatLongDate, formatTime, formatTimeRange, greeting } from '../lib/format.js'
import { MOODS, computeStreak, entrySnippet, entryTitle, formatDayHeading } from '../lib/journal.js'
import { SORTS, bySchedule, formatDue, getPriority, isBlock, isDone, isOpenTask, reminderCount } from '../lib/todos.js'
import { openTask } from '../components/tasks/editorStore.js'
import { completeTask } from '../data/actions.js'

const UPCOMING_DAYS = 7
const UPCOMING_LIMIT = 6
const MINUTE = 60 * 1000

const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Re-renders once a minute, so "Up next · in 10 min" stays true.
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE)
    return () => clearInterval(timer)
  }, [])
  return now
}

// The next timed task today: one in progress, or the next to start.
function findUpNext(tasks, now) {
  const date = new Date(now)
  const current = date.getHours() * 60 + date.getMinutes()
  return tasks
    .filter((t) => t.startTime && !isBlock(t))
    .map((t) => {
      const start = toMinutes(t.startTime)
      const end = t.endTime ? toMinutes(t.endTime) : start + 1
      return { task: t, start, end }
    })
    .filter((x) => x.end > current)
    .sort((a, b) => a.start - b.start)
    .map((x) => ({ ...x, minutesAway: x.start - current }))[0]
}

function whenLabel(minutesAway) {
  if (minutesAway <= 0) return 'Now'
  if (minutesAway < 60) return `in ${minutesAway} min`
  const hours = Math.floor(minutesAway / 60)
  const minutes = minutesAway % 60
  return minutes ? `in ${hours} hr ${minutes} min` : `in ${hours} hr`
}

export default function Dashboard({ onQuickAdd }) {
  const navigate = useNavigate()
  const allTasks = useTasks()
  const projects = useProjects()
  const settings = useSettings()
  const { entries, create, update } = useJournal()
  const now = useNow()
  const today = toDateKey(new Date(now))

  const open = allTasks.filter(isOpenTask)
  const dueToday = allTasks.filter((t) => t.dueDate === today && !isBlock(t))
  const doneToday = dueToday.filter(isDone)
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(SORTS.due.compare)
  const todayOpen = dueToday.filter((t) => !isDone(t))
  // Today in time order: timed tasks and time blocks first, then the rest by priority.
  const schedule = [...todayOpen, ...allTasks.filter((t) => isBlock(t) && t.dueDate === today)].sort(bySchedule)
  const completedToday = allTasks
    .filter((t) => isDone(t) && !isBlock(t) && t.completedAt && toDateKey(new Date(t.completedAt)) === today)
    .sort((a, b) => b.completedAt - a.completedAt)
  const horizon = addDays(today, UPCOMING_DAYS)
  const upcoming = open
    .filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= horizon)
    .sort(SORTS.due.compare)
  const upNext = findUpNext(todayOpen, now)
  const projectOf = (task) => projects.find((p) => p.id === task.projectId) ?? null

  const todayEntry = entries.find((e) => e.date === today)
  const isNewUser = allTasks.length === 0 && entries.length === 0

  function newEntry(fields) {
    navigate(`/journal/${create(fields).id}`)
  }

  function logMood(mood) {
    if (todayEntry) {
      update(todayEntry.id, { mood })
      showToast('Mood saved in today’s entry')
    } else newEntry({ mood })
  }

  return (
    <div className="page-scroll">
      <div className="dash">
        <header className="dash-head">
          <div className="dash-head-text">
            <p className="dash-date">{formatLongDate()}</p>
            <h1 className="dash-greeting">
              {greeting()}
              {settings.name && (
                <>
                  ,<br className="phone-only" /> {settings.name}
                </>
              )}
            </h1>
            <p className="dash-prompt">{dailyPrompt()}</p>
          </div>
          <div className="dash-actions">
            <button className="btn primary" onClick={onQuickAdd}>
              <PlusIcon width={16} height={16} strokeWidth={2.3} />
              New Task
            </button>
            <button className="btn soft" onClick={() => newEntry()}>
              <BookIcon width={16} height={16} />
              Write in Journal
            </button>
          </div>
        </header>

        {!settings.name && !settings.namePromptDismissed && <NamePrompt />}

        {isNewUser ? (
          <GettingStarted onQuickAdd={onQuickAdd} onWrite={() => newEntry()} />
        ) : (
          <div className="dash-grid">
            <div className="dash-main">
              {upNext && <UpNext {...upNext} project={projectOf(upNext.task)} />}

              <section className="dash-section dash-today" aria-labelledby="today-heading">
                <SectionHead id="today-heading" title="Today" to="/tasks/today" link="See all" />
                <div className="list-card">
                  {overdue.length > 0 && (
                    <>
                      <p className="list-sublabel alert">Overdue</p>
                      <ul className="dash-tasks">
                        {overdue.map((t) => (
                          <DashTask key={t.id} task={t} project={projectOf(t)} overdue />
                        ))}
                      </ul>
                    </>
                  )}
                  {schedule.length > 0 && (
                    <>
                      <p className="list-sublabel">Due today</p>
                      <ul className="dash-tasks">
                        {schedule.map((t) => (
                          <DashTask key={t.id} task={t} project={projectOf(t)} />
                        ))}
                      </ul>
                    </>
                  )}
                  {todayOpen.length === 0 && (
                    <p className="dash-empty">
                      {dueToday.length ? 'Everything due today is done.' : 'Nothing due today.'}{' '}
                      <button className="link" onClick={onQuickAdd}>
                        Add a task
                      </button>
                    </p>
                  )}
                </div>
              </section>

              <section className="dash-section dash-upcoming" aria-labelledby="upcoming-heading">
                <SectionHead id="upcoming-heading" title="Next 7 days" to="/tasks/upcoming" link="Upcoming" />
                <div className="list-card">
                  {upcoming.length ? (
                    <UpcomingList
                      tasks={upcoming.slice(0, UPCOMING_LIMIT)}
                      more={upcoming.length - UPCOMING_LIMIT}
                      projectOf={projectOf}
                    />
                  ) : (
                    <p className="dash-empty">Nothing scheduled for the coming week.</p>
                  )}
                </div>
              </section>
            </div>

            <aside className="dash-side">
              <section className="dash-card progress-panel" aria-label="Today's progress">
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

              <MoodPanel entries={entries} todayEntry={todayEntry} today={today} onMood={logMood} />

              {completedToday.length > 0 && (
                <section className="dash-card dash-completed" aria-labelledby="done-heading">
                  <h2 id="done-heading" className="panel-title">
                    Completed today
                  </h2>
                  <ul className="done-list">
                    {completedToday.slice(0, 5).map((t) => (
                      <li key={t.id}>
                        <span className="done-dot" aria-hidden="true">
                          <CheckIcon width={12} height={12} strokeWidth={3} />
                        </span>
                        <span className="done-title">{t.title}</span>
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

function SectionHead({ id, title, to, link }) {
  return (
    <div className="section-head">
      <h2 id={id} className="section-title">
        {title}
      </h2>
      <Link to={to} className="section-link">
        {link}
      </Link>
    </div>
  )
}

// "2:00 PM" → ["2:00", "PM"]; "14:00" → ["14:00", ""].
function splitClock(time) {
  const text = formatClock(time)
  const at = text.lastIndexOf(' ')
  return at === -1 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)]
}

function UpNext({ task, minutesAway, project }) {
  const [clock, suffix] = splitClock(task.startTime)
  const priority = getPriority(task.priority)
  function done() {
    const undo = completeTask(task)
    showToast(task.recurrence ? 'Done. Next one scheduled' : 'Task completed', { undo })
  }
  return (
    <section className="up-next" aria-label="Up next">
      <span className="up-next-time" aria-hidden="true">
        <strong>{clock}</strong>
        {suffix && <span>{suffix}</span>}
      </span>
      <button className="up-next-body" onClick={() => openTask(task.id)}>
        <span className="up-next-label">Up next · {whenLabel(minutesAway)}</span>
        <span className="up-next-title">{task.title}</span>
        <span className="up-next-meta">
          {formatTimeRange(task.startTime, task.endTime)}
          {project && (
            <>
              {' · '}
              <ProjectChip project={project} />
            </>
          )}
        </span>
      </button>
      {task.priority !== 'normal' && (
        <span className="row-flag" data-priority={task.priority} title={`${priority.label} priority`}>
          <FlagIcon width={16} height={16} strokeWidth={2} />
          <span className="sr-only">{priority.label} priority</span>
        </span>
      )}
      <button className="btn soft up-next-done" onClick={done}>
        <CheckIcon width={16} height={16} strokeWidth={2.3} />
        Mark done
      </button>
      <ChevronIcon className="up-next-chevron" width={14} height={14} aria-hidden="true" />
    </section>
  )
}

function ProjectChip({ project }) {
  return (
    <span className="project-chip" data-color={project.color}>
      <span className="project-chip-dot" aria-hidden="true" />
      {project.name}
    </span>
  )
}

function DashTask({ task, project, overdue, compact }) {
  const priority = getPriority(task.priority)
  const block = isBlock(task)
  function complete() {
    const undo = completeTask(task)
    showToast(task.recurrence ? 'Done. Next one scheduled' : 'Task completed', { undo })
  }

  const meta = []
  if (overdue) meta.push(formatDue(task.dueDate))
  else if (task.startTime) meta.push(formatTimeRange(task.startTime, task.endTime))
  if (project) meta.push(<ProjectChip key="p" project={project} />)
  if (task.subtasks.length && !block) {
    const done = task.subtasks.filter((s) => s.done).length
    meta.push(`${done} of ${task.subtasks.length} subtasks`)
  }
  const tags = !block && task.tags.length > 0 && (
    <span className="row-tags">{task.tags.map((tag) => `#${tag}`).join(' ')}</span>
  )

  return (
    <li className={`dash-task${block ? ' block' : ''}${compact ? ' compact' : ''}`} data-priority={task.priority}>
      {block ? (
        <span className="block-glyph" aria-hidden="true" />
      ) : (
        <input
          type="checkbox"
          className="rc"
          checked={false}
          onChange={complete}
          aria-label={`Complete "${task.title}"`}
        />
      )}
      <button className="dash-task-body" onClick={() => openTask(task.id)}>
        <span className="dash-task-title">
          {task.title}
          {block && <span className="sr-only"> (time block)</span>}
        </span>
        {(meta.length > 0 || tags) && (
          <span className={overdue ? 'row-meta overdue' : 'row-meta'}>
            {meta.map((part, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {part}
              </span>
            ))}
            {tags}
          </span>
        )}
      </button>
      <span className="row-icons">
        {!block && task.priority !== 'normal' && (
          <span className="row-flag" data-priority={task.priority} title={`${priority.label} priority`}>
            <FlagIcon width={16} height={16} strokeWidth={2} />
            <span className="sr-only">{priority.label} priority</span>
          </span>
        )}
        {task.reminders.length > 0 && (
          <span className="row-icon" title={reminderCount(task)}>
            <BellIcon width={14} height={14} strokeWidth={2} />
            <span className="sr-only">{reminderCount(task)}</span>
          </span>
        )}
        {task.recurrence && (
          <span className="row-icon" title="Repeats">
            <RepeatIcon width={14} height={14} strokeWidth={2} />
            <span className="sr-only">Repeats</span>
          </span>
        )}
      </span>
    </li>
  )
}

function UpcomingList({ tasks: list, more, projectOf }) {
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
          <p className="list-sublabel">{formatDue(date)}</p>
          <ul className="dash-tasks">
            {items.map((t) => (
              <DashTask key={t.id} task={t} project={projectOf(t)} compact />
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

// Today's progress drawn as the ImpactMe day ring: "done/total" in the middle.
function DayRing({ done, total }) {
  const r = 44
  const circumference = 2 * Math.PI * r
  const ratio = total ? done / total : 0
  const label = total ? `${done} of ${total} tasks due today done` : 'No tasks due today'
  return (
    <svg className="day-ring" viewBox="0 0 100 100" role="img" aria-label={label}>
      <circle cx="50" cy="50" r={r} className="day-ring-track" />
      {total > 0 && (
        <circle
          cx="50"
          cy="50"
          r={r}
          className="day-ring-fill"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform="rotate(-90 50 50)"
        />
      )}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="day-ring-text">
        {total ? `${done}/${total}` : '—'}
      </text>
    </svg>
  )
}

function MoodPanel({ entries, todayEntry, today, onMood }) {
  const streak = computeStreak(entries)
  const previous = entries.find((e) => e.date < today)
  return (
    <section className="dash-card mood-panel" aria-labelledby="mood-heading">
      <div className="panel-head">
        <h2 id="mood-heading" className="panel-title">
          How are you feeling?
        </h2>
        {streak > 1 && (
          <span className="streak-pill" title="Days in a row with a journal entry">
            {streak}-day streak
          </span>
        )}
      </div>
      <div className="mood-faces" role="group" aria-label="Log today's mood">
        {MOODS.map((m) => (
          <button
            key={m.value}
            className="mood-face-btn"
            onClick={() => onMood(m.value)}
            aria-pressed={todayEntry?.mood === m.value}
          >
            <MoodFace mood={m.value} size={40} />
            {m.label}
          </button>
        ))}
      </div>
      {todayEntry ? (
        <Link to={`/journal/${todayEntry.id}`} className="mood-entry">
          <span className="mood-entry-when">Today</span>
          <span className="mood-entry-title">{entryTitle(todayEntry) || 'Untitled'}</span>
          {entrySnippet(todayEntry) && <span className="mood-entry-text">{entrySnippet(todayEntry, 140)}</span>}
        </Link>
      ) : (
        previous && (
          <Link to={`/journal/${previous.id}`} className="mood-entry">
            <span className="mood-entry-when">{formatDayHeading(previous.date)}</span>
            <span className="mood-entry-title">{entryTitle(previous) || 'Untitled'}</span>
            {entrySnippet(previous) && <span className="mood-entry-text">{entrySnippet(previous, 140)}</span>}
          </Link>
        )
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
  const signedIn = useAccount().status === 'signed-in'
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
            <p>
              {signedIn
                ? 'Everything is saved on this device and in your ImpactMe account. You can also download a backup.'
                : 'Everything stays in this browser on this device. Download a backup now and then.'}
            </p>
          </div>
          <Link className="btn secondary sm" to="/settings">
            Backup options
          </Link>
        </li>
      </ol>
    </section>
  )
}
