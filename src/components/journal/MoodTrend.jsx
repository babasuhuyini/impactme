import { addDays, computeStreak, formatDayHeading, getMood, toDateKey } from '../../lib/journal.js'

// Journal stats (UI upgrade): the streak, how many entries, and the last
// 14 days of mood as bars whose height and colour follow the mood.
export default function MoodTrend({ entries, days = 14 }) {
  const today = toDateKey()
  const streak = computeStreak(entries)

  const moodsByDay = new Map()
  for (const entry of entries) {
    if (!entry.mood) continue
    if (!moodsByDay.has(entry.date)) moodsByDay.set(entry.date, [])
    moodsByDay.get(entry.date).push(entry.mood)
  }

  const columns = Array.from({ length: days }, (_, i) => {
    const key = addDays(today, i - days + 1)
    const moods = moodsByDay.get(key)
    const avg = moods ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : null
    return { key, mood: avg ? getMood(avg) : null }
  })

  const logged = columns.filter((c) => c.mood)
  const overall = logged.length
    ? getMood(Math.round(logged.reduce((a, c) => a + c.mood.value, 0) / logged.length))
    : null

  return (
    <section className="journal-stats" aria-label="Journal stats">
      <div className="stats-streak">
        <span className="stats-label">Streak</span>
        <strong className="stats-streak-value">
          {streak} {streak === 1 ? 'day' : 'days'}
        </strong>
        <span className="stats-note">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <div className="stats-mood">
        <span className="stats-label">Mood, last {days} days</span>
        <div
          className="stats-bars"
          role="img"
          aria-label={
            overall ? `Mood over the last ${days} days, mostly ${overall.label.toLowerCase()}` : 'No moods logged lately'
          }
        >
          {columns.map(({ key, mood }) => (
            <span
              key={key}
              className={mood ? 'stats-bar' : 'stats-bar empty'}
              data-mood={mood?.value ?? 0}
              title={`${formatDayHeading(key)}: ${mood ? mood.label : 'no mood logged'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
