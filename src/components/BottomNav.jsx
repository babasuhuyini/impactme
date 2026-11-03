import { NavLink } from 'react-router-dom'
import { BookIcon, CalendarIcon, ChecklistIcon, DotsIcon, HomeIcon } from './icons.jsx'

const linkClass = ({ isActive }) => (isActive ? 'bottom-link active' : 'bottom-link')

// Phone navigation: the main places one tap away; everything else under More.
export default function BottomNav({ onMore }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end className={linkClass}>
        <HomeIcon width={22} height={22} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/tasks" className={linkClass}>
        <ChecklistIcon width={22} height={22} />
        <span>Tasks</span>
      </NavLink>
      <NavLink to="/calendar" className={linkClass}>
        <CalendarIcon width={22} height={22} />
        <span>Calendar</span>
      </NavLink>
      <NavLink to="/journal" className={linkClass}>
        <BookIcon width={22} height={22} />
        <span>Journal</span>
      </NavLink>
      <button className="bottom-link" onClick={onMore} aria-label="More: projects, settings and theme">
        <DotsIcon width={22} height={22} />
        <span>More</span>
      </button>
    </nav>
  )
}
