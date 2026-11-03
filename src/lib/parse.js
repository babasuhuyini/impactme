// Reads dates, times, repeats, priority and #tags out of a typed task, e.g.
//   "Submit report tomorrow at 9 AM"   → tomorrow, 09:00
//   "Pay rent every month on the 1st"  → monthly on the 1st
//   "Study every weekday at 7 PM #uni" → Mon–Fri, 19:00, tag "uni"
// Runs entirely on the device. The caller shows what was found so the user can
// correct it; `ignore` lists kinds the user has rejected (their words stay in the title).

import { addDays, addMonths, daysInMonth, fromMinutes, makeKey, toDateKey, weekday } from './dates.js'
import { firstOccurrence, normalizeRule } from './recurrence.js'

const DAY = '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)'
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const TIME = '(?:(noon|midnight)|(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?)'
const ORD = '(?:st|nd|rd|th)'
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

const dayIndex = (word) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3).toLowerCase())
const monthIndex = (word) =>
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(word.slice(0, 3).toLowerCase()) + 1
const re = (source) => new RegExp(source, 'i')

// Hours without am/pm: 1–6 are taken as afternoon (people rarely plan 3 AM), 7–11 as morning.
function toTime(word, hourText, minuteText, meridiem, { guess = true } = {}) {
  if (word) return word.toLowerCase() === 'noon' ? '12:00' : '00:00'
  let hour = Number(hourText)
  const minute = minuteText ? Number(minuteText) : 0
  const mer = meridiem?.toLowerCase().replaceAll('.', '')
  if (mer) {
    if (hour < 1 || hour > 12) return null
    if (mer === 'am' && hour === 12) hour = 0
    if (mer === 'pm' && hour < 12) hour += 12
  } else {
    if (hour > 23) return null
    if (guess && hour >= 1 && hour <= 6) hour += 12
  }
  return fromMinutes(hour * 60 + minute)
}

// "friday" is the coming Friday (today if it's Friday); "next friday" is never today.
function nextWeekday(today, target, { includeToday } = {}) {
  let diff = (target - weekday(today) + 7) % 7
  if (diff === 0 && !includeToday) diff = 7
  return addDays(today, diff)
}

function validDate(year, month, day) {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? makeKey(year, month, day) : null
}

// A month/day without a year means the next time that date comes round.
function upcoming(today, month, day, yearText) {
  const year = yearText ? Number(yearText) : Number(today.slice(0, 4))
  const key = validDate(year, month, day)
  if (!key || yearText) return key
  return key < today ? validDate(year + 1, month, day) : key
}

