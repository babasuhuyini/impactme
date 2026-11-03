import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import TodoComposer from '../components/todos/TodoComposer.jsx'
import TodoItem from '../components/todos/TodoItem.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ProjectDialog from '../components/tasks/ProjectDialog.jsx'
import { openTask } from '../components/tasks/editorStore.js'
import { showToast } from '../components/Toast.jsx'
import { ChecklistIcon, ChevronIcon, PencilIcon, SearchIcon, SelectIcon, TrashIcon } from '../components/icons.jsx'
import { updateSettings, useProjects, useSettings, useTasks } from '../data/store.js'
import {
  addTask,
  completeTask,
  completeTasks,
  deleteProject,
  deleteTasks,
  moveTasks,
  placeTask,
  reopenTask,
} from '../data/actions.js'
import { toDateKey } from '../lib/dates.js'
import { PRIORITIES, SORTS, VIEWS, isBlock, isDone, matchesQuery } from '../lib/todos.js'

const TAB_ORDER = ['inbox', 'today', 'upcoming', 'overdue', 'all', 'completed']

export default function Todos() {
  const { view: viewParam, projectId } = useParams()
  const navigate = useNavigate()
  const allTasks = useTasks()
  const projects = useProjects()
  const { tasksSort: sort, tasksShowCompleted: showCompleted } = useSettings()
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [tagFilter, setTagFilter] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)
  const [editingProject, setEditingProject] = useState(false)
  const [dragId, setDragId] = useState(null)

  const project = projectId ? projects.find((p) => p.id === projectId) : null
  const view = project ? 'project' : VIEWS[viewParam] ? viewParam : 'all'
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const pool = useMemo(() => allTasks.filter((t) => !isBlock(t)), [allTasks])
  const allTags = useMemo(() => [...new Set(pool.flatMap((t) => t.tags))].sort(), [pool])

  if (projectId && !project) return <Navigate to="/tasks" replace />

  const inView = project ? (t) => t.projectId === project.id : VIEWS[view].test
  const narrowed = Boolean(priorityFilter || projectFilter || tagFilter || query.trim())
  const matches = (t) =>
    inView(t) &&
    (!priorityFilter || t.priority === priorityFilter) &&
    (!projectFilter || (projectFilter === 'none' ? !t.projectId : t.projectId === projectFilter)) &&
    (!tagFilter || t.tags.includes(tagFilter)) &&
    matchesQuery(t, query)

  const open = pool.filter((t) => !isDone(t))
  const done = pool.filter(isDone)
  const completedView = view === 'completed'
  const visibleOpen = completedView ? [] : open.filter(matches).sort(SORTS[sort].compare)
  const visibleDone = done.filter(matches).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const listed = completedView ? visibleDone : visibleOpen
  const canReorder = sort === 'manual' && !selecting && !narrowed && !completedView

  const title = project ? project.name : VIEWS[view].label
  const overdueCount = open.filter(VIEWS.overdue.test).length
  const summary = completedView
    ? `${done.length} completed`
    : visibleOpen.length === 0
      ? open.length
        ? 'Nothing here right now.'
        : 'A clean slate.'
      : `${visibleOpen.length} to do` + (view === 'all' && overdueCount ? ` · ${overdueCount} overdue` : '')

  // New tasks belong to the open project, or to today in the Today view.
  const defaults = project ? { projectId: project.id } : view === 'today' ? { dueDate: toDateKey() } : {}

  /* Actions -------------------------------------------------------------- */

  function toggle(task) {
    if (isDone(task)) {
      showToast('Task reopened', { undo: reopenTask(task) })
    } else {
      const undo = completeTask(task)
      showToast(task.recurrence ? 'Done. Next one scheduled' : 'Task completed', { undo })
    }
  }

  function askDelete(ids) {
    const count = ids.length
    setConfirm({
      title: count === 1 ? 'Delete task?' : `Delete ${count} tasks?`,
      message:
        count === 1
          ? `“${pool.find((t) => t.id === ids[0])?.title}” will be deleted. You can undo this straight after.`
          : `${count} tasks will be deleted. You can undo this straight after.`,
      onConfirm: () => {
        const undo = deleteTasks(ids)
        setSelected(new Set())
        showToast(count === 1 ? 'Task deleted' : `${count} tasks deleted`, { undo })
      },
    })
  }

  const toggleSelect = (id) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
  }

  const selectedTasks = () => pool.filter((t) => selected.has(t.id))

  function bulkComplete() {
    const list = selectedTasks().filter((t) => !isDone(t))
    const undo = completeTasks(list)
    showToast(`${list.length} completed`, { undo })
    stopSelecting()
  }

  function bulkMove(target) {
    const ids = [...selected]
    const undo = moveTasks(ids, target === 'none' ? null : target)
    const name = target === 'none' ? 'Inbox' : projectsById.get(target)?.name
    showToast(`Moved ${ids.length} to ${name}`, { undo })
    stopSelecting()
  }

  // Manual order: drop above or below the task under the pointer.
  function dropOn(target, below) {
    if (!dragId || dragId === target.id) return
    const list = visibleOpen.filter((t) => t.id !== dragId)
    const index = list.findIndex((t) => t.id === target.id) + (below ? 1 : 0)
    placeTask(dragId, list[index - 1], list[index])
    setDragId(null)
  }

  function move(task, direction) {
    const index = visibleOpen.findIndex((t) => t.id === task.id)
    const list = visibleOpen.filter((t) => t.id !== task.id)
    const to = Math.max(0, Math.min(list.length, index + direction))
    placeTask(task.id, list[to - 1], list[to])
  }

  function clearFilters() {
    setQuery('')
    setPriorityFilter('')
    setProjectFilter('')
    setTagFilter(null)
  }

  function renderTask(task) {
    const dragProps = canReorder && !isDone(task)
      ? {
          draggable: true,
          onDragStart: (e) => {
            setDragId(task.id)
            e.dataTransfer.effectAllowed = 'move'
          },
          onDragEnd: () => setDragId(null),
          onDragOver: (e) => e.preventDefault(),
          onDrop: (e) => {
            const box = e.currentTarget.getBoundingClientRect()
            dropOn(task, e.clientY > box.top + box.height / 2)
          },
        }
      : undefined
    return (
      <TodoItem
        key={task.id}
        todo={task}
        project={project ? null : projectsById.get(task.projectId)}
        onToggle={() => toggle(task)}
        onOpen={() => openTask(task.id)}
        onDelete={() => askDelete([task.id])}
        onTagClick={setTagFilter}
        selecting={selecting}
        selected={selected.has(task.id)}
        onSelect={() => toggleSelect(task.id)}
        dragProps={dragProps}
        onMove={canReorder && !isDone(task) ? (direction) => move(task, direction) : undefined}
      />
    )
  }

  return (
    <div className="page-scroll">
      <section className="page">
        <header className="page-head">
          <div className="page-title-row">
            {project && <span className="project-dot lg" data-color={project.color} aria-hidden="true" />}
            <div>
              <h1 className="page-title">{title}</h1>
              <p className="page-sub">{summary}</p>
            </div>
          </div>
          {project && (
            <div className="actions">
              <button className="btn ghost sm" onClick={() => setEditingProject(true)}>
                <PencilIcon width={15} height={15} />
                Edit
              </button>
              <button
                className="btn ghost sm danger-text"
                onClick={() => {
                  const count = pool.filter((t) => t.projectId === project.id).length
                  setConfirm({
                    title: 'Delete project?',
                    message: count
                      ? `“${project.name}” will be deleted. Its ${count} ${count === 1 ? 'task moves' : 'tasks move'} to your Inbox.`
                      : `“${project.name}” will be deleted.`,
                    onConfirm: () => {
                      const undo = deleteProject(project.id)
                      navigate('/tasks/inbox')
                      showToast('Project deleted', { undo })
                    },
                  })
                }}
              >
                <TrashIcon width={15} height={15} />
                Delete
              </button>
            </div>
          )}
        </header>

        {!completedView && <TodoComposer key={view + (project?.id ?? '')} onAdd={addTask} defaults={defaults} />}

        <div className="view-tabs" role="tablist" aria-label="Task views">
          {TAB_ORDER.map((key) => {
            const count = key === 'completed' ? 0 : open.filter(VIEWS[key].test).length
            return (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                className={view === key ? 'view-tab active' : 'view-tab'}
                onClick={() => navigate(key === 'all' ? '/tasks' : `/tasks/${key}`)}
              >
                {VIEWS[key].label}
                {count > 0 && key !== 'all' && (
                  <span className={key === 'overdue' ? 'tab-count alert' : 'tab-count'}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {selecting ? (
          <div className="bulk-bar" role="toolbar" aria-label="Selected tasks">
            <span className="bulk-count">{selected.size} selected</span>
            <button className="link" onClick={() => setSelected(new Set(listed.map((t) => t.id)))}>
              Select all
            </button>
            <div className="bulk-actions">
              <button className="btn secondary sm" disabled={!selected.size} onClick={bulkComplete}>
                Complete
              </button>
              <select
                className="input input-sm"
                value=""
                disabled={!selected.size}
                onChange={(e) => e.target.value && bulkMove(e.target.value)}
                aria-label="Move selected to project"
              >
                <option value="">Move to…</option>
                <option value="none">Inbox (no project)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn secondary sm danger-text" disabled={!selected.size} onClick={() => askDelete([...selected])}>
                Delete
              </button>
              <button className="btn ghost sm" onClick={stopSelecting}>
                Done
              </button>
            </div>
          </div>
        ) : (
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
                  {p.label}
                </option>
              ))}
            </select>
            {!project && projects.length > 0 && (
              <select
                className="select-inline"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                aria-label="Filter by project"
              >
                <option value="">Any project</option>
                <option value="none">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {!completedView && (
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
            )}
            {listed.length > 0 && (
              <button className="btn ghost sm" onClick={() => setSelecting(true)}>
                <SelectIcon width={15} height={15} />
                Select
              </button>
            )}
          </div>
        )}

        {allTags.length > 0 && !selecting && (
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

        {narrowed && (
          <p className="filter-status">
            Showing {listed.length} matching {listed.length === 1 ? 'task' : 'tasks'}
            <button className="link" onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        )}
        {sort === 'manual' && narrowed && !completedView && (
          <p className="field-hint">Clear the filters to drag tasks into your own order.</p>
        )}

        {pool.length === 0 ? (
          <div className="todo-empty">
            <div className="empty-icon">
              <ChecklistIcon width={26} height={26} />
            </div>
            <h3>Nothing on your list</h3>
            <p>Type a task above and press Enter.</p>
          </div>
        ) : listed.length === 0 ? (
          <p className="empty-inline">
            {narrowed ? 'No tasks match these filters.' : project ? 'No open tasks in this project.' : VIEWS[view].empty}
          </p>
        ) : (
          <ul className={dragId ? 'todo-list dragging' : 'todo-list'}>{listed.map(renderTask)}</ul>
        )}

        {!completedView && visibleDone.length > 0 && (
          <div className="completed-section">
            <div className="completed-head">
              <button
                className="completed-toggle"
                onClick={() => updateSettings({ tasksShowCompleted: !showCompleted })}
                aria-expanded={showCompleted}
              >
                <ChevronIcon width={14} height={14} className={showCompleted ? 'chevron open' : 'chevron'} />
                Completed
                <span className="tab-count">{visibleDone.length}</span>
              </button>
            </div>
            {showCompleted && <ul className="todo-list">{visibleDone.slice(0, 50).map(renderTask)}</ul>}
            {showCompleted && visibleDone.length > 50 && (
              <button className="link" onClick={() => navigate('/tasks/completed')}>
                See all {visibleDone.length} completed
              </button>
            )}
          </div>
        )}
        {completedView && visibleDone.length > 0 && !selecting && (
          <p className="field-hint completed-hint">
            To clear old completed tasks, choose Select, then Select all and Delete.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
      <ProjectDialog open={editingProject} project={project} onClose={() => setEditingProject(false)} />
    </div>
  )
}
