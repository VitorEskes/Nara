import { useState, type KeyboardEvent, type ReactNode } from 'react'

// Renaming in place. `start` turns the name into a text field (`field`), which renames on Enter
// or blur and gives up on Escape. Callers show `field` in place of the name while `editing`.
export function useRename(
  name: string,
  onRename: (name: string) => void
): { editing: boolean; start: () => void; field: ReactNode } {
  const [editing, setEditing] = useState(false)

  function finish(value: string): void {
    setEditing(false)
    const next = value.trim()
    if (next && next !== name) onRename(next)
  }

  const field = editing && (
    <input
      className="row-input"
      defaultValue={name}
      aria-label="New name"
      autoFocus
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') e.currentTarget.value = name
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
    />
  )
  return { editing, start: () => setEditing(true), field }
}

// Keys that start renaming the focused element, as in a file manager.
export function isRenameKey(e: KeyboardEvent | globalThis.KeyboardEvent): boolean {
  return e.key === 'F2'
}
