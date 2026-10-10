import { useEffect, useRef, useState } from 'react'
import { AGENTS } from '../../../shared/agents'
import { ROLES } from '../../../shared/roles'

// Dock button that opens an agent. An agent that takes Nara's prompt first asks for a role, in a
// menu above the button; the others open right away. onCreate gets the role key, or
// undefined for no role.
export default function AgentButton({ agent, onCreate }) {
  const { label, prompt } = AGENTS[agent]
  const [open, setOpen] = useState(false)
  const root = useRef(null)

  // A click anywhere else or Escape closes the menu. Capture, because some parts of a node (its
  // port, its close button) stop the pointerdown before it bubbles up to the document.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (!root.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function choose(role) {
    setOpen(false)
    onCreate(role)
  }

  if (!prompt) return <button onClick={() => onCreate()}>{label}</button>

  const options = [
    [undefined, { label: 'No role', description: 'Knows how Nara works, nothing more' }],
    ...Object.entries(ROLES)
  ]
  return (
    <div className="agent-button" ref={root}>
      <button className={open ? 'active' : undefined} onClick={() => setOpen((o) => !o)}>
        {label} ▴
      </button>
      {open && (
        <div className="role-menu">
          {options.map(([role, { label, description }]) => (
            <button key={role ?? 'none'} onClick={() => choose(role)}>
              <span className="role-label">{label}</span>
              <span className="role-description">{description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
