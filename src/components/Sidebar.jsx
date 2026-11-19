import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import ProjectDialog from './tasks/ProjectDialog.jsx'
import { useJournalEntries, useProjects, useTasks } from '../data/store.js'
import { BookIcon, BrandMark, CalendarIcon, HomeIcon, ListIcon, PlusIcon, SearchIcon, SlidersIcon } from './icons.jsx'
import { VIEWS, isOpenTask } from '../lib/todos.js'

const TASK_VIEWS = ['inbox', 'today', 'upcoming', 'overdue', 'completed']

const linkClass = (base) => ({ isActive }) => (isActive ? `${base} active` : base)

// Desktop navigation. On phones the bottom tab bar and the Tasks screen take over.
export default function Sidebar() {
  const navigate = useNavigate()
  const entries = useJournalEntries()
  const projects = useProjects()
  const openTasks = useTasks().filter(isOpenTask)
  const [creatingProject, setCreatingProject] = useState(false)

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="brand">
        <BrandMark size={28} className="brand-mark" />
        <span className="brand-name">ImpactMe</span>
      </div>

      {/* Search everything on this device (tasks, journal, projects). */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          const q = new FormData(e.currentTarget).get('q').trim()
          navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
          e.currentTarget.reset()
        }}
      >
        <label className="side-search">
          <SearchIcon width={15} height={15} />
          <span className="sr-only">Search</span>
          <input name="q" type="search" placeholder="Search" enterKeyHint="search" />
        </label>
      </form>

      <nav className="side-nav" aria-label="Main">
        <NavLink to="/" end className={linkClass('side-link')}>
          <HomeIcon width={18} height={18} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/tasks" end className={linkClass('side-link')}>
          <ListIcon width={18} height={18} />
          <span>Tasks</span>
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
          <SlidersIcon width={18} height={18} />
          <span>Settings</span>
        </NavLink>
      </div>

      <ProjectDialog
        open={creatingProject}
        onClose={() => setCreatingProject(false)}
        onCreated={(project) => {
          navigate(`/tasks/project/${project.id}`)
        }}
      />
    </aside>
  )
}
