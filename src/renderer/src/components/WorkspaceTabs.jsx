import { useEffect, useRef, useState } from 'react'

// Bar across the top: the app's name, one tab per open workspace, a button to create one and a
// menu with the closed ones.
export default function WorkspaceTabs({
  tabs,
  closed,
  active,
  onSelect,
  onCreate,
  onClose,
  onRename,
  onOpen,
  onRemove
}) {
  return (
    <nav className="tabs" role="tablist">
      <span className="brand">anbu</span>
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          name={tab.name}
          active={tab.id === active}
          // The last tab stays: there is always a workspace on screen.
          closable={tabs.length > 1}
          onSelect={() => onSelect(tab.id)}
          onClose={() => onClose(tab.id)}
          onRename={(name) => onRename(tab.id, name)}
        />
      ))}
      <button className="tabs-button" title="New workspace" onClick={onCreate}>
        +
      </button>
      <ClosedMenu workspaces={closed} onOpen={onOpen} onRemove={onRemove} />
    </nav>
  )
}

function Tab({ name, active, closable, onSelect, onClose, onRename }) {
  const [editing, setEditing] = useState(false)

  function finish(value) {
    setEditing(false)
    const next = value.trim()
    if (next && next !== name) onRename(next)
  }

  return (
    <div
      className={active ? 'tab active' : 'tab'}
      role="tab"
      aria-selected={active}
      title="Double-click to rename"
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <input
          className="tab-name"
          defaultValue={name}
          autoFocus
          onFocus={(e) => e.target.select()}
          onBlur={(e) => finish(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.target.value = name
            if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
          }}
        />
      ) : (
        <span className="tab-name">{name}</span>
      )}
      {closable && (
        <button
          className="tab-close"
          title="Close (the workspace stays saved)"
          onClick={(e) => {
            // Otherwise the click also reaches the tab and selects it.
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function ClosedMenu({ workspaces, onOpen, onRemove }) {
  const [open, setOpen] = useState(false)
  const menu = useRef(null)

  // Closes on any click outside. Capture phase, because the terminals and the canvas stop some
  // pointer events from bubbling.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => !menu.current.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  return (
    <div className="closed-menu" ref={menu}>
      <button className="tabs-button" title="Closed workspaces" onClick={() => setOpen(!open)}>
        ▾
      </button>
      {open && (
        <div className="menu">
          {workspaces.length === 0 && <div className="menu-empty">No closed workspaces</div>}
          {workspaces.map((w) => (
            <div key={w.id} className="menu-item">
              <button
                className="menu-open"
                onClick={() => {
                  setOpen(false)
                  onOpen(w.id)
                }}
              >
                {w.name}
              </button>
              <button className="menu-remove" title="Delete" onClick={() => onRemove(w.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
