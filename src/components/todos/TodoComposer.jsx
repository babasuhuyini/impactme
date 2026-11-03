import { useMemo, useRef, useState } from 'react'
import DuePicker from './DuePicker.jsx'
import PriorityPicker from './PriorityPicker.jsx'
import ParsedChips from '../tasks/ParsedChips.jsx'
import { PlusIcon } from '../icons.jsx'
import { parseQuickAdd } from '../../lib/parse.js'

const PLACEHOLDER = 'Add a task… try “Call Ama friday at 2pm #family”'

// `defaults` come from the view, e.g. Today's date or the open project.
export default function TodoComposer({ onAdd, defaults = {} }) {
  const [text, setText] = useState('')
  const [ignore, setIgnore] = useState([])
  const [picked, setPicked] = useState({})
  const [nudge, setNudge] = useState(false)
  const [needsText, setNeedsText] = useState(false)
  const inputRef = useRef(null)

  const parsed = useMemo(() => parseQuickAdd(text, { ignore }), [text, ignore])
  const dueDate = 'dueDate' in picked ? picked.dueDate : parsed.dueDate ?? defaults.dueDate ?? null
  const priority = picked.priority ?? parsed.priority ?? 'normal'

  // Options appear once there's something to attach them to.
  const showOptions = Boolean(text.trim() || picked.dueDate || picked.priority)

  // After picking a date or priority, return to the text so Enter adds the task.
  const pick = (field) => (value) => {
    setPicked((p) => ({ ...p, [field]: value }))
    inputRef.current?.focus()
  }

  function reset() {
    setText('')
    setIgnore([])
    setPicked({})
  }

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) {
      // Point at the empty field rather than silently ignoring the click.
      setNudge(true)
      setNeedsText(true)
      inputRef.current?.focus()
      return
    }
    const sameDay = dueDate === parsed.dueDate
    onAdd({
      ...defaults,
      title: parsed.title,
      tags: parsed.tags,
      dueDate,
      // A time or repeat read from the text only applies to the date it came with.
      startTime: sameDay ? parsed.startTime : null,
      endTime: sameDay ? parsed.endTime : null,
      recurrence: sameDay ? parsed.recurrence : null,
      priority,
    })
    reset()
    inputRef.current?.focus()
  }

  return (
    <form
      className={nudge ? 'todo-composer nudge' : 'todo-composer'}
      onSubmit={submit}
      onAnimationEnd={() => setNudge(false)}
      onKeyDown={(e) => e.key === 'Escape' && reset()}
    >
      <div className="composer-row">
        <PlusIcon className="composer-plus" strokeWidth={2.2} />
        <input
          ref={inputRef}
          className="bare"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setNeedsText(false)
            if (!e.target.value) setIgnore([])
          }}
          placeholder={needsText ? 'Type a task first, then press Enter' : PLACEHOLDER}
          aria-label="New task"
        />
        <button type="submit" className="btn primary">
          Add
        </button>
      </div>
      {showOptions && (
        <div className="composer-options">
          <ParsedChips parsed={parsed} onIgnore={(kind) => setIgnore((list) => [...list, kind])} />
          <DuePicker value={dueDate} onChange={pick('dueDate')} />
          <PriorityPicker value={priority} onChange={pick('priority')} />
        </div>
      )}
    </form>
  )
}
