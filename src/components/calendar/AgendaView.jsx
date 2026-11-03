import { AlertIcon, CheckIcon, RepeatIcon } from '../icons.jsx'
import { fromMinutes } from '../../lib/dates.js'
import { formatTimeRange } from '../../lib/format.js'
import { formatDayHeading } from '../../lib/journal.js'
import { formatDue } from '../../lib/todos.js'
import { layoutDay } from '../../lib/calendar.js'

const byTime = (a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start)

// A list of the coming 30 days, with anything overdue first.
export default function AgendaView({ days, events, overdue, onOpen, onComplete }) {
  const withItems = days.filter((day) => events.some((e) => e.date === day))
  return (
    <div className="agenda">
      {overdue.length > 0 && (
        <section className="agenda-day">
          <h2 className="agenda-date alert">Overdue</h2>
          <ul className="agenda-list">
            {overdue.map((task) => (
              <AgendaItem
                key={task.id}
                event={{ key: task.id, task, allDay: !task.startTime, virtual: false, done: false }}
                note={formatDue(task.dueDate)}
                onOpen={onOpen}
                onComplete={onComplete}
              />
            ))}
          </ul>
        </section>
      )}
      {withItems.length === 0 && overdue.length === 0 && (
        <p className="empty-inline">Nothing scheduled in the next 30 days.</p>
      )}
      {withItems.map((day) => {
        const items = events.filter((e) => e.date === day).sort(byTime)
        const clashes = new Set(layoutDay(items).filter((p) => p.conflict).map((p) => p.event.key))
        return (
          <section key={day} className="agenda-day">
            <h2 className="agenda-date">{formatDayHeading(day)}</h2>
            <ul className="agenda-list">
              {items.map((event) => (
                <AgendaItem
                  key={event.key}
                  event={event}
                  conflict={clashes.has(event.key)}
                  onOpen={onOpen}
                  onComplete={onComplete}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function AgendaItem({ event, note, conflict, onOpen, onComplete }) {
  const { task } = event
  const time = event.allDay
    ? 'All day'
    : event.start != null
      ? formatTimeRange(fromMinutes(event.start), fromMinutes(event.end))
      : formatTimeRange(task.startTime, task.endTime)
  const canComplete = task.kind === 'task' && !event.done && !event.virtual
  return (
    <li className={['agenda-item', event.done && 'done', event.virtual && 'virtual', task.kind === 'block' && 'block'].filter(Boolean).join(' ')} data-priority={task.priority}>
      {canComplete ? (
        <label className="check" title="Mark as done">
          <input type="checkbox" checked={false} onChange={() => onComplete(task)} aria-label={`Complete "${task.title}"`} />
          <span className="checkmark">
            <CheckIcon width={12} height={12} strokeWidth={3} />
          </span>
        </label>
      ) : (
        <span className="agenda-marker" aria-hidden="true" />
      )}
      <span className="agenda-time">{time}</span>
      <button className="agenda-title" onClick={() => onOpen(event)}>
        {task.title}
        {task.recurrence && <RepeatIcon width={12} height={12} aria-label="Repeats" />}
      </button>
      {note && <span className="due-badge overdue">{note}</span>}
      {conflict && (
        <span className="conflict-note">
          <AlertIcon width={12} height={12} />
          Overlaps
        </span>
      )}
    </li>
  )
}
