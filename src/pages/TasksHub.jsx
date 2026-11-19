// Phones: the Tasks tab opens this hub (UI upgrade). The lists themselves
// are /tasks/<view>; on desktop the sidebar does this job.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProjectDialog from '../components/tasks/ProjectDialog.jsx'
import { CalendarIcon, CheckIcon, ChevronIcon, ClockIcon, FlagIcon, ListIcon, SearchIcon } from '../components/icons.jsx'
import { useProjects, useTasks } from '../data/store.js'
import { VIEWS, isOpenTask } from '../lib/todos.js'

const TILES = [
  ['today', CalendarIcon, '#0e8a6a'],
  ['upcoming', ClockIcon, '#3b74d1'],
  ['inbox', ListIcon, '#6b7a86'],
  ['overdue', FlagIcon, '#c93c31'],
  ['all', ListIcon, '#14201b'],
  ['completed', CheckIcon, '#8a9993'],
]

export default function TasksHub() {
  const navigate = useNavigate()
  const open = useTasks().filter(isOpenTask)
  const projects = [...useProjects()].sort((a, b) => a.order - b.order)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  return (
    <div className="page-scroll">
      <div className="hub">
        <h1 className="hub-title">Tasks</h1>

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) navigate(`/tasks/all?q=${encodeURIComponent(query.trim())}`)
          }}
        >
          <label className="hub-search">
            <SearchIcon width={17} height={17} />
            <span className="sr-only">Search tasks</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks"
              enterKeyHint="search"
            />
          </label>
        </form>

        <nav className="hub-tiles" aria-label="Task lists">
          {TILES.map(([key, Icon, color]) => {
            const count = key === 'completed' ? null : open.filter(VIEWS[key].test).length
            return (
              <Link key={key} to={`/tasks/${key}`} className="hub-tile">
                <span className="hub-tile-top">
                  <span className="hub-tile-icon" style={{ background: color }} aria-hidden="true">
                    <Icon width={18} height={18} strokeWidth={2.2} />
                  </span>
                  {count !== null && <span className="hub-tile-count">{count}</span>}
                </span>
                <span className="hub-tile-label">{key === 'all' ? 'All' : VIEWS[key].label}</span>
              </Link>
            )
          })}
        </nav>

        <section className="hub-projects" aria-labelledby="hub-projects-heading">
          <div className="section-head">
            <h2 id="hub-projects-heading" className="section-title">
              Projects
            </h2>
            <button className="section-link" onClick={() => setCreating(true)}>
              Add
            </button>
          </div>
          <div className="list-card">
            {projects.length === 0 ? (
              <button className="hub-empty" onClick={() => setCreating(true)}>
                Group related tasks into a project
              </button>
            ) : (
              <ul className="nav-rows">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/tasks/project/${p.id}`} className="nav-row" data-color={p.color}>
                      <span className="nav-row-tile round" aria-hidden="true">
                        <ListIcon width={16} height={16} strokeWidth={2.2} />
                      </span>
                      <span className="nav-row-label">{p.name}</span>
                      <span className="nav-row-value">{open.filter((t) => t.projectId === p.id).length || ''}</span>
                      <ChevronIcon width={14} height={14} className="nav-row-chevron" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(project) => navigate(`/tasks/project/${project.id}`)}
      />
    </div>
  )
}
