import { useEffect, useRef, useState } from 'react'
import { ChevronIcon, HexIcon, SparkIcon } from './icons'
import { AGENTS } from '../../../shared/agents'
import { ROLES } from '../../../shared/roles'

const ICONS = { claude: SparkIcon, codex: HexIcon }

// Dock button that opens an agent. An agent that takes Nara's prompt first asks for a role, in a
// menu above the button; the others open right away. onCreate gets the role key, or
// undefined for no role. The menu works from the keyboard: arrows move, Enter picks, Escape
// closes, and the digits pick a role directly.
export default function AgentButton({ agent, onCreate }) {
  const { label, prompt } = AGENTS[agent]
  const Icon = ICONS[agent] ?? SparkIcon
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const menu = useRef(null)

  // A click anywhere else or Escape closes the menu. Capture, because some parts of a node (its
  // port, its close button) stop the pointerdown before it bubbles up to the document.
  useEffect(() => {
    if (!open) return
    menu.current.querySelector('button').focus()
    function onPointerDown(e) {
      if (!root.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  function choose(role) {
    setOpen(false)
    onCreate(role)
  }

  const content = (
    <>
      <Icon />
      <span className="dock-label">{label}</span>
    </>
  )

  if (!prompt) {
    return (
      <button className="dock-button" data-tip={label} onClick={() => onCreate()}>
        {content}
      </button>
    )
  }

  const options = [
    [undefined, { label: 'No role', description: 'Knows how Nara works, nothing more' }],
    ...Object.entries(ROLES)
  ]

  function onMenuKeyDown(e) {
    const items = [...menu.current.querySelectorAll('button')]
    const index = items.indexOf(document.activeElement)
    const digit = Number(e.key)
    if (e.key === 'Escape') {
      setOpen(false)
      root.current.querySelector('.dock-button').focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length].focus()
    } else if (digit >= 1 && digit <= options.length) {
      choose(options[digit - 1][0])
    } else {
      return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="agent-button" ref={root}>
      <button
        className="dock-button"
        data-tip={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {content}
        <ChevronIcon size={14} className="chevron" />
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          aria-label={`Open ${label} as`}
          ref={menu}
          onKeyDown={onMenuKeyDown}
        >
          <div className="menu-heading">Open {label} as</div>
          {options.map(([role, { label, description }], i) => (
            <button
              key={role ?? 'none'}
              className="menu-item"
              role="menuitem"
              data-role={role}
              onClick={() => choose(role)}
            >
              <span className="role-dot" />
              <span className="menu-text">
                <span className="menu-label">{label}</span>
                <span className="menu-description">{description}</span>
              </span>
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
