import { useState } from 'react'
import { PRESETS, WEEKDAY_SHORT, describeRule, normalizeRule, presetOf, ruleFromPreset } from '../../lib/recurrence.js'
import { toDateKey } from '../../lib/dates.js'

const UNITS = [
  ['daily', 'day'],
  ['weekly', 'week'],
  ['monthly', 'month'],
  ['yearly', 'year'],
]

// Repeat menu with a custom panel. `dueDate` anchors the rule; with no date the
// series starts today (the editor sets the date to match).
export default function RepeatPicker({ value, dueDate, onChange, idPrefix = 'repeat' }) {
  const start = dueDate ?? toDateKey()
  // "Custom" stays open even when the rule happens to match a simple preset.
  const [customOpen, setCustomOpen] = useState(presetOf(value) === 'custom')
  const preset = value && customOpen ? 'custom' : presetOf(value)
  const update = (changes) => onChange(normalizeRule({ ...value, ...changes }, start))
  const ends = value?.endsOn ? 'date' : value?.count ? 'count' : 'never'

  return (
    <div className="repeat-picker">
      <select
        id={`${idPrefix}-preset`}
        className="input"
        value={preset}
        onChange={(e) => {
          const choice = e.target.value
          setCustomOpen(choice === 'custom')
          onChange(choice === 'custom' && value ? { ...value } : ruleFromPreset(choice, start))
        }}
      >
        {PRESETS.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      {value && preset === 'custom' && (
        <div className="repeat-custom">
          <div className="repeat-row">
            <span>Every</span>
            <input
              type="number"
              className="input input-num"
              min={1}
              max={365}
              value={value.interval}
              onChange={(e) => update({ interval: Number(e.target.value) || 1 })}
              aria-label="Repeat interval"
            />
            <select
              className="input"
              value={value.freq}
              onChange={(e) => update({ freq: e.target.value, weekdays: [], monthDay: null })}
              aria-label="Repeat unit"
            >
              {UNITS.map(([freq, unit]) => (
                <option key={freq} value={freq}>
                  {value.interval === 1 ? unit : `${unit}s`}
                </option>
              ))}
            </select>
          </div>

          {value.freq === 'weekly' && (
            <div className="weekday-toggle" role="group" aria-label="Repeat on">
              {WEEKDAY_SHORT.map((label, day) => {
                const on = value.weekdays.includes(day)
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    className={on ? 'chip active' : 'chip'}
                    onClick={() => {
                      const days = on ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day]
                      if (days.length) update({ weekdays: days })
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {value.freq === 'monthly' && (
            <div className="repeat-row">
              <span>On day</span>
              <input
                type="number"
                className="input input-num"
                min={1}
                max={31}
                value={value.monthDay}
                onChange={(e) => update({ monthDay: Number(e.target.value) || 1 })}
                aria-label="Day of the month"
              />
              {value.monthDay > 28 && <span className="field-hint">Shorter months use their last day.</span>}
            </div>
          )}

          <div className="repeat-row">
            <span>Ends</span>
            <select
              className="input"
              value={ends}
              onChange={(e) =>
                update(
                  e.target.value === 'date'
                    ? { endsOn: start, count: null }
                    : e.target.value === 'count'
                      ? { endsOn: null, count: 10 }
                      : { endsOn: null, count: null }
                )
              }
              aria-label="When the repeat ends"
            >
              <option value="never">Never</option>
              <option value="date">On a date</option>
              <option value="count">After a number of times</option>
            </select>
            {ends === 'date' && (
              <input
                type="date"
                className="input"
                min={start}
                value={value.endsOn}
                onChange={(e) => e.target.value && update({ endsOn: e.target.value })}
                aria-label="Last date"
              />
            )}
            {ends === 'count' && (
              <>
                <input
                  type="number"
                  className="input input-num"
                  min={1}
                  max={999}
                  value={value.count}
                  onChange={(e) => update({ count: Number(e.target.value) || 1 })}
                  aria-label="Number of times"
                />
                <span>times</span>
              </>
            )}
          </div>
        </div>
      )}

      {value && <p className="field-hint">{describeRule(value)}</p>}
    </div>
  )
}
