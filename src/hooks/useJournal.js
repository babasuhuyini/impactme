import { useMemo } from 'react'
import { journal, useJournalEntries } from '../data/store.js'
import { createEntry } from '../data/models.js'
import { isEmptyEntry } from '../lib/journal.js'

const byNewest = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt

// Ids of entries this tab created, so pruning never touches a blank entry
// another open tab has just started.
const createdHere = new Set()

const create = (fields) => {
  const entry = journal.put(createEntry(fields))
  createdHere.add(entry.id)
  return entry
}
const update = (id, patch) => journal.update(id, patch)
const remove = (id) => journal.remove(id)

// Entries are created blank on "New"; drop any left untouched, except the one open now.
const pruneEmpty = (keepId) =>
  journal.remove(
    journal
      .all()
      .filter((e) => e.id !== keepId && createdHere.has(e.id) && isEmptyEntry(e))
      .map((e) => e.id)
  )

export default function useJournal() {
  const stored = useJournalEntries()
  const entries = useMemo(() => [...stored].sort(byNewest), [stored])
  return { entries, create, update, remove, pruneEmpty }
}
