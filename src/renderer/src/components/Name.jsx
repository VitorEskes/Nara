import { useState } from 'react'

// A name that turns into a text field on double-click.
export default function Name({ name, onRename, className = 'row-name' }) {
  const [editing, setEditing] = useState(false)

  function finish(value) {
    setEditing(false)
    const next = value.trim()
    if (next && next !== name) onRename(next)
  }

  if (!editing) {
    return (
      <span
        className={className}
        title="Double-click to rename"
        onDoubleClick={() => setEditing(true)}
      >
        {name}
      </span>
    )
  }
  return (
    <input
      className={className}
      defaultValue={name}
      autoFocus
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.target.value = name
        if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
      }}
    />
  )
}
