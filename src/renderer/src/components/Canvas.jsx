import { useEffect, useRef, useState } from 'react'

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4
const GRID = 24
// Every MAJOR-th dot is a brighter one, which keeps a sense of scale when zoomed far out.
const MAJOR = 5

// `children` live in the world, `overlay` too but drawn above them (and never taking the pointer).
//
// The pointer, as on a desktop:
// - A left-button drag on empty canvas draws a selection box; onSelectBox gets the box in world
//   coordinates as it changes, and whether it adds to the selection (with Shift or Ctrl held; a
//   plain press on the canvas has already cleared it).
// - The camera also pans from anywhere, over nodes too: dragging with the right button, with the
//   middle one (except over a terminal's text, where it pastes), with Space held (`grab`), or
//   with the hand tool. The wheel (two fingers on a touchpad) pans too, over nodes as well, except
//   over the node that has the keyboard when it scrolls itself: a terminal clicked into, or a note
//   being written with more text than fits. Ctrl+wheel (a pinch) zooms anywhere.
// - With a drawing `tool` on (the whiteboard's, or the eraser), the nodes ignore the pointer and a
//   left-button drag anywhere goes to onToolStart/Move/End, in world coordinates, with the event
//   for its modifier keys.
export default function Canvas({
  cam,
  setCam,
  tool,
  grab,
  onToolStart,
  onToolMove,
  onToolEnd,
  onSelectBox,
  overlay,
  children
}) {
  const viewport = useRef(null)
  // What the current drag does: 'pan', 'tool', a selection box, or nothing.
  const drag = useRef(null)
  // The selection box being drawn, in viewport pixels.
  const [box, setBox] = useState(null)

  // A point in viewport pixels, counted from its top-left corner.
  function local(e) {
    const rect = viewport.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // world = (screen - (x, y)) / z
  function toWorld({ x, y }) {
    return { x: (x - cam.x) / cam.z, y: (y - cam.y) / cam.z }
  }

  // Runs before any node sees the press, so a pan can start on top of one and the node stays
  // put.
  function onPointerDownCapture(e) {
    const overText = e.target.closest('.xterm')
    const pans = tool === 'hand' || grab || e.button === 2 || (e.button === 1 && !overText)
    if (!pans) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = 'pan'
    e.currentTarget.classList.add('panning')
  }

  function onPointerDown(e) {
    if (e.target !== e.currentTarget || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // No text selection and no focus change from this press: a text just made by the tool keeps
    // the keyboard.
    e.preventDefault()
    if (tool && tool !== 'hand') {
      drag.current = 'tool'
      onToolStart(toWorld(local(e)), e)
      return
    }
    drag.current = { start: local(e), additive: e.shiftKey || e.ctrlKey || e.metaKey }
  }

  function onPointerMove(e) {
    const current = drag.current
    if (current === 'pan') {
      setCam((c) => ({ ...c, x: c.x + e.movementX, y: c.y + e.movementY }))
    } else if (current === 'tool') {
      // The browser hands over one pointermove per frame; the coalesced events are every sample
      // in between, which keeps quick strokes from turning into straight segments.
      for (const sample of e.nativeEvent.getCoalescedEvents?.() ?? [e]) {
        onToolMove(toWorld(local(sample)), sample)
      }
    } else if (current) {
      const { start, additive } = current
      const end = local(e)
      const next = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y)
      }
      setBox(next)
      const from = toWorld(next)
      onSelectBox({ ...from, w: next.w / cam.z, h: next.h / cam.z }, additive, !current.moved)
      current.moved = true
    }
  }

  function onPointerUp(e) {
    if (drag.current === 'tool') onToolEnd()
    drag.current = null
    setBox(null)
    e.currentTarget.classList.remove('panning')
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
      } else if (!scrollsItself(e.target)) {
        e.preventDefault()
        e.stopPropagation()
        setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
      }
    }
    // Capture, so the camera gets the wheel before a terminal under the pointer can scroll its
    // history with it.
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [setCam])

  const transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`
  const minor = GRID * cam.z
  const major = minor * MAJOR
  // The small dots fade out between 40% and 25% zoom, before they get close enough to blur.
  const minorAlpha = Math.min(1, Math.max(0, (cam.z - 0.25) / 0.15)) * 7

  return (
    <div
      ref={viewport}
      className="viewport"
      data-tool={tool || undefined}
      data-grab={grab || undefined}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // The right button pans; there's no menu for it to open.
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundSize: `${major}px ${major}px, ${minor}px ${minor}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`,
        '--dot-minor': `${minorAlpha}%`
      }}
    >
      <div className="world" style={{ transform }}>
        {children}
      </div>
      <div className="world world-overlay" style={{ transform }}>
        {overlay}
      </div>
      {box && (
        <div className="marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
      )}
    </div>
  )
}

// Whether the wheel belongs to what's under the pointer instead of the camera: only inside the
// node that has the keyboard, so passing over the others never stops the camera. There, a
// terminal scrolls its history (or the program inside does), and a note scrolls if its text
// overflows.
function scrollsItself(target) {
  const node = target.closest('.node')
  if (!node?.contains(document.activeElement)) return false
  if (target.closest('.xterm')) return true
  const note = target.closest('.note-text')
  return Boolean(note && note.scrollHeight > note.clientHeight)
}
