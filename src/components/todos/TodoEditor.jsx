import { useState } from 'react'
import DuePicker from './DuePicker.jsx'
import PriorityPicker from './PriorityPicker.jsx'
import TagInput from '../TagInput.jsx'
import { TrashIcon } from '../icons.jsx'

export default function TodoEditor({ todo, knownTags, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(todo)
  const update = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))
  const canSave = Boolean(form.title.trim())

  function submit(e) {
    e.preventDefault()
    if (canSave) onSave({ ...form, title: form.title.trim(), description: form.description.trim() })
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onCancel()
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e)
  }

  return (
    <li className="todo-editor-item">
      <form className="todo-editor" onSubmit={submit} onKeyDown={handleKeyDown}>
        <input
          className="bare editor-title"
          value={form.title}
          onChange={(e) => update('title')(e.target.value)}
          placeholder="Task name"
          aria-label="Task name"
          autoFocus
        />
        <textarea
          className="bare editor-notes"
          value={form.description}
          onChange={(e) => update('description')(e.target.value)}
          placeholder="Add notes…"
          aria-label="Notes"
          rows={2}
        />
        <div className="editor-options">
          <DuePicker value={form.dueDate} onChange={update('dueDate')} />
          <PriorityPicker value={form.priority} onChange={update('priority')} />
          <TagInput value={form.tags} onChange={update('tags')} suggestions={knownTags} />
        </div>
        <footer className="editor-foot">
          <button type="button" className="btn ghost danger-text" onClick={onDelete}>
            <TrashIcon width={15} height={15} />
            Delete
          </button>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!canSave}>
              Save
            </button>
          </div>
        </footer>
      </form>
    </li>
  )
}
