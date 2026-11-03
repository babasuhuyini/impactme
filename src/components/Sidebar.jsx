import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import ProjectDialog from './tasks/ProjectDialog.jsx'
import useTheme from '../hooks/useTheme.js'
import { useJournalEntries, useProjects, useTasks } from '../data/store.js'
import {
  BookIcon,
  BrandMark,
  CalendarIcon,
  ChecklistIcon,
  GearIcon,
  HomeIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from './icons.jsx'
import { VIEWS, isOpenTask } from '../lib/todos.js'

const TASK_VIEWS = ['inbox', 'today', 'upcoming', 'overdue', 'completed']
const THEMES = [
  ['light', 'Light', SunIcon],
  ['dark', 'Dark', MoonIcon],
  ['system', 'System', MonitorIcon],
]

const linkClass = (base) => ({ isActive }) => (isActive ? `${base} active` : base)

export default function Sidebar({ onQuickAdd, onNavigate, inert }) {
  const navigate = useNavigate()
  const [, preference, setTheme] = useTheme()
  const entries = useJournalEntries()
  const projects = useProjects()
  const openTasks = useTasks().filter(isOpenTask)
  const [creatingProject, setCreatingProject] = useState(false)

  return (
    // Any link tap closes the phone drawer, even one to the page already open.
    <aside className="sidebar" aria-label="Sidebar" inert={inert} onClick={(e) => e.target.closest('a') && onNavigate()}>
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
          const count = key === 'completed' ? 0 : openTasks.filter(VIEWS[key].test).length
          return (
            <NavLink key={key} to={`/tasks/${key}`} className={linkClass('side-sublink')}>
              <span>{VIEWS[key].label}</span>
              <span className={key === 'overdue' && count ? 'side-count alert' : 'side-count'}>{count || ''}</span>
            </NavLink>
          )
        })}
        <NavLink to="/calendar" className={linkClass('side-link')}>
          <CalendarIcon width={18} height={18} />
          <span>Calendar</span>
        </NavLink>
        <NavLink to="/journal" className={linkClass('side-link')}>
          <BookIcon width={18} height={18} />
          <span>Journal</span>
          <span className="side-count">{entries.length || ''}</span>
        </NavLink>
      </nav>

      <section className="side-section" aria-labelledby="projects-heading">
        <div className="side-section-head">
          <h2 id="projects-heading">Projects</h2>
          <button
            className="icon-btn sm side-add"
            onClick={() => setCreatingProject(true)}
            aria-label="New project"
            title="New project"
          >
            <PlusIcon width={15} height={15} />
          </button>
        </div>
        {projects.length === 0 ? (
          <button className="side-empty" onClick={() => setCreatingProject(true)}>
            Group related tasks into a project
          </button>
        ) : (
          [...projects]
            .sort((a, b) => a.order - b.order)
            .map((p) => {
              const count = openTasks.filter((t) => t.projectId === p.id).length
              return (
                <NavLink key={p.id} to={`/tasks/project/${p.id}`} className={linkClass('side-sublink project-link')}>
                  <span className="project-dot" data-color={p.color} aria-hidden="true" />
                  <span className="project-name">{p.name}</span>
                  <span className="side-count">{count || ''}</span>
                </NavLink>
              )
            })
        )}
      </section>

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

      <ProjectDialog
        open={creatingProject}
        onClose={() => setCreatingProject(false)}
        onCreated={(project) => {
          onNavigate()
          navigate(`/tasks/project/${project.id}`)
        }}
      />
    </aside>
  )
}
