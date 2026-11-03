import { useState } from 'react'
import { CheckIcon, PlusIcon, XIcon } from '../icons.jsx'
import { newId } from '../../data/models.js'

export default function SubtaskEditor({ value, onChange }) {
  const [text, setText] = useState('')
  const done = value.filter((s) => s.done).length

  function add() {
    if (!text.trim()) return
    onChange([...value, { id: newId(), title: text.trim(), done: false }])
    setText('')
  }

  const patch = (id, changes) => onChange(value.map((s) => (s.id === id ? { ...s, ...changes } : s)))

  return (
    <div className="subtasks">
      {value.length > 0 && (
        <p className="field-hint">
          {done} of {value.length} done
        </p>
      )}
      <ul className="subtask-list">
        {value.map((s) => (
          <li key={s.id} className={s.done ? 'subtask done' : 'subtask'}>
            <button
              type="button"
              className="subtask-check"
              aria-pressed={s.done}
              aria-label={`${s.done ? 'Reopen' : 'Complete'} "${s.title}"`}
              onClick={() => patch(s.id, { done: !s.done })}
            >
              <CheckIcon width={11} height={11} strokeWidth={3} />
            </button>
            <input
              className="bare"
              value={s.title}
              onChange={(e) => patch(s.id, { title: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && onChange(value.filter((x) => x.id !== s.id))}
              aria-label="Subtask"
            />
            <button
              type="button"
              className="icon-btn sm"
              aria-label={`Remove "${s.title}"`}
              onClick={() => onChange(value.filter((x) => x.id !== s.id))}
            >
              <XIcon width={14} height={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="subtask-add">
        <PlusIcon width={15} height={15} />
        <input
          className="bare"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder="Add a subtask"
          aria-label="New subtask"
        />
      </div>
    </div>
  )
}
