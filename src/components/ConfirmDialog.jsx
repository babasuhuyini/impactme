import Dialog from './Dialog.jsx'

// A yes/no question for actions that remove things.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} size="sm">
      <p className="confirm-message">{message}</p>
      <footer className="dialog-foot">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onConfirm()
            onCancel()
          }}
          autoFocus
        >
          {confirmLabel}
        </button>
      </footer>
    </Dialog>
  )
}
