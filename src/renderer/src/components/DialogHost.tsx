import type { JSX } from 'react'
import Modal from './Modal'
import { answer, useDialog } from '../dialogs'

// Shows the confirmation or notice asked for with dialogs.ts, one at a time.
export default function DialogHost(): JSX.Element | null {
  const dialog = useDialog()
  if (!dialog) return null
  const { id, title, message, confirm, cancel, danger } = dialog
  return (
    <Modal
      key={id}
      title={title}
      role="alertdialog"
      onSubmit={() => answer(id, true)}
      onClose={() => answer(id, false)}
      footer={
        <>
          {cancel && (
            <button
              type="button"
              className="button"
              data-autofocus={danger || undefined}
              onClick={() => answer(id, false)}
            >
              {cancel}
            </button>
          )}
          <button
            type="submit"
            className={danger ? 'button primary danger' : 'button primary'}
            data-autofocus={!danger || !cancel || undefined}
          >
            {confirm}
          </button>
        </>
      }
    >
      {message && <p className="modal-message">{message}</p>}
    </Modal>
  )
}
