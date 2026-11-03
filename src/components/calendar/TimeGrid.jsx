import { useEffect, useRef } from 'react'
import { AlertIcon, CheckIcon, RepeatIcon } from '../icons.jsx'
import { layoutDay } from '../../lib/calendar.js'
import { fromMinutes, parseDateKey } from '../../lib/dates.js'
import { formatClock, formatHour, formatTimeRange } from '../../lib/format.js'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const DAY = 24 * 60
const pct = (minutes) => `${(minutes / DAY) * 100}%`

// Day and week views: an all-day row, then a scrolling 24-hour grid.
export default function TimeGrid({ days, events, today, nowMinutes, preview, drag, onSlot, onDayClick }) {
  const scrollRef = useRef(null)

  // Open at the current time on today, otherwise at 7 AM.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const hour = days.includes(today) ? Math.max(0, Math.floor(nowMinutes / 60) - 2) : 7
    el.scrollTop = (el.scrollHeight / 24) * hour
    // Only when the visible days change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()])

  return (
    <div className={`time-grid cols-${days.length}`}>
      <div className="tg-head">
        <div className="tg-gutter" />
        {days.map((day) => {
          const date = parseDateKey(day)
          return (
            <button
              key={day}
              className={day === today ? 'tg-day today' : 'tg-day'}
              onClick={() => onDayClick(day)}
              title="Open this day"
            >
              <span className="tg-weekday">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="tg-date">{date.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div className="tg-allday">
        <div className="tg-gutter tg-allday-label">All day</div>
        {days.map((day) => (
          <div
            key={day}
            className={preview?.allDay && preview.date === day ? 'tg-allday-cell drop-target' : 'tg-allday-cell'}
            data-drop="day"
            data-date={day}
            onClick={(e) => e.target === e.currentTarget && onSlot(day, null)}
          >
            {events
              .filter((e) => e.allDay && e.date === day)
              .map((event) => (
                <EventChip key={event.key} event={event} drag={drag} dragging={preview?.key === event.key} />
              ))}
          </div>
        ))}
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body">
          <div className="tg-gutter tg-hours" aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h} style={{ top: pct(h * 60) }}>
                {h > 0 && formatHour(h)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              className={day === today ? 'tg-col today' : 'tg-col'}
              data-drop="time"
              data-date={day}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return
                const box = e.currentTarget.getBoundingClientRect()
                const minutes = Math.floor((((e.clientY - box.top) / box.height) * DAY) / 30) * 30
                onSlot(day, fromMinutes(minutes))
              }}
            >
              {layoutDay(events.filter((e) => e.date === day)).map((placed) => (
                <TimedEvent
                  key={placed.event.key}
                  placed={placed}
                  drag={drag}
                  dragging={preview?.key === placed.event.key}
                />
              ))}
              {preview && !preview.allDay && preview.date === day && (
                <div
                  className="cal-ghost"
                  style={{ top: pct(preview.start), height: pct(preview.end - preview.start) }}
                  aria-hidden="true"
                >
                  {formatTimeRange(fromMinutes(preview.start), fromMinutes(preview.end))}
                </div>
              )}
              {day === today && <div className="now-line" style={{ top: pct(nowMinutes) }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function eventLabel(event) {
  const { task } = event
  const time = event.allDay ? 'All day' : formatTimeRange(fromMinutes(event.start), fromMinutes(event.end))
  const parts = [task.title, time]
  if (task.kind === 'block') parts.push('time block')
  if (event.virtual) parts.push('upcoming repeat')
  if (event.done) parts.push('done')
  return parts.join(', ')
}

// `base` is cal-event (positioned in the time grid) or cal-chip (in a list or month cell).
function eventClass(base, event, extra) {
  return [
    base,
    extra,
    event.task.kind === 'block' && 'block',
    event.done && 'done',
    event.virtual && 'virtual',
  ]
    .filter(Boolean)
    .join(' ')
}

function TimedEvent({ placed, drag, dragging }) {
  const { event, col, cols, conflict } = placed
  const short = event.end - event.start < 45
  return (
    <div
      role="button"
      tabIndex={0}
      className={eventClass('cal-event', event, [conflict && 'conflict', short && 'short', dragging && 'dragging'].filter(Boolean).join(' '))}
      data-priority={event.task.priority}
      style={{
        top: pct(event.start),
        height: pct(Math.max(event.end - event.start, 15)),
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
      }}
      onPointerDown={(e) => drag.start(e, event)}
      onKeyDown={(e) => e.key === 'Enter' && drag.open(event)}
      aria-label={eventLabel(event) + (conflict ? ', overlaps another item' : '')}
      title={conflict ? 'Overlaps with another item' : undefined}
    >
      <span className="cal-event-title">
        {event.done && <CheckIcon width={11} height={11} strokeWidth={3} />}
        {event.task.title}
      </span>
      {!short && (
        <span className="cal-event-time">
          {conflict && <AlertIcon width={11} height={11} />}
          {formatClock(fromMinutes(event.start))}
          {event.task.recurrence && <RepeatIcon width={11} height={11} />}
        </span>
      )}
      {!event.virtual && !event.done && (
        <span
          className="cal-resize"
          onPointerDown={(e) => drag.start(e, event, 'resize')}
          aria-hidden="true"
          title="Drag to change the end time"
        />
      )}
    </div>
  )
}

export function EventChip({ event, drag, dragging, showTime = false }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={eventClass('cal-chip', event, dragging && 'dragging')}
      data-priority={event.task.priority}
      onPointerDown={(e) => drag.start(e, event)}
      onKeyDown={(e) => e.key === 'Enter' && drag.open(event)}
      aria-label={eventLabel(event)}
    >
      {event.done && <CheckIcon width={11} height={11} strokeWidth={3} />}
      {showTime && !event.allDay && <span className="cal-chip-time">{formatClock(fromMinutes(event.start))}</span>}
      <span className="cal-chip-title">{event.task.title}</span>
    </div>
  )
}
