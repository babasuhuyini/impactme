import { FlagIcon, GripIcon, XIcon } from '../icons.jsx'
import { getPriority } from '../../lib/todos.js'

// Open tasks without a date. Drag one onto the calendar to schedule it.
export default function UnscheduledPanel({ tasks, drag, onClose }) {
  return (
    <aside className="unscheduled" aria-labelledby="unscheduled-heading">
      <div className="unscheduled-head">
        <h2 id="unscheduled-heading" className="panel-title">
          Unscheduled
        </h2>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close unscheduled tasks">
            <XIcon width={18} height={18} />
          </button>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="panel-note">Every open task has a date.</p>
      ) : (
        <>
          <p className="panel-note">Drag a task onto the calendar to give it a time, or open it to pick a date.</p>
          <ul className="unscheduled-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="unscheduled-item"
                  data-priority={task.priority}
                  onPointerDown={(e) => drag.start(e, { key: `u:${task.id}`, task, date: null, start: null, end: null })}
                  onKeyDown={(e) => e.key === 'Enter' && drag.open({ task })}
                >
                  <GripIcon width={13} height={13} aria-hidden="true" />
                  <span>{task.title}</span>
                  {task.priority !== 'normal' && (
                    <span className="priority-badge" title={`${getPriority(task.priority).label} priority`}>
                      <FlagIcon width={12} height={12} />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
