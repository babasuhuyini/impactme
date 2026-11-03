import { useEffect, useRef } from 'react'
import { XIcon } from './icons.jsx'

// Native <dialog>: the browser handles focus trapping, Escape and the backdrop.
export default function Dialog({ open, onClose, title, description, children, size = 'md' }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // A click that lands on the <dialog> itself is a click on the backdrop.
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-head">
            <div>
              <h2 id="dialog-title" className="dialog-title">
                {title}
              </h2>
              {description && <p className="dialog-desc">{description}</p>}
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <XIcon width={18} height={18} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
