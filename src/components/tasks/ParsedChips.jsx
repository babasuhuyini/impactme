import { CalendarIcon, ClockIcon, FlagIcon, RepeatIcon, XIcon } from '../icons.jsx'
import { describeRule } from '../../lib/recurrence.js'
import { formatDue, getPriority } from '../../lib/todos.js'
import { formatTimeRange } from '../../lib/format.js'

const ICONS = { date: CalendarIcon, time: ClockIcon, repeat: RepeatIcon, priority: FlagIcon }

function label(kind, parsed) {
  switch (kind) {
    case 'date':
      return formatDue(parsed.dueDate)
    case 'time':
      return formatTimeRange(parsed.startTime, parsed.endTime)
    case 'repeat':
      return describeRule(parsed.recurrence)
    case 'priority':
      return `${getPriority(parsed.priority).label} priority`
    default:
      return parsed.tags.map((t) => `#${t}`).join(' ')
  }
}

// Shows what Quick Add understood. Removing a chip puts those words back in the title.
export default function ParsedChips({ parsed, onIgnore }) {
  const order = ['date', 'time', 'repeat', 'priority', 'tags'].filter((k) => parsed.found.includes(k))
  if (!order.length) return null
  return (
    <div className="parsed" aria-live="polite">
      <span className="parsed-label">Understood</span>
      {order.map((kind) => {
        const Icon = ICONS[kind]
        return (
          <span key={kind} className="chip parsed-chip" data-kind={kind}>
            {Icon && <Icon width={13} height={13} />}
            {label(kind, parsed)}
            <button
              type="button"
              className="chip-remove"
              aria-label={`Don’t read “${label(kind, parsed)}” from the text`}
              title="Keep these words in the title instead"
              onClick={() => onIgnore(kind)}
            >
              <XIcon width={12} height={12} />
            </button>
          </span>
        )
      })}
    </div>
  )
}
