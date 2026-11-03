import { FlagIcon, GripIcon } from '../icons.jsx'
import { getPriority } from '../../lib/todos.js'

// Open tasks without a date. Drag one onto the calendar to schedule it.
export default function UnscheduledPanel({ tasks, drag }) {
  return (
    <aside className="unscheduled" aria-labelledby="unscheduled-heading">
      <h2 id="unscheduled-heading" className="panel-title">
        Unscheduled <span className="tab-count">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="panel-note">Every open task has a date.</p>
      ) : (
        <>
          <p className="panel-note">Drag a task onto the calendar to schedule it, or open it to pick a date.</p>
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
