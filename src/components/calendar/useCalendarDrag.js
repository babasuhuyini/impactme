import { useEffect, useRef, useState } from 'react'
import { DEFAULT_DURATION } from '../../lib/calendar.js'

const SNAP = 15
const DAY = 24 * 60
const snap = (minutes) => Math.round(minutes / SNAP) * SNAP
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// What lies under the pointer: a time column (date + minutes) or a whole-day cell.
function targetAt(x, y, grabOffset) {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]')
  if (!el) return null
  const date = el.dataset.date
  if (el.dataset.drop !== 'time') return { date, allDay: true }
  const box = el.getBoundingClientRect()
  return { date, allDay: false, minutes: ((y - box.top) / box.height) * DAY - grabOffset }
}

// Pointer-driven drag for calendar items: move (to another day or time),
// resize (drag the bottom edge) and drop unscheduled tasks onto the calendar.
// A press without movement counts as a click. Touch screens tap only, so
// dragging never fights with scrolling.
export default function useCalendarDrag({ onDrop, onClick }) {
  const [preview, setPreview] = useState(null)
  const session = useRef(null)
  const handlers = useRef({ onDrop, onClick })
  handlers.current = { onDrop, onClick }

  useEffect(() => {
    function move(e) {
      const s = session.current
      if (!s) return
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return
      s.moved = true
      if (s.locked) return // taps only: moving just means it wasn't a tap
      document.body.classList.add('cal-dragging')
      const target = targetAt(e.clientX, e.clientY, s.mode === 'move' ? s.grabOffset : 0)
      if (!target) return setPreview(null)
      const { item } = s
      let next
      if (s.mode === 'resize') {
        if (target.allDay || target.date !== item.date) return
        next = { ...s.base, end: clamp(snap(target.minutes), item.start + SNAP, DAY) }
      } else if (target.allDay) {
        // Dropping on a day keeps the task's time, if it has one.
        next = { date: target.date, allDay: item.start == null, start: item.start, end: item.end }
      } else {
        const length = item.start == null ? 60 : (item.end ?? item.start + DEFAULT_DURATION) - item.start
        const start = clamp(snap(target.minutes), 0, DAY - length)
        next = { date: target.date, allDay: false, start, end: start + length }
      }
      s.preview = { ...next, key: item.key }
      setPreview(s.preview)
    }

    function finish(e) {
      const s = session.current
      session.current = null
      document.body.classList.remove('cal-dragging')
      setPreview(null)
      // A cancelled pointer (e.g. the browser took over to scroll) does nothing.
      if (!s || e.type === 'pointercancel') return
      if (!s.moved) return handlers.current.onClick(s.item)
      // The browser follows a drag with a click on whatever is underneath; swallow it so
      // dropping on an empty slot doesn't also start a new task there.
      const swallow = (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      document.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0)
      if (s.preview && !s.locked) handlers.current.onDrop(s.item, s.preview)
    }

    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
    }
  }, [])

  // `item` = { key, task, date, start, end } (start null for all-day or unscheduled).
  function start(e, item, mode = 'move') {
    if (e.button !== 0) return
    // Touch, previews of later repeats and finished items can be tapped but not dragged.
    if (e.pointerType === 'touch' || item.virtual || item.done) {
      session.current = { item, mode, x: e.clientX, y: e.clientY, moved: false, locked: true }
      return
    }
    e.stopPropagation()
    e.preventDefault()
    let grabOffset = 0
    if (mode === 'move' && item.start != null) {
      const col = e.currentTarget.closest('[data-drop="time"]')
      if (col) {
        const box = col.getBoundingClientRect()
        grabOffset = ((e.clientY - box.top) / box.height) * DAY - item.start
      }
    }
    session.current = { item, mode, x: e.clientX, y: e.clientY, moved: false, grabOffset, base: { ...item, allDay: false } }
  }

  return { preview, start }
}
