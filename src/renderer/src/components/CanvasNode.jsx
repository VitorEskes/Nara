const MIN_WIDTH = 240
const MIN_HEIGHT = 120

// A box in the world: position and size are in world coordinates, not screen coordinates.
export default function CanvasNode({
  id,
  type,
  x,
  y,
  w,
  h,
  layer,
  title,
  badge,
  isLinkTarget,
  onChange,
  onRaise,
  onClose,
  onLinkStart,
  children
}) {
  function move(e) {
    drag(e, (dx, dy) => onChange({ x: x + dx, y: y + dy }))
  }

  function resize(e) {
    drag(e, (dx, dy) =>
      onChange({ w: Math.max(MIN_WIDTH, w + dx), h: Math.max(MIN_HEIGHT, h + dy) })
    )
  }

  return (
    <div
      className={isLinkTarget ? 'node link-target' : 'node'}
      // App finds the node under the cursor via the DOM (elementFromPoint) and reads its id here.
      data-id={id}
      data-type={type}
      style={{ left: x, top: y, width: w, height: h, zIndex: layer }}
      // Capture: runs before any child (including xterm) gets a chance to swallow the event.
      onPointerDownCapture={onRaise}
    >
      <div className="node-bar" onPointerDown={move}>
        <div
          className="node-port"
          title="Drag onto another node to link them"
          onPointerDown={onLinkStart}
        />
        <span className="node-title">{title}</span>
        {badge && <span className="node-badge">{badge}</span>}
        <button
          className="node-close"
          title="Close"
          // Without this the pointerdown bubbles up to the bar, which captures the pointer to drag
          // and the click never reaches the button.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="node-body">{children}</div>
      <div className="node-resize" onPointerDown={resize} />
    </div>
  )
}

// Generic drag: calls onDrag(dx, dy) with the offset since the click, already in world units.
function drag(e, onDrag) {
  if (e.button !== 0) return
  const handle = e.currentTarget
  const node = handle.closest('.node')
  // Same idea as the xterm fix: on-screen size / layout size = current zoom.
  const scale = node.getBoundingClientRect().width / node.offsetWidth || 1
  const x0 = e.clientX
  const y0 = e.clientY

  handle.setPointerCapture(e.pointerId)

  function onMove(ev) {
    onDrag(Math.round((ev.clientX - x0) / scale), Math.round((ev.clientY - y0) / scale))
  }
  function onRelease() {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onRelease)
    handle.removeEventListener('pointercancel', onRelease)
  }

  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onRelease)
  handle.addEventListener('pointercancel', onRelease)
}
