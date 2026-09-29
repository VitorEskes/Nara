import { useEffect, useRef } from 'react'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const GRID = 40

// `children` live in the world, `overlay` too but drawn above them (and never taking the pointer).
// With a `tool` on, the nodes ignore the pointer and a left-button drag anywhere goes to
// onToolStart/Move/End, in world coordinates; the other buttons and the wheel still pan.
export default function Canvas({
  cam,
  setCam,
  tool,
  onToolStart,
  onToolMove,
  onToolEnd,
  overlay,
  children
}) {
  const viewport = useRef(null)
  // What the current drag does: 'pan', 'tool' or nothing.
  const drag = useRef(null)

  // world = (screen - (x, y)) / z, with screen counted from the viewport's corner.
  function toWorld(e) {
    const rect = viewport.current.getBoundingClientRect()
    return { x: (e.clientX - rect.left - cam.x) / cam.z, y: (e.clientY - rect.top - cam.y) / cam.z }
  }

  function onPointerDown(e) {
    if (e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool && e.button === 0) {
      drag.current = 'tool'
      onToolStart(toWorld(e))
    } else {
      drag.current = 'pan'
    }
  }

  function onPointerMove(e) {
    if (drag.current === 'pan') {
      setCam((c) => ({ ...c, x: c.x + e.movementX, y: c.y + e.movementY }))
    } else if (drag.current === 'tool') {
      // The browser hands over one pointermove per frame; the coalesced events are every sample
      // in between, which keeps quick strokes from turning into straight segments.
      for (const sample of e.nativeEvent.getCoalescedEvents?.() ?? [e]) onToolMove(toWorld(sample))
    }
  }

  function onPointerUp() {
    if (drag.current === 'tool') onToolEnd()
    drag.current = null
  }

  useEffect(() => {
    const el = viewport.current
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        setCam((c) => {
          const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.z * Math.exp(-e.deltaY * 0.001)))
          const wx = (mx - c.x) / c.z
          const wy = (my - c.y) / c.z
          return { x: mx - wx * z, y: my - wy * z, z }
        })
      } else if (e.target === el || e.target.closest('.links')) {
        e.preventDefault()
        setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setCam])

  const transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`

  return (
    <div
      ref={viewport}
      className="viewport"
      data-tool={tool || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        backgroundSize: `${GRID * cam.z}px ${GRID * cam.z}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`
      }}
    >
      <div className="world" style={{ transform }}>
        {children}
      </div>
      <div className="world world-overlay" style={{ transform }}>
        {overlay}
      </div>
    </div>
  )
}
