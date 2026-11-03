import { EventChip } from './TimeGrid.jsx'
import { parseDateKey } from '../../lib/dates.js'

const MAX_VISIBLE = 3
const byTime = (a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start)

export default function MonthView({ days, month, events, today, preview, drag, onSlot, onDayClick }) {
  const weekdays = days.slice(0, 7).map((d) => parseDateKey(d).toLocaleDateString(undefined, { weekday: 'short' }))
  return (
    <div className="month-view">
      <div className="month-head" aria-hidden="true">
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const items = events.filter((e) => e.date === day).sort(byTime)
          const outside = day.slice(0, 7) !== month
          const classes = ['month-cell', outside && 'outside', day === today && 'today', preview?.date === day && 'drop-target']
          return (
            <div
              key={day}
              className={classes.filter(Boolean).join(' ')}
              data-drop="day"
              data-date={day}
              onClick={(e) => e.target === e.currentTarget && onSlot(day, null)}
            >
              <button className="month-date" onClick={() => onDayClick(day)} aria-label={`Open ${parseDateKey(day).toDateString()}`}>
                {parseDateKey(day).getDate()}
              </button>
              {items.slice(0, MAX_VISIBLE).map((event) => (
                <EventChip key={event.key} event={event} drag={drag} dragging={preview?.key === event.key} showTime />
              ))}
              {items.length > MAX_VISIBLE && (
                <button className="month-more" onClick={() => onDayClick(day)}>
                  +{items.length - MAX_VISIBLE} more
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
