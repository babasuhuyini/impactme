import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  GripIcon,
  NoteIcon,
  RepeatIcon,
  SubtasksIcon,
  TrashIcon,
} from '../icons.jsx'
import { formatRelative } from '../../lib/dates.js'
import { describeRule } from '../../lib/recurrence.js'
import { formatTimeRange } from '../../lib/format.js'
import { dueStatus, formatDue, getPriority, isDone } from '../../lib/todos.js'

export default function TodoItem({
  todo,
  project,
  onToggle,
  onOpen,
  onDelete,
  onTagClick,
  selecting = false,
  selected = false,
  onSelect,
  dragProps,
  onMove,
}) {
  const done = isDone(todo)
  const status = dueStatus(todo.dueDate)
  const priority = getPriority(todo.priority)
  // Only animate the check for a task completed a moment ago, not on every render of the list.
  const justDone = done && todo.completedAt && Date.now() - todo.completedAt < 1500
  const className = ['todo', done && 'done', justDone && 'just-done', selected && 'selected', dragProps && 'draggable']
    .filter(Boolean)
    .join(' ')
  const subtasksDone = todo.subtasks.filter((s) => s.done).length

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
        <div className="todo-meta">
          {!done && todo.dueDate && (
            <span className={`due-badge ${status}`}>
              <CalendarIcon width={13} height={13} />
              {status === 'overdue' ? `Overdue · ${formatDue(todo.dueDate)}` : formatDue(todo.dueDate)}
            </span>
          )}
          {!done && todo.startTime && (
            <span className="meta-item">
              <ClockIcon width={13} height={13} />
              {formatTimeRange(todo.startTime, todo.endTime)}
            </span>
          )}
          {todo.recurrence && !done && (
            <span className="meta-item" title={describeRule(todo.recurrence)}>
              <RepeatIcon width={13} height={13} />
              <span className="sr-only">{describeRule(todo.recurrence)}</span>
            </span>
          )}
          {!done && todo.priority !== 'normal' && (
            <span className="priority-badge">
              <FlagIcon width={13} height={13} />
              {priority.label}
            </span>
          )}
          {done && todo.completedAt && <span>Completed {formatRelative(todo.completedAt)}</span>}
          {project && (
            <span className="project-chip" data-color={project.color}>
              {project.name}
            </span>
          )}
          {todo.category && <span className="meta-item category">{todo.category}</span>}
          {todo.subtasks.length > 0 && (
            <span className="meta-item" title="Subtasks done">
              <SubtasksIcon width={13} height={13} />
              {subtasksDone}/{todo.subtasks.length}
            </span>
          )}
          {todo.description && (
            <span className="notes-hint" title={todo.description}>
              <NoteIcon width={13} height={13} />
              <span className="sr-only">Has notes</span>
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
      </div>

      {!selecting && (
        <button className="icon-btn" onClick={onDelete} aria-label={`Delete "${todo.title}"`} title="Delete">
          <TrashIcon width={16} height={16} />
        </button>
      )}
    </li>
  )
}
