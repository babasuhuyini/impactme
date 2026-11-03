// iCalendar (.ics) export, readable by Google Calendar, Outlook and Apple Calendar.
// Times are written as "floating" local times, so 9:00 stays 9:00 wherever the file is opened.

import { addDays, toMinutes } from './dates.js'
import { toRRule } from './recurrence.js'
import { DEFAULT_DURATION } from './calendar.js'

const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
const compactDate = (key) => key.replaceAll('-', '')
const compactTime = (time) => time.replace(':', '') + '00'

function endOf(task) {
  if (task.endTime) return task.endTime
  const minutes = Math.min(toMinutes(task.startTime) + DEFAULT_DURATION, 23 * 60 + 59)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// Lines longer than 75 characters are folded onto continuation lines.
function fold(line) {
  const parts = []
  for (let i = 0; i < line.length; i += i === 0 ? 75 : 74) parts.push(line.slice(i, i + (i === 0 ? 75 : 74)))
  return parts.join('\r\n ')
}

const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function buildICS(tasks, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ImpactMe//Calendar export//EN', 'CALSCALE:GREGORIAN']
  for (const task of tasks) {
    if (!task.dueDate || task.status === 'done') continue
    lines.push('BEGIN:VEVENT', `UID:${task.id}@impactme`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${escape(task.title)}`)
    if (task.startTime) {
      lines.push(`DTSTART:${compactDate(task.dueDate)}T${compactTime(task.startTime)}`)
      lines.push(`DTEND:${compactDate(task.dueDate)}T${compactTime(endOf(task))}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(task.dueDate)}`)
      lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(task.dueDate, 1))}`)
    }
    if (task.recurrence) lines.push(`RRULE:${toRRule(task.recurrence)}`)
    if (task.description) lines.push(`DESCRIPTION:${escape(task.description)}`)
    if (task.tags.length) lines.push(`CATEGORIES:${task.tags.map(escape).join(',')}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
