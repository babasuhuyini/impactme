import { useMemo, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import DuePicker from './todos/DuePicker.jsx'
import PriorityPicker from './todos/PriorityPicker.jsx'
import ParsedChips from './tasks/ParsedChips.jsx'
import { newTaskDraft } from './tasks/editorStore.js'
import { showToast } from './Toast.jsx'
import { BookIcon } from './icons.jsx'
import { tasks, useProjects } from '../data/store.js'
import { addTask } from '../data/actions.js'
import { parseQuickAdd } from '../lib/parse.js'
import { fromMinutes, toDateKey, toMinutes } from '../lib/dates.js'
import { formatDue } from '../lib/todos.js'

// The app-wide "add a task in seconds" window (button, + on mobile, or Q).
export default function QuickAdd({ open, onClose, onWriteJournal }) {
  return (
    <Dialog open={open} onClose={onClose} title="Quick add" size="md">
      <QuickAddForm onDone={onClose} onWriteJournal={onWriteJournal} />
    </Dialog>
  )
}

function QuickAddForm({ onDone, onWriteJournal }) {
  const [text, setText] = useState('')
  const [ignore, setIgnore] = useState([])
  const [overrides, setOverrides] = useState({})
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const projects = useProjects()

  const parsed = useMemo(() => parseQuickAdd(text, { ignore }), [text, ignore])
  // What will be saved: what was read from the text, unless the user picked something.
  const fields = {
    title: parsed.title,
    tags: parsed.tags,
    recurrence: parsed.recurrence,
    dueDate: parsed.dueDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    priority: parsed.priority ?? 'normal',
    projectId: null,
    ...overrides,
  }

  const override = (changes) => {
    setOverrides((o) => ({ ...o, ...changes }))
    inputRef.current?.focus()
  }

  function ignoreKind(kind) {
    setIgnore((list) => [...list, kind])
    const cleared = { date: ['dueDate'], time: ['startTime', 'endTime'], priority: ['priority'], repeat: ['recurrence'] }[kind] ?? []
    setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !cleared.includes(k))))
  }

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) {
      setError('Give the task a name first.')
      inputRef.current?.focus()
      return
    }
    const task = addTask(fields)
    const when = task.dueDate ? ` for ${formatDue(task.dueDate).toLowerCase()}` : ''
    showToast(`Task added${when}`, { undo: () => tasks.remove(task.id) })
    onDone()
  }

  function moreOptions() {
    newTaskDraft(text.trim() ? fields : {})
    onDone()
  }

  return (
    <form className="quick-add" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="quick-add-title">
        Task name
      </label>
      <input
        id="quick-add-title"
        ref={inputRef}
        className="input quick-add-input"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError('')
          if (!e.target.value) setIgnore([])
        }}
        placeholder="e.g. Submit report tomorrow at 9am #work"
        autoFocus
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'quick-add-error' : 'quick-add-help'}
      />
      {error ? (
        <p id="quick-add-error" className="field-error">
          {error}
        </p>
      ) : (
        !text && (
          <p id="quick-add-help" className="field-hint">
            Type a date, time or repeat in plain words, such as “every weekday at 7pm”. You can check it before adding.
          </p>
        )
      )}
      <ParsedChips parsed={parsed} onIgnore={ignoreKind} />

      <div className="quick-add-options">
        <DuePicker value={fields.dueDate} onChange={(dueDate) => override(dueDate ? { dueDate } : { dueDate: null, startTime: null, endTime: null, recurrence: null })} />
        <div className="option-group quick-time" role="group" aria-label="Time">
          <input
            type="time"
            className="input input-time"
            value={fields.startTime ?? ''}
            onChange={(e) => {
              const startTime = e.target.value || null
              const length = fields.startTime && fields.endTime ? toMinutes(fields.endTime) - toMinutes(fields.startTime) : null
              override({
                startTime,
                endTime: startTime && length ? fromMinutes(toMinutes(startTime) + length) : null,
                dueDate: fields.dueDate ?? (startTime ? toDateKey() : null),
              })
            }}
            aria-label="Start time"
          />
          {fields.startTime && (
            <>
              <span className="field-hint">to</span>
              <input
                type="time"
                className="input input-time"
                value={fields.endTime ?? ''}
                min={fields.startTime}
                onChange={(e) => override({ endTime: e.target.value || null })}
                aria-label="End time"
              />
            </>
          )}
        </div>
        <PriorityPicker value={fields.priority} onChange={(priority) => override({ priority })} />
        {projects.length > 0 && (
          <select
            className="select-inline"
            value={fields.projectId ?? ''}
            onChange={(e) => override({ projectId: e.target.value || null })}
            aria-label="Project"
          >
            <option value="">Inbox</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <footer className="dialog-foot">
        <div className="quick-add-links">
          <button type="button" className="btn ghost" onClick={onWriteJournal}>
            <BookIcon width={16} height={16} />
            Journal instead
          </button>
          <button type="button" className="btn ghost" onClick={moreOptions}>
            More options
          </button>
        </div>
        <button type="submit" className="btn primary">
          Add task
        </button>
      </footer>
    </form>
  )
}
