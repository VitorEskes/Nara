import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type JSX,
  type PointerEvent,
  type ReactNode,
  type SetStateAction
} from 'react'
import type { Box, Camera, Point } from '../../../shared/types'

// What a drag on the canvas does: pan, a tool's stroke, or a selection box.
type Drag = 'pan' | 'tool' | { start: Point; additive: boolean; moved?: boolean } | null
type ToolEvent = Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'shiftKey' | 'altKey'>

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4
const GRID = 24
// Every MAJOR-th dot is a brighter one, which keeps a sense of scale when zoomed far out.
const MAJOR = 5

// `children` live in the world, `overlay` too but drawn above them, never taking the pointer.
//
// - A left-button drag on empty canvas draws a selection box (onSelectBox, in world coordinates;
//   Shift or Ctrl adds to the selection).
// - The camera pans from anywhere: right or middle button, Space held (`grab`), the hand tool, or
//   the wheel, except over the node that has the keyboard and scrolls itself. Ctrl+wheel zooms.
// - With a drawing `tool` on, nodes ignore the pointer and drags go to onToolStart/Move/End.
// - While `locked` (a browser fills the screen), the camera stays put.
export default function Canvas({
  cam,
  setCam,
  tool,
  grab,
  locked,
  onToolStart,
  onToolMove,
  onToolEnd,
  onSelectBox,
  overlay,
  children
}: {
  cam: Camera
  setCam: Dispatch<SetStateAction<Camera>>
  tool: string | null
  grab: boolean
  locked: boolean
  onToolStart: (point: Point, e: ToolEvent) => void
  onToolMove: (point: Point, e: ToolEvent) => void
  onToolEnd: () => void
  onSelectBox: (box: Box, additive: boolean, first: boolean) => void
  overlay?: ReactNode
  children?: ReactNode
}): JSX.Element {
  const viewport = useRef<HTMLDivElement>(null)
  // What the current drag does: 'pan', 'tool', a selection box, or nothing.
  const drag = useRef<Drag>(null)
  // The selection box being drawn, in viewport pixels.
  const [box, setBox] = useState<Box | null>(null)
  // The wheel's listener is added once and reads this.
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  }, [locked])

  // A point in viewport pixels, counted from its top-left corner.
  function local(e: Pick<MouseEvent, 'clientX' | 'clientY'>): Point {
    const rect = (viewport.current as HTMLDivElement).getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // world = (screen - (x, y)) / z
  function toWorld({ x, y }: Point): Point {
    return { x: (x - cam.x) / cam.z, y: (y - cam.y) / cam.z }
  }

  // Runs before any node sees the press, so a pan can start on top of one and the node stays
  // put.
  function onPointerDownCapture(e: PointerEvent<HTMLDivElement>): void {
    if (locked) return
    const overText = (e.target as Element).closest('.xterm')
    const pans = tool === 'hand' || grab || e.button === 2 || (e.button === 1 && !overText)
    if (!pans) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = 'pan'
    e.currentTarget.classList.add('panning')
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (locked || e.target !== e.currentTarget || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // No text selection and no focus change from this press: a text just made by the tool keeps
    // the keyboard.
    e.preventDefault()
    // The press doesn't move the focus, so a terminal, note or page clicked into earlier would
    // keep the keyboard, and the canvas's keys would go to it. Leaving it is what a click on the
    // empty canvas means; a drawing tool's own text keeps it (below).
    if (!tool || tool === 'hand') leaveNode()
    if (tool && tool !== 'hand') {
      drag.current = 'tool'
      onToolStart(toWorld(local(e)), e)
      return
    }
    drag.current = { start: local(e), additive: e.shiftKey || e.ctrlKey || e.metaKey }
    e.currentTarget.classList.add('selecting')
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const current = drag.current
    if (current === 'pan') {
      setCam((c) => ({ ...c, x: c.x + e.movementX, y: c.y + e.movementY }))
    } else if (current === 'tool') {
      // The browser hands over one pointermove per frame; the coalesced events are every sample
      // in between, which keeps quick strokes from turning into straight segments.
      const samples: ToolEvent[] = e.nativeEvent.getCoalescedEvents?.() ?? [e]
      for (const sample of samples) {
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

  function onPointerUp(e: PointerEvent<HTMLDivElement>): void {
    if (drag.current === 'tool') onToolEnd()
    drag.current = null
    setBox(null)
    e.currentTarget.classList.remove('panning', 'selecting')
  }

  useEffect(() => {
    const el = viewport.current as HTMLDivElement
    const onWheel = (e: WheelEvent): void => {
      if (lockedRef.current) return
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
      } else if (!scrollsItself(e.target as Element)) {
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
      data-locked={locked || undefined}
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

// Takes the keyboard back from whatever node had it: a terminal, a note, a browser's page.
function leaveNode(): void {
  const active = document.activeElement as HTMLElement | null
  if (active?.closest?.('.node, .shape-label, .shapes')) active.blur()
}

// Whether the wheel belongs to what's under the pointer instead of the camera: only inside the
// node that has the keyboard, so passing over the others never stops the camera. There, a
// terminal scrolls its history (or the program inside does), and a note scrolls if its text
// overflows.
function scrollsItself(target: Element): boolean {
  const node = target.closest('.node')
  if (!node?.contains(document.activeElement)) return false
  if (target.closest('.xterm')) return true
  const note = target.closest('.note-text')
  return Boolean(note && note.scrollHeight > note.clientHeight)
}
