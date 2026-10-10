import { useState } from 'react'

// Renaming in place. `start` turns the name into a text field (`field`), which renames on Enter
// or blur and gives up on Escape. Callers show `field` in place of the name while `editing`.
export function useRename(name, onRename) {
  const [editing, setEditing] = useState(false)

  function finish(value) {
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
        if (e.key === 'Escape') e.target.value = name
        if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
      }}
    />
  )
  return { editing, start: () => setEditing(true), field }
}

// Keys that start renaming the focused element, as in a file manager.
export function isRenameKey(e) {
  return e.key === 'F2'
}
