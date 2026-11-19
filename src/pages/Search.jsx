// Search everything on this device: tasks, journal entries and projects.
// Nothing typed here leaves the device.

import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MoodFace from '../components/journal/MoodFace.jsx'
import { openTask } from '../components/tasks/editorStore.js'
import { ChevronIcon, ListIcon, SearchIcon } from '../components/icons.jsx'
import { useJournalEntries, useProjects, useTasks } from '../data/store.js'
import { formatTimeRange } from '../lib/format.js'
import { entryMatchesQuery, entrySnippet, entryTitle, formatDayHeading } from '../lib/journal.js'
import { formatDue, isBlock, isDone, matchesQuery } from '../lib/todos.js'

const LIMIT = 20

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const allTasks = useTasks()
  const entries = useJournalEntries()
  const projects = useProjects()
  const q = query.trim()

  const results = useMemo(() => {
    if (!q) return null
    const lower = q.toLowerCase()
    const tasks = allTasks
      .filter((t) => !isBlock(t) && matchesQuery(t, q))
      // Open tasks first, then by date.
      .sort((a, b) => isDone(a) - isDone(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    const journal = entries
      .filter((e) => entryMatchesQuery(e, q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    const matchedProjects = projects.filter((p) => p.name.toLowerCase().includes(lower))
    return { tasks, journal, projects: matchedProjects }
  }, [q, allTasks, entries, projects])

  const count = results ? results.tasks.length + results.journal.length + results.projects.length : 0
  const projectName = (id) => projects.find((p) => p.id === id)?.name

  return (
    <div className="page-scroll">
      <div className="search-page">
        <h1 className="page-title">Search</h1>
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label className="search-big">
            <SearchIcon width={18} height={18} />
            <span className="sr-only">Search tasks, journal and projects</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
              placeholder="Search tasks, journal and projects"
              autoFocus
              enterKeyHint="search"
            />
          </label>
        </form>

        {!results ? (
          <p className="search-hint">Search looks through your tasks, journal entries and projects on this device.</p>
        ) : count === 0 ? (
          <p className="search-hint" role="status">
            Nothing matches “{q}”.
          </p>
        ) : (
          <>
            <p className="sr-only" role="status">
              {count} {count === 1 ? 'result' : 'results'}
            </p>

            {results.tasks.length > 0 && (
              <section className="search-group" aria-labelledby="search-tasks">
                <h2 id="search-tasks" className="search-group-title">
                  Tasks <span>{results.tasks.length}</span>
                </h2>
                <ul className="list-card search-list">
                  {results.tasks.slice(0, LIMIT).map((task) => (
                    <li key={task.id}>
                      <button className="search-row" onClick={() => openTask(task.id)}>
                        <span className={isDone(task) ? 'search-check done' : 'search-check'} aria-hidden="true" />
                        <span className="search-row-body">
                          <span className="search-row-title">{task.title}</span>
                          <span className="search-row-meta">
                            {[
                              isDone(task) ? 'Completed' : task.dueDate && formatDue(task.dueDate),
                              task.startTime && formatTimeRange(task.startTime, task.endTime),
                              projectName(task.projectId),
                              task.tags.map((t) => `#${t}`).join(' '),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {results.tasks.length > LIMIT && (
                  <Link className="search-more" to={`/tasks/all?q=${encodeURIComponent(q)}`}>
                    See all {results.tasks.length} tasks
                  </Link>
                )}
              </section>
            )}

            {results.journal.length > 0 && (
              <section className="search-group" aria-labelledby="search-journal">
                <h2 id="search-journal" className="search-group-title">
                  Journal <span>{results.journal.length}</span>
                </h2>
                <ul className="list-card search-list">
                  {results.journal.slice(0, LIMIT).map((entry) => (
                    <li key={entry.id}>
                      <Link className="search-row" to={`/journal/${entry.id}`}>
                        {entry.mood ? (
                          <MoodFace mood={entry.mood} size={22} />
                        ) : (
                          <span className="search-dot" aria-hidden="true" />
                        )}
                        <span className="search-row-body">
                          <span className="search-row-title">{entryTitle(entry) || 'Untitled'}</span>
                          <span className="search-row-meta">
                            {formatDayHeading(entry.date)}
                            {entrySnippet(entry) ? ` · ${entrySnippet(entry, 90)}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {results.projects.length > 0 && (
              <section className="search-group" aria-labelledby="search-projects">
                <h2 id="search-projects" className="search-group-title">
                  Projects <span>{results.projects.length}</span>
                </h2>
                <ul className="list-card nav-rows">
                  {results.projects.map((p) => (
                    <li key={p.id}>
                      <Link to={`/tasks/project/${p.id}`} className="nav-row" data-color={p.color}>
                        <span className="nav-row-tile round" aria-hidden="true">
                          <ListIcon width={16} height={16} strokeWidth={2.2} />
                        </span>
                        <span className="nav-row-label">{p.name}</span>
                        <ChevronIcon width={14} height={14} className="nav-row-chevron" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
