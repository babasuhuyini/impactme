import { NavLink } from 'react-router-dom'
import useTheme from '../hooks/useTheme.js'
import { useJournalEntries, useTasks } from '../data/store.js'
import {
  BookIcon,
  BrandMark,
  ChecklistIcon,
  GearIcon,
  HomeIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from './icons.jsx'
import { VIEWS, isDone } from '../lib/todos.js'

const TASK_VIEWS = ['today', 'upcoming', 'overdue', 'someday']
const THEMES = [
  ['light', 'Light', SunIcon],
  ['dark', 'Dark', MoonIcon],
  ['system', 'System', MonitorIcon],
]

const linkClass = (base) => ({ isActive }) => (isActive ? `${base} active` : base)

export default function Sidebar({ onQuickAdd, onNavigate }) {
  const [, preference, setTheme] = useTheme()
  const entries = useJournalEntries()
  const openTasks = useTasks().filter((t) => !isDone(t))

  return (
    // Any link tap closes the phone drawer, even one to the page already open.
    <aside className="sidebar" aria-label="Sidebar" onClick={(e) => e.target.closest('a') && onNavigate()}>
      <div className="brand">
        <BrandMark size={28} className="brand-mark" />
        <span className="brand-name">ImpactMe</span>
      </div>

      <button className="quick-add-btn" onClick={onQuickAdd}>
        <PlusIcon width={18} height={18} strokeWidth={2.4} />
        Quick add
        <kbd>Q</kbd>
      </button>

      <nav className="side-nav" aria-label="Main">
        <NavLink to="/" end className={linkClass('side-link')}>
          <HomeIcon width={18} height={18} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/tasks" end className={linkClass('side-link')}>
          <ChecklistIcon width={18} height={18} />
          <span>My Tasks</span>
          <span className="side-count">{openTasks.length || ''}</span>
        </NavLink>
        {TASK_VIEWS.map((key) => {
          const count = openTasks.filter(VIEWS[key].test).length
          return (
            <NavLink key={key} to={`/tasks/${key}`} className={linkClass('side-sublink')}>
              <span>{VIEWS[key].label}</span>
              <span className={key === 'overdue' && count ? 'side-count alert' : 'side-count'}>
                {count || ''}
              </span>
            </NavLink>
          )
        })}
        <NavLink to="/journal" className={linkClass('side-link')}>
          <BookIcon width={18} height={18} />
          <span>Journal</span>
          <span className="side-count">{entries.length || ''}</span>
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <NavLink to="/settings" className={linkClass('side-link')}>
          <GearIcon width={18} height={18} />
          <span>Settings</span>
        </NavLink>
        <div className="theme-toggle" role="radiogroup" aria-label="Theme">
          {THEMES.map(([value, label, Icon]) => (
            <button
              key={value}
              role="radio"
              aria-checked={preference === value}
              className={preference === value ? 'theme-option active' : 'theme-option'}
              onClick={() => setTheme(value)}
              title={value === 'system' ? 'Match my device' : `${label} theme`}
            >
              <Icon width={15} height={15} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
