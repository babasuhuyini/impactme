import { useEffect, useMemo, useRef, useState } from 'react'
import TagInput from '../TagInput.jsx'
import ReminderPicker from './ReminderPicker.jsx'
import RepeatPicker from './RepeatPicker.jsx'
import SubtaskEditor from './SubtaskEditor.jsx'
import { showToast } from '../Toast.jsx'
import { CopyIcon, TrashIcon, XIcon } from '../icons.jsx'
import { closeTaskEditor, useTaskEditor } from './editorStore.js'
import { tasks, useProjects, useSettings, useTasks } from '../../data/store.js'
import { addTask, completeTask, deleteTasks, duplicateTask, reopenTask } from '../../data/actions.js'
import { normalizeRule, presetOf, ruleFromPreset } from '../../lib/recurrence.js'
import { formatRelative, fromMinutes, toDateKey, toMinutes } from '../../lib/dates.js'
import { PRIORITIES } from '../../lib/todos.js'

const BLANK = {
  title: '',
  description: '',
  dueDate: null,
  startTime: null,
  endTime: null,
  priority: 'normal',
  projectId: null,
  category: '',
  tags: [],
  subtasks: [],
  recurrence: null,
  kind: 'task',
}

// What gets stored from the form (shared by Add and by saving as you type).
function toFields(form) {
  return {
    ...form,
    title: form.title.trim(),
    description: form.description.trim(),
    recurrence:
      form.recurrence && form.dueDate
        ? normalizeRule({ ...form.recurrence, start: form.recurrence.start ?? form.dueDate }, form.dueDate)
        : null,
  }
}

function problemWith(form) {
  if (!form.title.trim()) return 'Give the task a name.'
  if (form.startTime && form.endTime && form.endTime <= form.startTime) return 'The end time must be after the start time.'
  return ''
}

// Task details for every screen (UI upgrade). Desktop: a panel beside the
// page. Phones: a sheet with Cancel / Details / Done. An existing task saves
// as you type; closing after a change offers Undo.
export default function TaskEditorHost() {
  const target = useTaskEditor()
  const task = target?.id ? tasks.get(target.id) : null
  const open = Boolean(target && (task || target.draft))
  if (!open) return null
  return <TaskPanel key={target.key} task={task} draft={target.draft} />
}

