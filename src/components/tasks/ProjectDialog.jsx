import { useState } from 'react'
import Dialog from '../Dialog.jsx'
import { showToast } from '../Toast.jsx'
import { projects } from '../../data/store.js'
import { addProject } from '../../data/actions.js'
import { PROJECT_COLORS } from '../../data/models.js'

// Create a project (project = null) or rename / recolour one.
export default function ProjectDialog({ open, project, onClose, onCreated }) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} size="sm">
      {open && <ProjectForm project={project} onClose={onClose} onCreated={onCreated} />}
    </Dialog>
  )
}

function ProjectForm({ project, onClose, onCreated }) {
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState(project?.color ?? 'emerald')
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Give the project a name.')
    if (project) {
      projects.update(project.id, { name, color })
    } else {
      const created = addProject({ name, color })
      showToast(`Project “${created.name}” created`)
      onCreated?.(created)
    }
    onClose()
  }

  return (
    <form className="project-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="project-name">Name</label>
        <input
          id="project-name"
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
          placeholder="e.g. Home renovation"
          maxLength={60}
          autoFocus
          aria-invalid={Boolean(error)}
        />
        {error && <p className="field-error">{error}</p>}
      </div>
      <fieldset className="color-picker">
        <legend className="field-label">Colour</legend>
        {PROJECT_COLORS.map(([key, label]) => (
          <label key={key} className="color-swatch" data-color={key} title={label}>
            <input type="radio" name="project-color" checked={color === key} onChange={() => setColor(key)} />
            <span className="sr-only">{label}</span>
          </label>
        ))}
      </fieldset>
      <footer className="dialog-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          {project ? 'Save' : 'Create project'}
        </button>
      </footer>
    </form>
  )
}
