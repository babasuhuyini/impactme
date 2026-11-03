import Dexie from 'dexie'

// One IndexedDB database per browser profile and site. New tables in later
// phases get a new db.version(n) block; never edit an old one, so existing
// data always upgrades in order.
export const db = new Dexie('impactme')

db.version(1).stores({
  tasks: 'id, status, dueDate, updatedAt',
  journal: 'id, date, updatedAt',
  kv: 'key', // settings and bookkeeping (migrations, safety snapshots)
})
