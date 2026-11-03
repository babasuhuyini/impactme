import { BellIcon, XIcon } from './icons.jsx'
import { showToast } from './Toast.jsx'
import { openTask } from './tasks/editorStore.js'
import { db } from '../data/db.js'
import { tasks } from '../data/store.js'
import { completeTask } from '../data/actions.js'
import { dismissInAppReminder, useInAppReminders } from '../reminders/inApp.js'
import { snoozeReminder } from '../reminders/handlers.js'
import { check } from '../reminders/scheduler.js'

// Reminders shown inside ImpactMe when system notifications are off or unavailable.
export default function ReminderTray() {
  const items = useInAppReminders()
  if (!items.length) return null

  function done(item) {
    dismissInAppReminder(item.taskId)
    const task = tasks.get(item.taskId)
    if (!task || task.status === 'done' || task.dueDate !== item.dueDate) return
    showToast('Completed', { undo: completeTask(task) })
  }

  async function snooze(item, minutes) {
    dismissInAppReminder(item.taskId)
    await snoozeReminder(db, item.taskId, minutes)
    check()
    showToast(`Snoozed for ${minutes} minutes`)
  }

  function open(item) {
    dismissInAppReminder(item.taskId)
    openTask(item.taskId)
  }

  return (
    <section className="reminder-tray" aria-label="Reminders">
      {items.map((item) => (
        <article key={item.taskId} className="reminder-card" role="alert">
          <span className="reminder-card-icon">
            <BellIcon width={16} height={16} />
          </span>
          <div className="reminder-card-text">
            <strong>{item.title}</strong>
            {item.body && <span>{item.body}</span>}
          </div>
          <button
            className="icon-btn reminder-card-close"
            onClick={() => dismissInAppReminder(item.taskId)}
            aria-label={`Dismiss reminder: ${item.title}`}
          >
            <XIcon width={15} height={15} />
          </button>
          <div className="reminder-card-actions">
            {item.kind === 'task' && (
              <button className="btn primary sm" onClick={() => done(item)}>
                Mark done
              </button>
            )}
            <button className="btn secondary sm" onClick={() => snooze(item, 10)}>
              Snooze 10 min
            </button>
            <button className="btn secondary sm" onClick={() => snooze(item, 30)}>
              Snooze 30 min
            </button>
            <button className="btn ghost sm" onClick={() => open(item)}>
              Open
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