function TaskPanel({ task, draft }) {
  const isNew = !task
  // The task as it was when the panel opened, for Undo and phone Cancel.
  const [original] = useState(task)
  const initial = useMemo(() => ({ ...BLANK, ...(task ?? draft) }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // 'delete' | 'discard'
  const [saved, setSaved] = useState(false)
  const projects = useProjects()
  const allTasks = useTasks()
  const { defaultReminder } = useSettings()
  const knownTags = useMemo(() => [...new Set(allTasks.flatMap((t) => t.tags))].sort(), [allTasks])
  const categories = useMemo(() => [...new Set(allTasks.map((t) => t.category).filter(Boolean))].sort(), [allTasks])
  const panel = useRef(null)
  const title = isNew ? 'New task' : 'Edit task'
  const kindLabel = form.kind === 'block' ? 'time block' : 'task'
  const changed = JSON.stringify(form) !== JSON.stringify(initial)

  // Save as you type (existing tasks), whenever the form is valid.
  useEffect(() => {
    if (isNew || !changed) return
    const problem = problemWith(form)
    if (problem) return
    tasks.update(original.id, toFields(form))
    setSaved(true)
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the panel so Esc and screen readers start here.
  useEffect(() => {
    if (!isNew) panel.current?.focus()
  }, [isNew])

  const set = (changes) => {
    setForm((f) => ({ ...f, ...changes }))
    setError('')
  }

  // Simple repeats follow the date (e.g. "every week" moves to the new weekday).
  function setDate(dueDate) {
    let recurrence = form.recurrence
    if (recurrence && dueDate) {
      const preset = presetOf(recurrence)
      recurrence = preset === 'custom' ? normalizeRule({ ...recurrence, start: dueDate }, dueDate) : ruleFromPreset(preset, dueDate)
    }
    set(dueDate ? { dueDate, recurrence } : { dueDate: null, startTime: null, endTime: null, recurrence: null })
  }

  function setStart(startTime) {
    if (!startTime) return set({ startTime: null, endTime: null })
    // Keep the same length when moving the start; default to an hour.
    const length = form.startTime && form.endTime ? toMinutes(form.endTime) - toMinutes(form.startTime) : 60
    set({ startTime, endTime: fromMinutes(toMinutes(startTime) + length) })
  }

  function setRepeat(recurrence) {
    set({ recurrence, dueDate: form.dueDate ?? (recurrence ? toDateKey() : null) })
  }

  function add(e) {
    e?.preventDefault()
    const problem = problemWith(form)
    if (problem) return setError(problem)
    addTask(toFields(form))
    showToast(form.kind === 'block' ? 'Time block added' : 'Task added')
    closeTaskEditor()
  }

  // Close, offering Undo when this visit changed the task.
  function done() {
    if (isNew) {
      if (changed) return setConfirm('discard')
      return closeTaskEditor()
    }
    const problem = problemWith(form)
    closeTaskEditor()
    if (problem) {
      showToast(`Not saved: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`, { tone: 'error' })
    }
    if (saved) showToast('Changes saved', { undo: () => tasks.put(original) })
  }

  // Phones: Cancel puts the task back as it was.
  function cancel() {
    if (isNew) return done()
    if (saved) tasks.put(original)
    closeTaskEditor()
  }

  function run(action, message) {
    const undo = action()
    closeTaskEditor()
    showToast(message, typeof undo === 'function' ? { undo } : undefined)
  }

  // A new task's reminders stay unset until you change them, so it gets the
  // default reminder from Settings once it has a time (addTask applies it).
  const reminders =
    form.reminders ?? (form.startTime && defaultReminder != null ? [{ id: 'default', minutes: defaultReminder }] : [])
  const subtasksDone = form.subtasks.filter((s) => s.done).length
  const problem = changed ? problemWith(form) : ''

  return (
    <>
      <div className="task-panel-scrim" onClick={cancel} aria-hidden="true" />
      <aside
        ref={panel}
        className="task-panel"
        role="dialog"
        aria-modal="false"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            done()
          }
          if (isNew && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(e)
        }}
      >
        <form className="task-form" onSubmit={isNew ? add : (e) => e.preventDefault()} noValidate>
          {/* Phones: Cancel / Details / Done */}
          <div className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            <div className="sheet-bar">
              <button type="button" className="sheet-btn" onClick={cancel}>
                Cancel
              </button>
              <h2 className="sheet-title">{isNew ? 'New task' : 'Details'}</h2>
              {isNew ? (
                <button type="submit" className="sheet-btn strong">
                  Add
                </button>
              ) : (
                <button type="button" className="sheet-btn strong" onClick={done}>
                  Done
                </button>
              )}
            </div>
          </div>

          <div className="panel-head">
            <div className="segmented kind-toggle" role="radiogroup" aria-label="Type">
              {[
                ['task', 'Task'],
                ['block', 'Time block'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === value}
                  className={form.kind === value ? 'segment active' : 'segment'}
                  onClick={() => set({ kind: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="icon-btn panel-close" onClick={done} aria-label="Close" title="Close (Esc)">
              <XIcon width={18} height={18} />
            </button>
          </div>

          <div className="panel-body">
            <div className="panel-card">
              <div className="panel-title-row">
                {task && task.kind === 'task' && (
                  <input
                    type="checkbox"
                    className="rc"
                    checked={task.status === 'done'}
                    onChange={() =>
                      task.status === 'done'
                        ? run(() => reopenTask(task), 'Reopened')
                        : run(() => completeTask(task), 'Completed')
                    }
                    aria-label={task.status === 'done' ? 'Reopen task' : 'Complete task'}
                  />
                )}
                <input
                  className="bare task-form-title"
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder={form.kind === 'block' ? 'What is this time for?' : 'Task name'}
                  aria-label="Name"
                  autoFocus={isNew}
                  aria-invalid={Boolean(error || problem) && !form.title.trim()}
                />
              </div>
              <textarea
                className="bare task-form-notes"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Add notes"
                aria-label="Notes"
                rows={2}
              />
            </div>

            <div className="panel-card task-fields">
              <div className="field-row">
                <label htmlFor="task-date" className="field-row-label">
                  Date
                </label>
                <div className="field-row-control">
                  {form.dueDate && (
                    <input
                      id="task-date"
                      type="date"
                      className="input"
                      value={form.dueDate}
                      onChange={(e) => setDate(e.target.value || null)}
                    />
                  )}
                  <input
                    type="checkbox"
                    className="switch"
                    checked={Boolean(form.dueDate)}
                    onChange={(e) => setDate(e.target.checked ? toDateKey() : null)}
                    aria-label="Add a date"
                  />
                </div>
              </div>

              <div className="field-row">
                <span className="field-row-label" id="task-time-label">
                  Time
                </span>
                <div className="field-row-control">
                  {form.startTime && (
                    <div className="time-range" role="group" aria-labelledby="task-time-label">
                      <input
                        type="time"
                        className="input"
                        value={form.startTime}
                        onChange={(e) => setStart(e.target.value || null)}
                        aria-label="Start time"
                      />
                      <span>to</span>
                      <input
                        type="time"
                        className="input"
                        value={form.endTime ?? ''}
                        onChange={(e) => set({ endTime: e.target.value || null })}
                        aria-label="End time"
                      />
                    </div>
                  )}
                  <input
                    type="checkbox"
                    className="switch"
                    checked={Boolean(form.startTime)}
                    disabled={!form.dueDate}
                    onChange={(e) => setStart(e.target.checked ? '09:00' : null)}
                    aria-label="Add a time"
                    title={form.dueDate ? undefined : 'Add a date first'}
                  />
                </div>
              </div>

              <div className="field-row wide">
                <label htmlFor="repeat-preset" className="field-row-label">
                  Repeat
                </label>
                <div className="field-row-control">
                  <RepeatPicker value={form.recurrence} dueDate={form.dueDate} onChange={setRepeat} />
                </div>
              </div>

              <div className="field-row wide">
                <label htmlFor="task-reminder" className="field-row-label">
                  Reminders
                </label>
                <div className="field-row-control">
                  <ReminderPicker
                    value={reminders}
                    dueDate={form.dueDate}
                    startTime={form.startTime}
                    onChange={(list) => set({ reminders: list })}
                  />
                </div>
              </div>
            </div>

            <div className="panel-card task-fields">
              {form.kind === 'task' && (
                <div className="field-row">
                  <span className="field-row-label" id="task-priority-label">
                    Priority
                  </span>
                  <div className="field-row-control">
                    <div className="segmented priority-seg" role="radiogroup" aria-labelledby="task-priority-label">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          role="radio"
                          aria-checked={form.priority === p.value}
                          data-priority={p.value}
                          className={form.priority === p.value ? 'segment priority-segment active' : 'segment priority-segment'}
                          onClick={() => set({ priority: p.value })}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="field-row">
                <label htmlFor="task-project" className="field-row-label">
                  Project
                </label>
                <div className="field-row-control">
                  <select
                    id="task-project"
                    className="input select-btn"
                    value={form.projectId ?? ''}
                    onChange={(e) => set({ projectId: e.target.value || null })}
                  >
                    <option value="">No project (Inbox)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="task-category" className="field-row-label">
                  Category
                </label>
                <div className="field-row-control">
                  <input
                    id="task-category"
                    className="input"
                    list="task-categories"
                    value={form.category}
                    onChange={(e) => set({ category: e.target.value })}
                    placeholder="None"
                    maxLength={40}
                  />
                  <datalist id="task-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="field-row wide">
                <span className="field-row-label">Tags</span>
                <div className="field-row-control">
                  <TagInput value={form.tags} onChange={(tags) => set({ tags })} suggestions={knownTags} />
                </div>
              </div>
            </div>

            {form.kind === 'task' && (
              <section className="panel-subtasks" aria-labelledby="subtasks-heading">
                <div className="subtasks-head">
                  <h3 id="subtasks-heading">Subtasks</h3>
                  {form.subtasks.length > 0 && (
                    <>
                      <span className="subtasks-count">
                        {subtasksDone} of {form.subtasks.length}
                      </span>
                      <span className="subtasks-bar" aria-hidden="true">
                        <span style={{ width: `${(subtasksDone / form.subtasks.length) * 100}%` }} />
                      </span>
                    </>
                  )}
                </div>
                <div className="panel-card">
                  <SubtaskEditor value={form.subtasks} onChange={(subtasks) => set({ subtasks })} />
                </div>
              </section>
            )}

            {(error || problem) && (
              <p className="field-error" role="alert">
                {error || `${problem} Not saved yet.`}
              </p>
            )}
            {task && (
              <p className="task-form-meta">
                Created {task.createdAt ? formatRelative(task.createdAt) : 'in Daybook'} · Edited{' '}
                {formatRelative(task.updatedAt)}
                {task.recurrence && ' · Changes apply to every upcoming occurrence'}
              </p>
            )}
          </div>

          <footer className="panel-foot">
            {confirm === 'delete' ? (
              <div className="confirm-bar" role="alert">
                <span>
                  {task.recurrence
                    ? 'Delete this repeating task? Upcoming occurrences go too; completed ones stay in your history.'
                    : `Delete this ${kindLabel}?`}
                </span>
                <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button type="button" className="btn danger" onClick={() => run(() => deleteTasks(task.id), 'Deleted')}>
                  Delete
                </button>
              </div>
            ) : confirm === 'discard' ? (
              <div className="confirm-bar" role="alert">
                <span>Discard this new {kindLabel}?</span>
                <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                  Keep editing
                </button>
                <button type="button" className="btn danger" onClick={closeTaskEditor}>
                  Discard
                </button>
              </div>
            ) : isNew ? (
              <div className="actions">
                <button type="button" className="btn ghost" onClick={done}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  Add {kindLabel}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="icon-btn danger-icon"
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => setConfirm('delete')}
                >
                  <TrashIcon width={17} height={17} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Duplicate"
                  aria-label="Duplicate"
                  onClick={() =>
                    run(() => {
                      const copy = duplicateTask(task)
                      return () => tasks.remove(copy.id)
                    }, 'Duplicated')
                  }
                >
                  <CopyIcon width={17} height={17} />
                </button>
                <span className="panel-status" role="status">
                  {problem ? 'Not saved' : saved ? 'Saved' : ''}
                </span>
              </>
            )}
          </footer>
        </form>
      </aside>
    </>
  )
}
