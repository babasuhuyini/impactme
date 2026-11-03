import { CalendarIcon, CheckIcon, FlagIcon, NoteIcon, TrashIcon } from '../icons.jsx'
import { formatRelative } from '../../lib/dates.js'
import { dueStatus, formatDue, getPriority, isDone } from '../../lib/todos.js'

export default function TodoItem({ todo, onToggle, onEdit, onDelete, onTagClick }) {
  const done = isDone(todo)
  const status = dueStatus(todo.dueDate)
  const priority = getPriority(todo.priority)
  // Only animate the check for a task completed a moment ago, not on every render of the list.
  const justDone = done && todo.completedAt && Date.now() - todo.completedAt < 1500
  const className = ['todo', done && 'done', justDone && 'just-done'].filter(Boolean).join(' ')

  const showDue = !done && todo.dueDate
  const showPriority = !done && todo.priority !== 'normal'
  const showCompleted = done && todo.completedAt
  const hasMeta = showDue || showPriority || showCompleted || todo.description || todo.tags.length > 0

  return (
    <li className={className} data-priority={done ? 'normal' : todo.priority}>
      <label className="check" title={done ? 'Mark as not done' : 'Mark as done'}>
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          aria-label={`${done ? 'Reopen' : 'Complete'} "${todo.title}"`}
        />
        <span className="checkmark">
          <CheckIcon width={12} height={12} strokeWidth={3} />
        </span>
      </label>

      <div
        className="todo-body"
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => e.key === 'Enter' && onEdit()}
        title="Edit task"
      >
        <span className="todo-text">{todo.title}</span>
        {hasMeta && (
          <div className="todo-meta">
            {showPriority && (
              <span className="priority-badge">
                <FlagIcon width={13} height={13} />
                {priority.label}
              </span>
            )}
            {showDue && (
              <span className={`due-badge ${status}`}>
                <CalendarIcon width={13} height={13} />
                {status === 'overdue' ? `Overdue · ${formatDue(todo.dueDate)}` : formatDue(todo.dueDate)}
              </span>
            )}
            {showCompleted && <span>Completed {formatRelative(todo.completedAt)}</span>}
            {todo.description && (
              <span className="notes-hint" title={todo.description}>
                <NoteIcon width={13} height={13} />
                Notes
              </span>
            )}
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

      <button className="icon-btn" onClick={onDelete} aria-label={`Delete "${todo.title}"`} title="Delete">
        <TrashIcon width={16} height={16} />
      </button>
    </li>
  )
}
