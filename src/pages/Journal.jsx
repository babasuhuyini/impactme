import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import useJournal from '../hooks/useJournal.js'
import EntryEditor from '../components/journal/EntryEditor.jsx'
import MoodTrend from '../components/journal/MoodTrend.jsx'
import { showToast } from '../components/Toast.jsx'
import { BookIcon, PlusIcon, SearchIcon } from '../components/icons.jsx'
import { journal } from '../data/store.js'
import { formatTime } from '../lib/format.js'
import {
  MOODS,
  computeStreak,
  entrySnippet,
  entryTitle,
  formatDayHeading,
  getMood,
} from '../lib/journal.js'

function groupByDate(entries) {
  const groups = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && last[0] === entry.date) last[1].push(entry)
    else groups.push([entry.date, [entry]])
  }
  return groups
}

function matchesQuery(entry, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [entry.title, entry.body, entry.gratitude, ...entry.tags].some((field) =>
    field.toLowerCase().includes(q)
  )
}

export default function Journal() {
  const { entryId } = useParams()
  const navigate = useNavigate()
  const { entries, create, update, remove, pruneEmpty } = useJournal()
  const [query, setQuery] = useState('')
  const [moodFilter, setMoodFilter] = useState(null)
  const [tagFilter, setTagFilter] = useState('')

  useEffect(() => {
    pruneEmpty(entryId)
  }, [entryId, pruneEmpty])

  const selected = entries.find((e) => e.id === entryId) ?? null
  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries])
  const streak = computeStreak(entries)

  const filtered = entries.filter(
    (e) =>
      e.id === entryId ||
      ((!moodFilter || e.mood === moodFilter) &&
        (!tagFilter || e.tags.includes(tagFilter)) &&
        matchesQuery(e, query))
  )
  const hasFilters = Boolean(query.trim() || moodFilter || tagFilter)

  function newEntry() {
    setQuery('')
    setMoodFilter(null)
    setTagFilter('')
    navigate(`/journal/${create().id}`)
  }

  function clearFilters() {
    setQuery('')
    setMoodFilter(null)
    setTagFilter('')
  }

  const summary =
    `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` +
    (streak > 0 ? ` · ${streak}-day streak` : '')

  return (
    <div className={selected ? 'journal has-selection' : 'journal'}>
      <section className="list-pane" aria-label="Journal entries">
        <header className="list-head">
          <div className="list-title-row">
            <div>
              <h1 className="pane-title">Journal</h1>
              <p className="pane-sub">{summary}</p>
            </div>
            <button className="add-round" onClick={newEntry} aria-label="New entry" title="New entry">
              <PlusIcon width={18} height={18} strokeWidth={2.4} />
            </button>
          </div>

          {entries.length > 0 && (
            <>
              <label className="search-field">
                <SearchIcon width={15} height={15} />
                <input
                  type="search"
                  className="bare"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search entries"
                  aria-label="Search entries"
                />
              </label>

              <div className="list-filters">
                <div className="mood-filter" role="group" aria-label="Filter by mood">
                  {MOODS.map((m) => (
                    <button
                      key={m.value}
                      data-mood={m.value}
                      className={moodFilter === m.value ? 'mood-chip active' : 'mood-chip'}
                      onClick={() => setMoodFilter(moodFilter === m.value ? null : m.value)}
                      title={m.label}
                      aria-pressed={moodFilter === m.value}
                    >
                      {m.emoji}
                    </button>
                  ))}
                </div>
                {allTags.length > 0 && (
                  <select
                    className="select-inline"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    aria-label="Filter by tag"
                  >
                    <option value="">All tags</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        #{tag}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {hasFilters && (
                <p className="filter-status">
                  {filtered.length} of {entries.length}
                  <button className="link" onClick={clearFilters}>
                    Clear filters
                  </button>
                </p>
              )}
            </>
          )}
        </header>

        <div className="entry-list">
          {entries.length > 0 && !hasFilters && <MoodTrend entries={entries} />}

          {entries.length === 0 ? (
            <div className="list-empty">
              <p>No entries yet.</p>
              <button className="btn primary" onClick={newEntry}>
                Write your first entry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="empty-inline">No entries match these filters.</p>
          ) : (
            groupByDate(filtered).map(([date, items]) => (
              <div key={date} role="list">
                <div className="list-group-label">{formatDayHeading(date)}</div>
                {items.map((entry) => {
                  const title = entryTitle(entry)
                  const snippet = entrySnippet(entry)
                  const mood = getMood(entry.mood)
                  return (
                    <Link
                      key={entry.id}
                      role="listitem"
                      to={`/journal/${entry.id}`}
                      className={entry.id === entryId ? 'entry-item active' : 'entry-item'}
                      aria-current={entry.id === entryId ? 'page' : undefined}
                    >
                      <div className="entry-item-top">
                        <span className={title ? 'entry-item-title' : 'entry-item-title untitled'}>
                          {title || 'Untitled'}
                        </span>
                        {mood && (
                          <span className="entry-item-mood" title={mood.label}>
                            {mood.emoji}
                          </span>
                        )}
                      </div>
                      <p className="entry-item-snippet">{snippet || 'No additional text'}</p>
                      <div className="entry-item-meta">
                        <span>{formatTime(entry.createdAt)}</span>
                        {entry.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="entry-item-tag">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </Link>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="editor-pane" aria-label="Entry editor">
        {selected ? (
          <EntryEditor
            key={selected.id}
            entry={selected}
            knownTags={allTags}
            onChange={(patch) => update(selected.id, patch)}
            onDelete={() => {
              const removed = remove(selected.id)
              navigate('/journal')
              showToast('Entry deleted', { undo: () => removed.forEach(journal.put) })
            }}
            onBack={() => navigate('/journal')}
          />
        ) : (
          <div className="editor-empty">
            <div className="editor-empty-icon">
              <BookIcon width={28} height={28} />
            </div>
            <h2>{entries.length ? 'Pick an entry to read' : 'Start your journal'}</h2>
            <p>
              {entries.length
                ? 'Select an entry from the list, or start a new one.'
                : 'Log how you feel, what happened, and what you’re grateful for.'}
            </p>
            <button className="btn primary" onClick={newEntry}>
              <PlusIcon width={16} height={16} strokeWidth={2.4} />
              New entry
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
