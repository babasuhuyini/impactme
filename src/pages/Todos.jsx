import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TodoComposer from '../components/todos/TodoComposer.jsx'
import TodoItem from '../components/todos/TodoItem.jsx'
import TodoEditor from '../components/todos/TodoEditor.jsx'
import { showToast } from '../components/Toast.jsx'
import { ChecklistIcon, ChevronIcon, SearchIcon } from '../components/icons.jsx'
import { tasks, updateSettings, useSettings, useTasks } from '../data/store.js'
import { createTask } from '../data/models.js'
import { PRIORITIES, SORTS, VIEWS, isDone, matchesQuery } from '../lib/todos.js'

export default function Todos() {
  const { view: viewParam } = useParams()
  const navigate = useNavigate()
  const todos = useTasks()
  const { tasksSort: sort, tasksShowCompleted: showCompleted } = useSettings()
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('') // '' = any, else a priority value
  const [tagFilter, setTagFilter] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const view = VIEWS[viewParam] ? viewParam : 'all'
  const setView = (key) => navigate(key === 'all' ? '/tasks' : `/tasks/${key}`)

  const allTags = useMemo(() => [...new Set(todos.flatMap((t) => t.tags))].sort(), [todos])
  const active = todos.filter((t) => !isDone(t))
  const completed = todos.filter(isDone)
  const overdueCount = active.filter(VIEWS.overdue.test).length

  const matches = (t) =>
    VIEWS[view].test(t) &&
    (priorityFilter === '' || t.priority === priorityFilter) &&
    (!tagFilter || t.tags.includes(tagFilter)) &&
    matchesQuery(t, query)

  const visibleActive = active.filter(matches).sort(SORTS[sort].compare)
  const visibleDone = completed
    .filter(matches)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const narrowed = Boolean(priorityFilter !== '' || tagFilter || query.trim())

  function toggleTodo(todo) {
    if (isDone(todo)) {
      tasks.update(todo.id, { status: 'open', completedAt: null })
    } else {
      tasks.update(todo.id, { status: 'done', completedAt: Date.now() })
      showToast('Task completed', { undo: () => tasks.update(todo.id, { status: 'open', completedAt: null }) })
    }
  }

  function deleteTodo(id) {
    const removed = tasks.remove(id)
    setEditingId(null)
    showToast('Task deleted', { undo: () => removed.forEach(tasks.put) })
  }

  function clearCompleted() {
    const removed = tasks.remove(completed.map((t) => t.id))
    showToast(`Cleared ${removed.length} completed ${removed.length === 1 ? 'task' : 'tasks'}`, {
      undo: () => removed.forEach(tasks.put),
    })
  }

  function clearFilters() {
    setView('all')
    setQuery('')
    setPriorityFilter('')
    setTagFilter(null)
  }

  function renderTodo(todo) {
    return editingId === todo.id ? (
      <TodoEditor
        key={todo.id}
        todo={todo}
        knownTags={allTags}
        onSave={(updated) => {
          tasks.update(todo.id, updated)
          setEditingId(null)
        }}
        onCancel={() => setEditingId(null)}
        onDelete={() => deleteTodo(todo.id)}
      />
    ) : (
      <TodoItem
        key={todo.id}
        todo={todo}
        onToggle={() => toggleTodo(todo)}
        onEdit={() => setEditingId(todo.id)}
        onDelete={() => deleteTodo(todo.id)}
        onTagClick={setTagFilter}
      />
    )
  }

  const summary =
    todos.length === 0
      ? 'A clean slate.'
      : active.length === 0
        ? 'Everything done. Nice work.'
        : `${active.length} left to do` + (overdueCount ? ` · ${overdueCount} overdue` : '')
  const percent = todos.length ? Math.round((completed.length / todos.length) * 100) : 0

  return (
    <div className="page-scroll">
      <section className="page">
        <header className="page-head">
          <div>
            <h1 className="page-title">{view === 'all' ? 'My Tasks' : VIEWS[view].label}</h1>
            <p className="page-sub">{summary}</p>
          </div>
          {todos.length > 0 && (
            <div className="progress" title={`${percent}% complete`}>
              <span>
                {completed.length} of {todos.length} done
              </span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
        </header>

        <TodoComposer onAdd={(fields) => tasks.put(createTask(fields))} />

        {todos.length === 0 ? (
          <div className="todo-empty">
            <div className="empty-icon">
              <ChecklistIcon width={26} height={26} />
            </div>
            <h3>Nothing on your list</h3>
            <p>Type a task above and press Enter.</p>
          </div>
        ) : (
          <>
            <div className="view-tabs" role="tablist" aria-label="View">
              {Object.entries(VIEWS).map(([key, { label, test }]) => {
                const count = active.filter(test).length
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={view === key}
                    className={view === key ? 'view-tab active' : 'view-tab'}
                    onClick={() => setView(key)}
                  >
                    {label}
                    {count > 0 && (
                      <span className={key === 'overdue' ? 'tab-count alert' : 'tab-count'}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="list-toolbar">
              <label className="search-inline">
                <SearchIcon width={15} height={15} />
                <input
                  type="search"
                  className="bare"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks"
                  aria-label="Search tasks"
                />
              </label>
              <select
                className="select-inline"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                aria-label="Filter by priority"
              >
                <option value="">Any priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} priority
                  </option>
                ))}
              </select>
              <select
                className="select-inline"
                value={sort}
                onChange={(e) => updateSettings({ tasksSort: e.target.value })}
                aria-label="Sort tasks"
              >
                {Object.entries(SORTS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    Sort: {label}
                  </option>
                ))}
              </select>
            </div>

            {allTags.length > 0 && (
              <div className="todo-tags">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={tagFilter === tag ? 'chip active' : 'chip'}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                    aria-pressed={tagFilter === tag}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {(narrowed || view !== 'all') && (
              <p className="filter-status">
                Showing {visibleActive.length} of {active.length} open tasks
                <button className="link" onClick={clearFilters}>
                  Clear filters
                </button>
              </p>
            )}

            {visibleActive.length === 0 ? (
              <p className="empty-inline">
                {narrowed ? 'No tasks match these filters.' : VIEWS[view].empty}
              </p>
            ) : (
              <ul className="todo-list">{visibleActive.map(renderTodo)}</ul>
            )}

            {completed.length > 0 && (
              <div className="completed-section">
                <div className="completed-head">
                  <button
                    className="completed-toggle"
                    onClick={() => updateSettings({ tasksShowCompleted: !showCompleted })}
                    aria-expanded={showCompleted}
                  >
                    <ChevronIcon
                      width={14}
                      height={14}
                      className={showCompleted ? 'chevron open' : 'chevron'}
                    />
                    Completed
                    <span className="tab-count">{visibleDone.length}</span>
                  </button>
                  <button className="link" onClick={clearCompleted}>
                    Clear completed
                  </button>
                </div>
                {showCompleted &&
                  (visibleDone.length === 0 ? (
                    <p className="empty-inline">No completed tasks match.</p>
                  ) : (
                    <ul className="todo-list">{visibleDone.map(renderTodo)}</ul>
                  ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
