import { FlagIcon } from '../icons.jsx'
import { PRIORITIES } from '../../lib/todos.js'

// Normal is the default, so it has no chip: picking nothing means Normal.
const CHOICES = PRIORITIES.filter((p) => p.value !== 'normal')

export default function PriorityPicker({ value, onChange }) {
  return (
    <div className="option-group" role="radiogroup" aria-label="Priority">
      <FlagIcon width={15} height={15} />
      {CHOICES.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          data-priority={p.value}
          className={value === p.value ? 'chip priority-chip active' : 'chip priority-chip'}
          onClick={() => onChange(value === p.value ? 'normal' : p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
