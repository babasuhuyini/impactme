import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import MoodPicker from './MoodPicker.jsx'
import EnergyPicker from './EnergyPicker.jsx'
import TagInput from '../TagInput.jsx'
import { CalendarIcon, ChevronLeftIcon, TrashIcon } from '../icons.jsx'
import { formatRelative } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { countWords, isEmptyEntry, parseDateKey, toDateKey } from '../../lib/journal.js'
import { useSaveStatus } from '../../data/store.js'

// Edits an entry in place; every change is saved automatically, like a note app.
export default function EntryEditor({ entry, knownTags, onChange, onDelete, onBack }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const saveStatus = useSaveStatus()
  const titleRef = useRef(null)
  const bodyRef = useRef(null)

  // Fresh entries open with the cursor in the title.
  useEffect(() => {
    if (isEmptyEntry(entry)) titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Grow the body with its content so the whole document scrolls as one.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [entry.body])

  const words = countWords(entry.body)

  return (
    <article className="editor">
      <div className="editor-toolbar">
        <button className="back-btn" onClick={onBack} aria-label="Back to entries">
          <ChevronLeftIcon width={22} height={22} strokeWidth={2.4} />
          <span aria-hidden="true">Journal</span>
        </button>
        <label className="date-pill" title="Entry date">
          <CalendarIcon width={14} height={14} />
          <input
            type="date"
            value={entry.date}
            max={toDateKey()}
            onChange={(e) => e.target.value && onChange({ date: e.target.value })}
            aria-label="Entry date"
          />
        </label>
        <span className={`toolbar-meta ${saveStatus}`} aria-live="polite">
          <span className="saved-dot" />
          {saveStatus === 'saving'
            ? 'Saving…'
            : saveStatus === 'error'
              ? 'Not saved'
              : `Saved · edited ${formatRelative(entry.updatedAt)}`}
        </span>
        <div className="toolbar-actions">
          {confirmingDelete ? (
            <>
              <span className="confirm-text">Delete this entry?</span>
              <button className="btn sm danger" onClick={onDelete}>
                Delete
              </button>
              <button className="btn sm ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="icon-btn"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Delete entry"
              title="Delete entry"
            >
              <TrashIcon width={17} height={17} />
            </button>
          )}
        </div>
      </div>

      <div className="editor-scroll">
        <div className="doc">
          <p className="doc-meta">
            {parseDateKey(entry.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            {entry.createdAt ? ` · ${formatTime(entry.createdAt)}` : ''}
          </p>
          <input
            ref={titleRef}
            className="bare doc-title"
            value={entry.title}
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                bodyRef.current?.focus()
              }
            }}
            placeholder="Untitled"
            aria-label="Title"
          />

          <div className="doc-props">
            <div className="prop">
              <span className="prop-label sr-only">Mood</span>
              <MoodPicker value={entry.mood} onChange={(mood) => onChange({ mood })} />
            </div>
            <div className="prop prop-pill">
              <span className="prop-label sr-only">Energy</span>
              <EnergyPicker value={entry.energy} onChange={(energy) => onChange({ energy })} />
            </div>
            <div className="prop">
              <span className="prop-label sr-only">Tags</span>
              <TagInput
                value={entry.tags}
                onChange={(tags) => onChange({ tags })}
                suggestions={knownTags}
              />
            </div>
          </div>

          <textarea
            ref={bodyRef}
            className="bare doc-body"
            value={entry.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder="Start writing. What happened today, how did it feel, what's on your mind?"
            aria-label="Entry"
            rows={8}
          />

          <div className="doc-callout">
            <span className="callout-label">Grateful for</span>
            <input
              className="bare"
              value={entry.gratitude}
              onChange={(e) => onChange({ gratitude: e.target.value })}
              placeholder="One small thing that went right…"
              aria-label="Grateful for"
            />
          </div>

          <p className="doc-footer">
            {words} {words === 1 ? 'word' : 'words'}
            {saveStatus === 'saved' ? ' · Saved' : ''}
          </p>
        </div>
      </div>
    </article>
  )
}
