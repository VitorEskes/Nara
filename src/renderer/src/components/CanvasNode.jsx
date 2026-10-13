import { useState } from 'react'
import { CloseIcon } from './icons'
import NodeIcon from './NodeIcon'
import ContextRing from './ContextRing'
import { STATE_LABELS } from '../agentStatus'
import { contextShare } from '../telemetry'
import { TERMINAL_THEMES } from '../terminalThemes'

const MIN_WIDTH = 240
const MIN_HEIGHT = 120

// The handles around a node: each edge moves only that edge, each corner the two that meet there.
const EDGES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

// A box in the world: position and size are in world coordinates, not screen coordinates.
// `label` is the name on the bar; `agent` ({ key, label }) and `role` ({ label, tone }) go on it
// too. `look` is a terminal's (terminalLook): its colors, tone and icon. `paper` is a note's color
// (`paperDark` when it's a dark one). An agent's `status` (status.js) and `usage` (telemetry.js)
// show as its state and how full its context is.
// and `linked` says whether any string is pinned to it. While a string is
// being pulled, `dimmed` marks a node it can't be tied to; `highlighted` lights the node up while
// its row in the side panel's connections is hovered.
export default function CanvasNode({
  id,
  type,
  x,
  y,
  w,
  h,
  layer,
  label,
  agent,
  role,
  look,
  paper,
  paperDark,
  status,
  usage,
  linked,
  selected,
  isLinkTarget,
  dimmed,
  highlighted,
  onChange,
  onRaise,
  onMoveStart,
  onMoveBy,
  onClose,
  onLinkStart,
  children
}) {
  const [dragging, setDragging] = useState(false)
  // Closing plays a short animation first; the node goes away when it ends.
  const [leaving, setLeaving] = useState(false)

  // The bar moves the node, and with it the rest of the selection, which Workspace tracks.
  function move(e) {
    if (e.button !== 0) return
    onMoveStart()
    drag(e, setDragging, onMoveBy)
  }

  function resize(e, edge) {
    drag(e, setDragging, (dx, dy) => onChange(resized({ x, y, w, h }, edge, dx, dy)))
  }

  // A terminal is an island in its theme's colors, on the cream canvas or the dark one.
  const theme = look && TERMINAL_THEMES[look.theme]
  const className = [
    'node',
    theme && 'island',
    selected && 'selected',
    isLinkTarget && 'link-target',
    dimmed && 'dimmed',
    highlighted && 'highlighted',
    dragging && 'dragging',
    leaving && 'leaving'
  ]
  return (
    <div
      className={className.filter(Boolean).join(' ')}
      // App finds the node under the cursor via the DOM (elementFromPoint) and reads its id here.
      data-id={id}
      data-type={type}
      data-scheme={theme?.light ? 'light' : undefined}
      data-paper={paperDark ? 'dark' : undefined}
      data-tone={look?.tone ?? undefined}
      role="group"
      aria-label={label}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: layer,
        '--paper': paper,
        '--terminal': theme?.colors.background,
        '--terminal-bar': theme?.bar,
        '--terminal-bar-focus': theme?.barFocus
      }}
      // Capture: runs before any child (including xterm) gets a chance to swallow the event.
      onPointerDownCapture={onRaise}
      onAnimationEnd={(e) => e.animationName === 'node-out' && onClose()}
    >
      <div className="node-bar" onPointerDown={move}>
        <div
          className={linked ? 'node-port linked' : 'node-port'}
          title="Drag onto another node to connect them, or click and then pick one"
          onPointerDown={onLinkStart}
        />
        <NodeIcon type={type} agent={agent?.key} icon={look?.icon} className="node-icon" />
        <span className="node-title">{label}</span>
        {/* Unless the node is named after its agent already. */}
        {agent && label !== agent.label && <span className="node-agent">{agent.label}</span>}
        {role && (
          <span className="role-pill" data-tone={role.tone}>
            {role.label}
          </span>
        )}
        {status && status.state !== 'idle' && (
          <span className="node-state" data-state={status.state} title={STATE_LABELS[status.state]}>
            <span className="state-dot" />
            <span className="node-state-label">{STATE_LABELS[status.state]}</span>
          </span>
        )}
        {usage?.window > 0 && <ContextRing share={contextShare(usage)} size={16} />}
        <button
          className="icon-button small node-close"
          title="Close"
          aria-label={`Close ${label}`}
          // Without this the pointerdown bubbles up to the bar, which captures the pointer to drag
          // and the click never reaches the button.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setLeaving(true)}
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="node-body">{children}</div>
      {EDGES.map((edge) => (
        <div
          key={edge}
          className="node-handle"
          data-edge={edge}
          onPointerDown={(e) => resize(e, edge)}
        />
      ))}
    </div>
  )
}

// The box after dragging `edge` by (dx, dy). The far side stays put: dragging the top edge up
// grows the node upward, and at the minimum size the edge stops instead of pushing the node.
function resized(box, edge, dx, dy) {
  const next = { ...box }
  if (edge.includes('e')) next.w = Math.max(MIN_WIDTH, box.w + dx)
  if (edge.includes('s')) next.h = Math.max(MIN_HEIGHT, box.h + dy)
  if (edge.includes('w')) {
    next.w = Math.max(MIN_WIDTH, box.w - dx)
    next.x = box.x + box.w - next.w
  }
  if (edge.includes('n')) {
    next.h = Math.max(MIN_HEIGHT, box.h - dy)
    next.y = box.y + box.h - next.h
  }
  return next
}

// Generic drag: calls onDrag(dx, dy) with the offset since the click, already in world units.
// setDragging is told when the drag starts and ends, for the lifted look.
function drag(e, setDragging, onDrag) {
  if (e.button !== 0) return
  const handle = e.currentTarget
  const node = handle.closest('.node')
  // Same idea as the xterm fix: on-screen size / layout size = current zoom.
  const scale = node.getBoundingClientRect().width / node.offsetWidth || 1
  const x0 = e.clientX
  const y0 = e.clientY

  handle.setPointerCapture(e.pointerId)
  setDragging(true)

  function onMove(ev) {
    onDrag(Math.round((ev.clientX - x0) / scale), Math.round((ev.clientY - y0) / scale))
  }
  function onRelease() {
    setDragging(false)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onRelease)
    handle.removeEventListener('pointercancel', onRelease)
  }

  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onRelease)
  handle.addEventListener('pointercancel', onRelease)
}