export function parseQuickAdd(input, { now = new Date(), ignore = [] } = {}) {
  const today = toDateKey(now)
  const skip = new Set(ignore)
  let work = ` ${input} `
  const found = new Set()

  // Finds the first match; if `handle` returns a value, the matched words are removed.
  function take(pattern, handle) {
    const match = work.match(pattern)
    if (!match) return null
    const value = handle(match)
    if (value != null) work = work.slice(0, match.index) + ' ' + work.slice(match.index + match[0].length)
    return value
  }

  const result = { title: '', tags: [], dueDate: null, startTime: null, endTime: null, recurrence: null, priority: null }

  // #tags
  if (!skip.has('tags')) {
    for (const m of work.matchAll(/(?<=\s)#([\w-]+)/g)) result.tags.push(m[1].toLowerCase())
    if (result.tags.length) {
      work = work.replace(/(?<=\s)#[\w-]+/g, ' ')
      result.tags = [...new Set(result.tags)]
      found.add('tags')
    }
  }

  // Priority: !urgent !high !low, or !!! / !!
  if (!skip.has('priority')) {
    result.priority =
      take(/(?<=\s)!(urgent|high|normal|low)\b/i, (m) => m[1].toLowerCase()) ??
      take(/(?<=\s)(!!!|!!)(?=\s)/, (m) => (m[1] === '!!!' ? 'urgent' : 'high'))
    if (result.priority) found.add('priority')
  }

  // Repeats
  let rule = null
  if (!skip.has('repeat')) {
    rule =
      take(re(`\\bevery\\s+(weekday|weekend)s?\\b`), (m) =>
        m[1].toLowerCase() === 'weekday' ? { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] } : { freq: 'weekly', weekdays: [0, 6] }
      ) ??
      take(re(`\\bevery\\s+(${DAY}(?:\\s*(?:,|and|&|\\+)\\s*${DAY})*)\\b`), (m) => ({
        freq: 'weekly',
        weekdays: m[1].split(/\s*(?:,|and|&|\+)\s*/i).map(dayIndex),
      })) ??
      take(re(`\\bevery\\s+(other\\s+|(\\d+)\\s+)?(day|week|month|year)s?\\b`), (m) => ({
        freq: { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[m[3].toLowerCase()],
        interval: m[2] ? Number(m[2]) : m[1] ? 2 : 1,
      })) ??
      take(/\b(daily|everyday|weekly|fortnightly|monthly|yearly|annually)\b/i, (m) => {
        const word = m[1].toLowerCase()
        if (word === 'fortnightly') return { freq: 'weekly', interval: 2 }
        return { freq: { daily: 'daily', everyday: 'daily', weekly: 'weekly', monthly: 'monthly' }[word] ?? 'yearly' }
      })
    if (rule) {
      found.add('repeat')
      if (rule.freq === 'monthly') {
        const monthDay = take(re(`\\b(?:on\\s+)?the\\s+(\\d{1,2})${ORD}?\\b`), (m) =>
          Number(m[1]) >= 1 && Number(m[1]) <= 31 ? Number(m[1]) : null
        )
        if (monthDay) rule.monthDay = monthDay
      }
      const until = take(
        re(`\\buntil\\s+(?:(${MONTH})\\.?\\s+(\\d{1,2})${ORD}?|(\\d{1,2})${ORD}?\\s+(?:of\\s+)?(${MONTH}))(?:,?\\s+(\\d{4}))?\\b`),
        (m) => (m[1] ? upcoming(today, monthIndex(m[1]), Number(m[2]), m[5]) : upcoming(today, monthIndex(m[4]), Number(m[3]), m[5]))
      )
      if (until) rule.endsOn = until
      const count = take(/\b(?:for\s+)?(\d{1,3})\s+times\b/i, (m) => Number(m[1]))
      if (count) rule.count = count
    }
  }

  // Times: a range ("2-3pm", "from 9 to 10:30") or a single time ("at 9", "7 PM", "14:30")
  if (!skip.has('time')) {
    const range = take(re(`(\\bfrom\\s+)?\\b${TIME}\\s*(?:-|–|to|until|till)\\s*${TIME}(?=[\\s.,]|$)`), (m) => {
      const [, from, w1, h1, m1, mer1, w2, h2, m2, mer2] = m
      // Without am/pm, a colon or "from", "2-3" is more likely a quantity than a time.
      if (!from && !mer1 && !mer2 && !m1 && !m2 && !w1 && !w2) return null
      const start = toTime(w1, h1, m1, mer1 ?? (mer2 && Number(h1) <= Number(h2) ? mer2 : null))
      const end = toTime(w2, h2, m2, mer2)
      return start && end && end > start ? [start, end] : null
    })
    if (range) [result.startTime, result.endTime] = range
    else {
      result.startTime =
        take(re(`(?:\\bat\\s+|@\\s*)${TIME}(?=[\\s.,]|$)`), (m) => toTime(m[1], m[2], m[3], m[4])) ??
        take(re(`\\b(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?=[\\s.,]|$)`), (m) => toTime(null, m[1], m[2], m[3])) ??
        take(/\b(\d{1,2}):([0-5]\d)\b/, (m) => toTime(null, m[1], m[2], null, { guess: false })) ??
        take(/\b(noon|midnight)\b/i, (m) => toTime(m[1]))
    }
    if (result.startTime) found.add('time')
  }

  // Dates
  if (!skip.has('date')) {
    const lead = '(?:\\b(?:on|by|due|for)\\s+)?'
    result.dueDate =
      take(re(`${lead}\\b(?:the\\s+)?day\\s+after\\s+tomorrow\\b`), () => addDays(today, 2)) ??
      take(re(`${lead}\\b(today|tonight|tomorrow|tomorow|tmrw|tmr)\\b`), (m) =>
        ['today', 'tonight'].includes(m[1].toLowerCase()) ? today : addDays(today, 1)
      ) ??
      take(re(`${lead}\\bnext\\s+week\\b`), () => nextWeekday(today, 1)) ??
      take(re(`${lead}\\bnext\\s+month\\b`), () => addMonths(today.slice(0, 8) + '01', 1)) ??
      take(re(`${lead}\\b(?:this\\s+)?weekend\\b`), () => nextWeekday(today, 6, { includeToday: true })) ??
      take(/\bin\s+(\d{1,3}|an?|one|two|three|four|five|six)\s+(day|week|month)s?\b/i, (m) => {
        const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1])
        const unit = m[2].toLowerCase()
        return unit === 'month' ? addMonths(today, n) : addDays(today, unit === 'week' ? n * 7 : n)
      }) ??
      take(re(`${lead}\\b(?:(next|this)\\s+)?(${DAY})\\b`), (m) =>
        nextWeekday(today, dayIndex(m[2]), { includeToday: !m[1] || m[1].toLowerCase() === 'this' })
      ) ??
      take(re(`${lead}\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`), (m) => validDate(Number(m[1]), Number(m[2]), Number(m[3]))) ??
      take(re(`${lead}\\b(${MONTH})\\.?\\s+(\\d{1,2})${ORD}?(?:,?\\s+(\\d{4}))?\\b`), (m) =>
        upcoming(today, monthIndex(m[1]), Number(m[2]), m[3])
      ) ??
      take(re(`${lead}\\b(?:the\\s+)?(\\d{1,2})${ORD}?\\s+(?:of\\s+)?(${MONTH})(?:,?\\s+(\\d{4}))?\\b`), (m) =>
        upcoming(today, monthIndex(m[2]), Number(m[1]), m[3])
      ) ??
      take(re(`${lead}\\bthe\\s+(\\d{1,2})${ORD}\\b`), (m) => {
        const day = Number(m[1])
        const thisMonth = validDate(Number(today.slice(0, 4)), Number(today.slice(5, 7)), day)
        if (thisMonth && thisMonth >= today) return thisMonth
        const next = addMonths(today.slice(0, 8) + '01', 1)
        return validDate(Number(next.slice(0, 4)), Number(next.slice(5, 7)), day)
      })
    if (result.dueDate) found.add('date')
  }

  // A repeat without a date starts at its first occurrence; a time without a date means today.
  if (rule) {
    const start = result.dueDate ?? today
    let normalized = normalizeRule(rule, start)
    if (!result.dueDate) {
      result.dueDate = firstOccurrence(normalized, today)
      normalized = normalizeRule({ ...rule, start: result.dueDate }, result.dueDate)
    }
    result.recurrence = normalized
  }
  if (result.startTime && !result.dueDate) result.dueDate = today

  // Tidy the title: drop words left dangling by what was taken out.
  let title = work.replace(/\s+/g, ' ').trim()
  let previous
  do {
    previous = title
    title = title
      .replace(/^(?:on|at|by|due|from|for|every|and)\b\s*/i, '')
      .replace(/\s*\b(?:on|at|by|due|from|for|every|and|to)$/i, '')
      .replace(/^[,.\-–\s]+|[,\-–\s]+$/g, '')
  } while (title !== previous)
  result.title = title || input.trim()
  result.found = [...found]
  return result
}
