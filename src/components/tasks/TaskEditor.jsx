import { useEffect, useMemo, useRef, useState } from 'react'
import Dialog from '../Dialog.jsx'
import TagInput from '../TagInput.jsx'
import ReminderPicker from './ReminderPicker.jsx'
import RepeatPicker from './RepeatPicker.jsx'
import SubtaskEditor from './SubtaskEditor.jsx'
import { showToast } from '../Toast.jsx'
import { CheckIcon, CopyIcon, TrashIcon } from '../icons.jsx'
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

// One editor for every screen: the task list, the dashboard and the calendar.
export default function TaskEditorHost() {
  const target = useTaskEditor()
  const task = target?.id ? tasks.get(target.id) : null
  const open = Boolean(target && (task || target.draft))
  const isNew = !task
  // The form can veto closing (Esc or a click outside) to ask about unsaved changes.
  const guard = useRef(null)
  const requestClose = () => guard.current?.() !== false && closeTaskEditor()

  return (
    <Dialog open={open} onClose={requestClose} title={isNew ? 'New task' : 'Edit task'} size="lg">
      {open && <TaskForm key={target.key} task={task} draft={target.draft} guard={guard} />}
    </Dialog>
  )
}

function TaskForm({ task, draft, guard }) {
  const initial = useMemo(() => ({ ...BLANK, ...(task ?? draft) }), [task, draft])
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // 'delete' | 'discard'
  const projects = useProjects()
  const allTasks = useTasks()
  const { defaultReminder } = useSettings()
  const knownTags = useMemo(() => [...new Set(allTasks.flatMap((t) => t.tags))].sort(), [allTasks])
  const categories = useMemo(() => [...new Set(allTasks.map((t) => t.category).filter(Boolean))].sort(), [allTasks])

  const isNew = !task
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useEffect(() => {
    guard.current = () => {
      if (!dirty) return true
      setConfirm('discard')
      return false
    }
    return () => (guard.current = null)
  }, [dirty, guard])

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

  function save(e) {
    e?.preventDefault()
    if (!form.title.trim()) return setError('Give the task a name.')
    if (form.startTime && form.endTime && form.endTime <= form.startTime) return setError('The end time must be after the start time.')
    const fields = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      recurrence: form.recurrence && form.dueDate ? normalizeRule({ ...form.recurrence, start: form.recurrence.start ?? form.dueDate }, form.dueDate) : null,
    }
    if (isNew) {
      addTask(fields)
      showToast(form.kind === 'block' ? 'Time block added' : 'Task added')
    } else {
      tasks.update(task.id, fields)
    }
    closeTaskEditor()
  }

  function run(action, message) {
    const undo = action()
    closeTaskEditor()
    showToast(message, typeof undo === 'function' ? { undo } : undefined)
  }

  const kindLabel = form.kind === 'block' ? 'time block' : 'task'
  // A new task's reminders stay unset until you change them, so it gets the
  // default reminder from Settings once it has a time (addTask applies it).
  const reminders =
    form.reminders ?? (form.startTime && defaultReminder != null ? [{ id: 'default', minutes: defaultReminder }] : [])

  return (
    <form
      className="task-form"
      onSubmit={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && save(e)}
      noValidate
    >
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

      <input
        className="bare task-form-title"
        value={form.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder={form.kind === 'block' ? 'What is this time for?' : 'Task name'}
        aria-label="Name"
        autoFocus={isNew}
        aria-invalid={Boolean(error) && !form.title.trim()}
      />
      <textarea
        className="bare task-form-notes"
        value={form.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Notes"
        aria-label="Notes"
        rows={2}
      />

      <div className="task-fields">
        <div className="field">
          <label htmlFor="task-date">Date</label>
          <input
            id="task-date"
            type="date"
            className="input"
            value={form.dueDate ?? ''}
            onChange={(e) => setDate(e.target.value || null)}
          />
        </div>
        <div className="field">
          <span className="field-label" id="task-time-label">
            Time
          </span>
          <div className="time-range" role="group" aria-labelledby="task-time-label">
            <input
              type="time"
              className="input"
              value={form.startTime ?? ''}
              onChange={(e) => setStart(e.target.value || null)}
              disabled={!form.dueDate}
              aria-label="Start time"
            />
            <span>to</span>
            <input
              type="time"
              className="input"
              value={form.endTime ?? ''}
              onChange={(e) => set({ endTime: e.target.value || null })}
              disabled={!form.startTime}
              aria-label="End time"
            />
          </div>
          {!form.dueDate && <p className="field-hint">Pick a date to add a time.</p>}
        </div>

        <div className="field field-wide">
          <label htmlFor="repeat-preset">Repeat</label>
          <RepeatPicker value={form.recurrence} dueDate={form.dueDate} onChange={setRepeat} />
        </div>

        <div className="field field-wide">
          <label htmlFor="task-reminder">Reminders</label>
          <ReminderPicker
            value={reminders}
            dueDate={form.dueDate}
            startTime={form.startTime}
            onChange={(list) => set({ reminders: list })}
          />
        </div>

        {form.kind === 'task' && (
          <div className="field field-wide">
            <span className="field-label" id="task-priority-label">
              Priority
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="task-priority-label">
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
        )}

        <div className="field">
          <label htmlFor="task-project">Project</label>
          <select
            id="task-project"
            className="input"
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
        <div className="field">
          <label htmlFor="task-category">Category</label>
          <input
            id="task-category"
            className="input"
            list="task-categories"
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
            placeholder="e.g. Work, Health"
            maxLength={40}
          />
          <datalist id="task-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="field field-wide">
          <span className="field-label">Tags</span>
          <TagInput value={form.tags} onChange={(tags) => set({ tags })} suggestions={knownTags} />
        </div>

        {form.kind === 'task' && (
          <div className="field field-wide">
            <span className="field-label">Subtasks</span>
            <SubtaskEditor value={form.subtasks} onChange={(subtasks) => set({ subtasks })} />
          </div>
        )}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {task && (
        <p className="task-form-meta">
          Created {task.createdAt ? formatRelative(task.createdAt) : 'in Daybook'} · Edited {formatRelative(task.updatedAt)}
          {task.recurrence && ' · Changes apply to every upcoming occurrence'}
        </p>
      )}

      <footer className="dialog-foot task-form-foot">
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
            <span>Discard your changes?</span>
            <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
              Keep editing
            </button>
            <button type="button" className="btn danger" onClick={closeTaskEditor}>
              Discard
            </button>
          </div>
        ) : (
          <>
            {task && (
              <div className="task-form-tools">
                <button type="button" className="icon-btn" title="Delete" aria-label="Delete" onClick={() => setConfirm('delete')}>
                  <TrashIcon width={17} height={17} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Duplicate"
                  aria-label="Duplicate"
                  onClick={() => run(() => {
                    const copy = duplicateTask(task)
                    return () => tasks.remove(copy.id)
                  }, 'Duplicated')}
                >
                  <CopyIcon width={17} height={17} />
                </button>
                {task.kind === 'task' &&
                  (task.status === 'done' ? (
                    <button type="button" className="btn ghost sm" onClick={() => run(() => reopenTask(task), 'Reopened')}>
                      Reopen
                    </button>
                  ) : (
                    <button type="button" className="btn ghost sm" onClick={() => run(() => completeTask(task), 'Completed')}>
                      <CheckIcon width={15} height={15} strokeWidth={2.4} />
                      Complete
                    </button>
                  ))}
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => (dirty ? setConfirm('discard') : closeTaskEditor())}>
                Cancel
              </button>
              <button type="submit" className="btn primary">
                {isNew ? `Add ${kindLabel}` : 'Save'}
              </button>
            </div>
          </>
        )}
      </footer>
    </form>
  )
}
