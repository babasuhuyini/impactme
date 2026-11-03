import { useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import DuePicker from './todos/DuePicker.jsx'
import PriorityPicker from './todos/PriorityPicker.jsx'
import { showToast } from './Toast.jsx'
import { BookIcon } from './icons.jsx'
import { tasks } from '../data/store.js'
import { createTask } from '../data/models.js'
import { extractTags, formatDue } from '../lib/todos.js'

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
  const [dueDate, setDueDate] = useState(null)
  const [priority, setPriority] = useState('normal')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const andRefocus = (setter) => (value) => {
    setter(value)
    inputRef.current?.focus()
  }

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) {
      setError('Give the task a name first.')
      inputRef.current?.focus()
      return
    }
    const task = tasks.put(createTask({ ...extractTags(text), dueDate, priority }))
    showToast(task.dueDate ? `Task added for ${formatDue(task.dueDate).toLowerCase()}` : 'Task added', {
      undo: () => tasks.remove(task.id),
    })
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
        }}
        placeholder="What needs doing? Use #tags to organise"
        autoFocus
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'quick-add-error' : undefined}
      />
      {error && (
        <p id="quick-add-error" className="field-error">
          {error}
        </p>
      )}
      <div className="quick-add-options">
        <DuePicker value={dueDate} onChange={andRefocus(setDueDate)} />
        <PriorityPicker value={priority} onChange={andRefocus(setPriority)} />
      </div>
      <footer className="dialog-foot">
        <button type="button" className="btn ghost" onClick={onWriteJournal}>
          <BookIcon width={16} height={16} />
          Write in journal instead
        </button>
        <button type="submit" className="btn primary">
          Add task
        </button>
      </footer>
    </form>
  )
}
