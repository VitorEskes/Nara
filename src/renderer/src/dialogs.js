import { useSyncExternalStore } from 'react'

// The app's own confirmations and notices, in place of the system's confirm() and alert(): a
// small modal (DialogHost.jsx) that reads like the rest of the app and that a screen reader
// announces as a dialog. One shows at a time; the rest wait their turn.

let queue = []
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn()
}

// Resolves true when `confirm` is picked, false on Cancel, Escape or a press outside. `danger`
// paints the confirm button red and puts the focus on Cancel instead.
export function ask({ title, message, confirm = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      { id: crypto.randomUUID(), title, message, confirm, cancel, danger, resolve }
    ]
    emit()
  })
}

// A notice with a single button to put it away.
export function tell({ title, message }) {
  return ask({ title, message, confirm: 'OK', cancel: null })
}

export function answer(id, value) {
  const dialog = queue.find((d) => d.id === id)
  if (!dialog) return
  queue = queue.filter((d) => d.id !== id)
  emit()
  dialog.resolve(value)
}

// The dialog showing, or null.
export function useDialog() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => queue[0] ?? null
  )
}
