import MoodFace from './MoodFace.jsx'
import { MOODS } from '../../lib/journal.js'

export default function MoodPicker({ value, onChange }) {
  return (
    <div className={value ? 'mood-picker has-value' : 'mood-picker'} role="radiogroup" aria-label="Mood">
      {MOODS.map((mood) => (
        <button
          key={mood.value}
          type="button"
          role="radio"
          aria-checked={value === mood.value}
          data-mood={mood.value}
          aria-label={mood.label}
          className="mood-option"
          onClick={() => onChange(value === mood.value ? null : mood.value)}
        >
          <MoodFace mood={mood.value} size={22} />
          <span className="mood-label">{mood.label}</span>
        </button>
      ))}
    </div>
  )
}
