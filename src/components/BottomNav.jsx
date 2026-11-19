import { NavLink } from 'react-router-dom'
import { BookIcon, CalendarIcon, HomeIcon, ListIcon, SlidersIcon } from './icons.jsx'

const linkClass = ({ isActive }) => (isActive ? 'bottom-link active' : 'bottom-link')

// Phone navigation: the five places of the app, one tap away.
export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end className={linkClass}>
        <HomeIcon width={25} height={25} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/tasks" className={linkClass}>
        <ListIcon width={25} height={25} />
        <span>Tasks</span>
      </NavLink>
      <NavLink to="/calendar" className={linkClass}>
        <CalendarIcon width={25} height={25} />
        <span>Calendar</span>
      </NavLink>
      <NavLink to="/journal" className={linkClass}>
        <BookIcon width={25} height={25} />
        <span>Journal</span>
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        <SlidersIcon width={25} height={25} />
        <span>Settings</span>
      </NavLink>
    </nav>
  )
}
