import { useState } from 'react'
import { XIcon } from '../icons.jsx'
import { useSettings } from '../../data/store.js'
import { toDateKey } from '../../lib/dates.js'
import { MAX_REMINDERS, REMINDER_PRESETS, clockLabel, describeReminder, newReminder } from '../../lib/reminders.js'
import { notificationPermission } from '../../reminders/notifications.js'

const UNITS = [
  ['minutes', 1],
  ['hours', 60],
  ['days', 1440],
]

// value: the task's reminders. Relative reminders need a date to count back from;
// a fixed date and time works for any task.
export default function ReminderPicker({ value, dueDate, startTime, onChange }) {
  const settings = useSettings()
  const [custom, setCustom] = useState(null) // null | { mode, amount, unit, at }
  const label = (r) =>
    describeReminder(r, { timed: Boolean(startTime), allDayTime: settings.allDayReminderTime, timeFormat: settings.timeFormat })
  const used = new Set(value.filter((r) => !r.at).map((r) => r.minutes))
  const full = value.length >= MAX_REMINDERS

  const add = (fields) => {
    onChange([...value, newReminder(fields)])
    setCustom(null)
  }

  function pick(e) {
    const choice = e.target.value
    e.target.value = ''
    if (choice === 'custom') {
      const at = `${dueDate ?? toDateKey()}T${startTime ?? settings.allDayReminderTime}`
      setCustom({ mode: dueDate ? 'before' : 'at', amount: 2, unit: 'hours', at })
    } else if (choice !== '') add({ minutes: Number(choice) })
  }

  function addCustom() {
    if (custom.mode === 'at') {
      if (custom.at) add({ at: custom.at })
      return
    }
    const factor = UNITS.find(([u]) => u === custom.unit)[1]
    const minutes = Math.round(Number(custom.amount) * factor)
    if (minutes >= 0 && !used.has(minutes)) add({ minutes })
    else setCustom(null)
  }

  const permission = notificationPermission()

  return (
    <div className="reminder-picker">
      {value.length > 0 && (
        <ul className="reminder-list">
          {value.map((r) => (
            <li key={r.id} className={!r.at && !dueDate ? 'chip reminder-chip inactive' : 'chip reminder-chip'}>
              {label(r)}
              <button
                type="button"
                className="chip-remove"
                onClick={() => onChange(value.filter((x) => x.id !== r.id))}
                aria-label={`Remove reminder: ${label(r)}`}
              >
                <XIcon width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {custom ? (
        <div className="reminder-custom">
          <div className="segmented" role="radiogroup" aria-label="Custom reminder type">
            {[
              ['before', 'Before the task'],
              ['at', 'On a date'],
            ].map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={custom.mode === mode}
                className={custom.mode === mode ? 'segment active' : 'segment'}
                disabled={mode === 'before' && !dueDate}
                onClick={() => setCustom({ ...custom, mode })}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="reminder-custom-row">
            {custom.mode === 'before' ? (
              <>
                <input
                  type="number"
                  className="input input-num"
                  min="0"
                  max="999"
                  value={custom.amount}
                  onChange={(e) => setCustom({ ...custom, amount: e.target.value })}
                  aria-label="How long before"
                />
                <select
                  className="input input-sm"
                  value={custom.unit}
                  onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
                  aria-label="Unit"
                >
                  {UNITS.map(([unit]) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <span>before</span>
              </>
            ) : (
              <input
                type="datetime-local"
                className="input"
                value={custom.at}
                onChange={(e) => setCustom({ ...custom, at: e.target.value })}
                aria-label="Remind me at"
              />
            )}
            <button type="button" className="btn primary sm" onClick={addCustom}>
              Add
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setCustom(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !full && (
          <select id="task-reminder" className="input reminder-add" defaultValue="" onChange={pick} aria-label="Add a reminder">
            <option value="">{value.length ? 'Add another reminder…' : 'Add a reminder…'}</option>
            {dueDate &&
              REMINDER_PRESETS.filter((m) => !used.has(m)).map((m) => (
                <option key={m} value={m}>
                  {label({ minutes: m })}
                </option>
              ))}
            <option value="custom">Custom…</option>
          </select>
        )
      )}

      {!dueDate && (
        <p className="field-hint">
          {value.some((r) => !r.at)
            ? 'Reminders before the task start working once it has a date.'
            : 'Set a date for reminders before the task, or choose Custom for a fixed date and time.'}
        </p>
      )}
      {dueDate && !startTime && value.length > 0 && (
        <p className="field-hint">
          This task has no time, so reminders count from {clockLabel(settings.allDayReminderTime, settings.timeFormat)}{' '}
          on the day. You can change that in Settings.
        </p>
      )}
      {value.length > 0 && !settings.remindersEnabled && (
        <p className="field-hint">Reminders are turned off in Settings.</p>
      )}
      {value.length > 0 && settings.remindersEnabled && permission !== 'granted' && (
        <p className="field-hint">
          Notifications aren’t on, so these will pop up inside ImpactMe while it’s open. Turn on notifications in
          Settings to get them on your device.
        </p>
      )}
    </div>
  )
}
