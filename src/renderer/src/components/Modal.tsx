import { useEffect, useId, useRef, type AriaRole, type JSX, type ReactNode } from 'react'
import { CloseIcon } from './icons'

// A small modal: a title, what it asks for and its buttons at the bottom. A native <dialog>, so it
// sits over everything, keeps the focus inside and closes on Escape; a press on the backdrop
// closes it too. Screen readers announce it by its title, and read its body as its description.
// `role` is 'alertdialog' for a confirmation. What should have the focus first is marked
// data-autofocus. `onSubmit` runs on the form's submit (Enter in a field, or a submit button);
// onClose puts it away.
export default function Modal({
  title,
  icon,
  role,
  onSubmit,
  onClose,
  footer,
  children
}: {
  title: ReactNode
  icon?: ReactNode
  role?: AriaRole
  onSubmit?: () => void
  onClose: () => void
  footer?: ReactNode
  children?: ReactNode
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (!el.open) el.showModal()
    // showModal puts the focus on the first control, the close button; the field or button marked
    // data-autofocus takes it instead (React's autoFocus runs before the dialog opens).
    el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      if (el.open) el.close()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className="modal"
      role={role}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      // Escape: the dialog would close itself; the state closes it instead.
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // The dialog element fills the backdrop's place, so a press right on it is outside the sheet.
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="modal-sheet"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit?.()
        }}
      >
        <header className="modal-head">
          {icon}
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className="icon-button small" aria-label="Close" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </header>
        <div id={`${id}-body`} className="modal-body">
          {children}
        </div>
        <footer className="modal-foot">{footer}</footer>
      </form>
    </dialog>
  )
}
