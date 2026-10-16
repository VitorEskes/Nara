import { useSyncExternalStore } from 'react'

// The app's own confirmations and notices, in place of the system's confirm() and alert(): a
// small modal (DialogHost.jsx) that reads like the rest of the app and that a screen reader
// announces as a dialog. One shows at a time; the rest wait their turn.

export interface DialogOptions {
  title: string
  message?: string
  confirm?: string
  cancel?: string | null
  danger?: boolean
}

export interface Dialog extends Required<Omit<DialogOptions, 'message'>> {
  id: string
  message?: string
  resolve: (value: boolean) => void
}

let queue: Dialog[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

// Resolves true when `confirm` is picked, false on Cancel, Escape or a press outside. `danger`
// paints the confirm button red and puts the focus on Cancel instead.
export function ask({
  title,
  message,
  confirm = 'OK',
  cancel = 'Cancel',
  danger = false
}: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      { id: crypto.randomUUID(), title, message, confirm, cancel, danger, resolve }
    ]
    emit()
  })
}

// A notice with a single button to put it away.
export function tell({
  title,
  message
}: Pick<DialogOptions, 'title' | 'message'>): Promise<boolean> {
  return ask({ title, message, confirm: 'OK', cancel: null })
}

export function answer(id: string, value: boolean): void {
  const dialog = queue.find((d) => d.id === id)
  if (!dialog) return
  queue = queue.filter((d) => d.id !== id)
  emit()
  dialog.resolve(value)
}

// The dialog showing, or null.
export function useDialog(): Dialog | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => queue[0] ?? null
  )
}
