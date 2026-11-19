import { BellIcon, CheckIcon, FlagIcon, GripIcon, RepeatIcon, TrashIcon } from '../icons.jsx'
import { formatRelative } from '../../lib/dates.js'
import { describeRule } from '../../lib/recurrence.js'
import { formatTimeRange } from '../../lib/format.js'
import { dueStatus, formatDue, getPriority, isDone, reminderCount } from '../../lib/todos.js'

// One task in a list (UI upgrade): round checkbox, title, a quiet meta line,
// and priority / reminder / repeat icons on the right.
export default function TodoItem({
  todo,
  project,
  onToggle,
  onOpen,
  onDelete,
  onTagClick,
  selecting = false,
  selected = false,
  active = false,
  onSelect,
  dragProps,
  onMove,
}) {
  const done = isDone(todo)
  const status = dueStatus(todo.dueDate)
  const priority = getPriority(todo.priority)
  // Only animate the check for a task completed a moment ago, not on every render of the list.
  const justDone = done && todo.completedAt && Date.now() - todo.completedAt < 1500
  const className = [
    'todo',
    done && 'done',
    justDone && 'just-done',
    selected && 'selected',
    active && 'active',
    dragProps && 'draggable',
  ]
    .filter(Boolean)
    .join(' ')
  const subtasksDone = todo.subtasks.filter((s) => s.done).length
  const overdue = !done && status === 'overdue'

  const meta = []
  if (done && todo.completedAt) meta.push(`Completed ${formatRelative(todo.completedAt)}`)
  if (!done && todo.dueDate && status !== 'today') meta.push(formatDue(todo.dueDate))
  if (!done && todo.startTime) meta.push(formatTimeRange(todo.startTime, todo.endTime))
  if (project) {
    meta.push(
      <span className="project-chip" data-color={project.color}>
        <span className="project-chip-dot" aria-hidden="true" />
        {project.name}
      </span>
    )
  }
  if (todo.category) meta.push(<span className="category">{todo.category}</span>)
  if (todo.subtasks.length > 0) meta.push(`${subtasksDone} of ${todo.subtasks.length} subtasks`)

  return (
    <li className={className} data-priority={done ? 'normal' : todo.priority} {...dragProps}>
      {dragProps && (
        <span className="drag-handle" aria-hidden="true" title="Drag to reorder">
          <GripIcon width={14} height={14} />
        </span>
      )}
      {selecting ? (
        <label className="select-box" title={selected ? 'Deselect' : 'Select'}>
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select "${todo.title}"`} />
          <span className="select-mark">
            <CheckIcon width={12} height={12} strokeWidth={3} />
          </span>
        </label>
      ) : (
        <input
          type="checkbox"
          className="rc"
          checked={done}
          onChange={onToggle}
          aria-label={`${done ? 'Reopen' : 'Complete'} "${todo.title}"`}
          title={done ? 'Mark as not done' : 'Mark as done'}
        />
      )}

      <div
        className="todo-body"
        role="button"
        tabIndex={0}
        onClick={selecting ? onSelect : onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (selecting ? onSelect : onOpen)()
          // Alt + ↑/↓ moves the task in "My order".
          if (onMove && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            onMove(e.key === 'ArrowUp' ? -1 : 1)
          }
        }}
        title={selecting ? undefined : 'Open task'}
        aria-keyshortcuts={onMove ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      >
        <span className="todo-text">{todo.title}</span>
        {(meta.length > 0 || todo.tags.length > 0) && (
          <div className={overdue ? 'todo-meta overdue' : 'todo-meta'}>
            {meta.map((part, i) => (
              <span key={i} className="meta-part">
                {part}
              </span>
            ))}
            {todo.tags.map((tag) => (
              <button
                key={tag}
                className="tag-link"
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick(tag)
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="row-icons">
        {!done && todo.priority !== 'normal' && (
          <span className="row-flag" data-priority={todo.priority} title={`${priority.label} priority`}>
            <FlagIcon width={16} height={16} strokeWidth={2} />
            <span className="sr-only">{priority.label} priority</span>
          </span>
        )}
        {!done && todo.reminders.length > 0 && (
          <span className="row-icon" title={reminderCount(todo)}>
            <BellIcon width={14} height={14} strokeWidth={2} />
            <span className="sr-only">{reminderCount(todo)}</span>
          </span>
        )}
        {!done && todo.recurrence && (
          <span className="row-icon" title={describeRule(todo.recurrence)}>
            <RepeatIcon width={14} height={14} strokeWidth={2} />
            <span className="sr-only">{describeRule(todo.recurrence)}</span>
          </span>
        )}
        {!selecting && (
          <button className="icon-btn todo-delete" onClick={onDelete} aria-label={`Delete "${todo.title}"`} title="Delete">
            <TrashIcon width={16} height={16} />
          </button>
        )}
      </span>
    </li>
  )
}
