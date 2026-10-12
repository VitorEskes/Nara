import { useEffect, useRef, useState } from 'react'
import {
  CLOSED,
  LINES,
  STYLE_DEFAULTS,
  boxFrom,
  bounds,
  hits,
  lineEnd,
  newSeed,
  resizeShape,
  resolveShapeStyle,
  rotation,
  round,
  strokeShape,
  styleKeys,
  textBox,
  touchesBox
} from './shapes'

// The tools that draw on the whiteboard, and the shape each one makes.
export const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'line', 'arrow'])
export const DRAW_TOOLS = new Set([...SHAPE_TOOLS, 'draw', 'text'])

// The size a shape gets from a click without a drag, in world units.
const CLICK_SIZE = { w: 140, h: 90 }
// A drag shorter than this, in screen pixels, is a click.
const CLICK_SLOP = 4
// A new point of a freehand stroke is only recorded this far from the last one, in screen pixels.
const MIN_STEP = 2
const ERASER_RADIUS = 8
// How far the arrow keys move a shape, in world units, and with Shift.
const NUDGE = 1
const NUDGE_FAR = 10
// How many steps undo goes back.
const HISTORY = 100
// Where the style for new shapes is kept between runs.
const STYLE_MEMORY = 'shape-style'

// The whiteboard of one canvas: its shapes, the ones selected, the one being drawn or written,
// the style new ones get, and undo. `camRef` is the canvas's camera; `tool` and `setTool` the tool
// in the dock. `group` lets a drag of shapes move the selected nodes too: start() before a drag,
// by(dx, dy) as it goes. Shapes and nodes are selected apart (`selection` is the nodes').
export function useWhiteboard({ saved, camRef, tool, setTool, group, clearNodes }) {
  const [shapes, setShapes] = useState(saved.shapes)
  const [selected, setSelected] = useState([])
  const [editing, setEditing] = useState(null)
  // The shape being drawn. The ref is what the handlers build on: a pointerup can arrive before
  // React renders the last move.
  const [draft, setDraftState] = useState(null)
  const draftRef = useRef(null)
  const setDraft = (next) => {
    draftRef.current = typeof next === 'function' ? next(draftRef.current) : next
    setDraftState(draftRef.current)
  }
  const [style, setStyle] = useState(recallStyle)
  const nextId = useRef(saved.shapes.reduce((max, s) => Math.max(max, s.id), 0) + 1)
  // The latest shapes, for handlers that run between renders (a drag's moves).
  const current = useRef(shapes)
  useEffect(() => {
    current.current = shapes
  })
  const past = useRef([])
  const future = useRef([])
  // The gesture under way: the tool's drag, or a move, resize or turn of shapes.
  const gesture = useRef(null)
  const clipboard = useRef(null)

  useEffect(() => {
    localStorage.setItem(STYLE_MEMORY, JSON.stringify(style))
  }, [style])

  // Keeps the shapes as they are now, so undo can come back to them.
  function remember() {
    past.current.push(current.current)
    if (past.current.length > HISTORY) past.current.shift()
    future.current = []
  }

  function change(next) {
    remember()
    current.current = typeof next === 'function' ? next(current.current) : next
    setShapes(current.current)
  }

  function undo() {
    if (!past.current.length) return
    future.current.push(current.current)
    current.current = past.current.pop()
    setShapes(current.current)
    setSelected((ids) => ids.filter((id) => current.current.some((s) => s.id === id)))
  }

  function redo() {
    if (!future.current.length) return
    past.current.push(current.current)
    current.current = future.current.pop()
    setShapes(current.current)
  }

  function update(ids, fn) {
    const set = new Set(ids)
    return current.current.map((s) => (set.has(s.id) ? fn(s) : s))
  }

  function select(ids) {
    setSelected(ids)
    if (ids.length) clearNodes()
  }

  // --- Tools: drawing a new shape, a stroke, a text; erasing.

  function toolStart(point, e) {
    const z = camRef.current.z
    if (tool === 'draw') {
      gesture.current = { kind: 'draw', points: [[round(point.x), round(point.y)]] }
      setDraft(strokeShape(gesture.current.points, { id: 'draft', style: { ...style } }))
    } else if (tool === 'erase') {
      gesture.current = { kind: 'erase', last: point, before: current.current }
      erase(point, point, ERASER_RADIUS / z)
    } else if (tool === 'text') {
      const shape = makeText(point)
      change((all) => [...all, shape])
      select([shape.id])
      setEditing(shape.id)
      setTool(null)
    } else if (SHAPE_TOOLS.has(tool)) {
      gesture.current = { kind: 'create', origin: point, screen: { x: e.clientX, y: e.clientY } }
      setDraft({
        id: 'draft',
        type: tool,
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
        angle: 0,
        seed: newSeed(),
        style: { ...style }
      })
    }
  }

  function toolMove(point, e) {
    const g = gesture.current
    if (!g) return
    const z = camRef.current.z
    if (g.kind === 'draw') {
      const [lx, ly] = g.points[g.points.length - 1]
      if (Math.hypot(point.x - lx, point.y - ly) < MIN_STEP / z) return
      // Shift draws a straight line from where the stroke started.
      g.points = e.shiftKey
        ? [g.points[0], [round(point.x), round(point.y)]]
        : [...g.points, [round(point.x), round(point.y)]]
      setDraft(strokeShape(g.points, { id: 'draft', style: { ...style } }))
    } else if (g.kind === 'erase') {
      erase(g.last, point, ERASER_RADIUS / z)
      g.last = point
    } else if (g.kind === 'create') {
      g.moved ||= Math.hypot(e.clientX - g.screen.x, e.clientY - g.screen.y) > CLICK_SLOP
      setDraft((d) => {
        if (!d) return d
        if (LINES.has(d.type)) {
          const end = lineEnd(g.origin, point, e.shiftKey)
          return {
            ...d,
            x: g.origin.x,
            y: g.origin.y,
            w: end.x - g.origin.x,
            h: end.y - g.origin.y
          }
        }
        return { ...d, ...boxFrom(g.origin, point, { square: e.shiftKey, centered: e.altKey }) }
      })
    }
  }

  function toolEnd() {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'draw') {
      setDraft(null)
      const shape = { ...strokeShape(g.points, { style: { ...style } }), id: nextId.current++ }
      change((all) => [...all, shape])
    } else if (g.kind === 'erase') {
      // The whole swipe is one step to undo.
      if (g.before !== current.current) {
        past.current.push(g.before)
        future.current = []
      }
    } else if (g.kind === 'create') {
      const d = draftRef.current
      setDraft(null)
      setTool(null)
      if (!d) return
      let shape = { ...d, id: nextId.current++ }
      if (!g.moved) {
        // A click: a line gets a usable length, a shape a usable size around the click.
        shape = LINES.has(d.type)
          ? { ...shape, w: CLICK_SIZE.w, h: 0 }
          : {
              ...shape,
              x: g.origin.x - CLICK_SIZE.w / 2,
              y: g.origin.y - CLICK_SIZE.h / 2,
              ...CLICK_SIZE
            }
      }
      shape = roundShape(shape)
      change((all) => [...all, shape])
      select([shape.id])
    }
  }

  function erase(from, to, radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / radius))
    const samples = Array.from({ length: steps + 1 }, (_, i) => ({
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps
    }))
    const kept = current.current.filter((s) => !samples.some((p) => hits(s, p, radius)))
    if (kept.length === current.current.length) return
    current.current = kept
    setShapes(kept)
    setSelected((ids) => ids.filter((id) => kept.some((s) => s.id === id)))
  }

  function makeText(point) {
    const shape = {
      id: nextId.current++,
      type: 'text',
      x: round(point.x),
      y: round(point.y - 16),
      w: 0,
      h: 0,
      angle: 0,
      text: '',
      style: { ...style }
    }
    return { ...shape, ...textBox(shape) }
  }

  // --- Selecting, moving, resizing and turning shapes.

  // A press on a shape selects it (Shift adds or takes it out) and starts moving the selection,
  // with the selected nodes.
  function onShapeDown(shape, e) {
    if (e.button !== 0 || tool) return
    e.stopPropagation()
    // No text selection while dragging, and the focus stays where it is.
    e.preventDefault()
    let ids = selected
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      ids = selected.includes(shape.id)
        ? selected.filter((id) => id !== shape.id)
        : [...selected, shape.id]
      setSelected(ids)
    } else if (!selected.includes(shape.id)) {
      ids = [shape.id]
      select(ids)
    }
    if (!ids.includes(shape.id)) return
    startDrag(e, {
      kind: 'move',
      ids,
      origins: new Map(current.current.filter((s) => ids.includes(s.id)).map((s) => [s.id, s]))
    })
    group.start()
  }

  function onShapeDoubleClick(shape, e) {
    e.stopPropagation()
    if (CLOSED.has(shape.type) || shape.type === 'text') {
      select([shape.id])
      setEditing(shape.id)
    }
  }

  // A press on one of the selected shape's handles: resize, turn, or move a line's end.
  function onHandleDown(shape, handle, e) {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    startDrag(e, { kind: 'handle', handle, origin: shape })
  }

  // Follows the pointer from anywhere until it's let go, in world coordinates.
  function startDrag(e, state) {
    const start = { x: e.clientX, y: e.clientY }
    const viewport = e.currentTarget.closest('.viewport').getBoundingClientRect()
    let recorded = false
    const world = (ev) => {
      const c = camRef.current
      return {
        x: (ev.clientX - viewport.left - c.x) / c.z,
        y: (ev.clientY - viewport.top - c.y) / c.z
      }
    }

    function onMove(ev) {
      if (!recorded) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < CLICK_SLOP) return
        remember()
        recorded = true
      }
      const z = camRef.current.z
      if (state.kind === 'move') {
        const dx = (ev.clientX - start.x) / z
        const dy = (ev.clientY - start.y) / z
        current.current = current.current.map((s) =>
          state.origins.has(s.id)
            ? {
                ...s,
                x: round(state.origins.get(s.id).x + dx),
                y: round(state.origins.get(s.id).y + dy)
              }
            : s
        )
        setShapes(current.current)
        group.by(Math.round(dx), Math.round(dy))
      } else {
        const p = world(ev)
        const s = state.origin
        let next
        if (state.handle === 'rotate') next = { ...s, angle: rotation(s, p, ev.shiftKey) }
        else if (state.handle === 'start' || state.handle === 'end') {
          const fixed =
            state.handle === 'start' ? { x: s.x + s.w, y: s.y + s.h } : { x: s.x, y: s.y }
          const end = lineEnd(fixed, p, ev.shiftKey)
          next =
            state.handle === 'start'
              ? { ...s, x: end.x, y: end.y, w: fixed.x - end.x, h: fixed.y - end.y }
              : { ...s, w: end.x - s.x, h: end.y - s.y }
        } else next = resizeShape(s, state.handle, p, ev.shiftKey)
        if (next.type === 'text' && next.fixedWidth) next = { ...next, h: textBox(next).h }
        next = roundShape(next)
        current.current = current.current.map((other) => (other.id === s.id ? next : other))
        setShapes(current.current)
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // A drag of the nodes' bar moves the selected shapes along: the canvas calls this as it starts,
  // then `moveBy` as it goes.
  const groupMove = useRef(null)
  function startGroupMove() {
    groupMove.current = selected.length
      ? {
          origins: new Map(
            current.current.filter((s) => selected.includes(s.id)).map((s) => [s.id, s])
          ),
          recorded: false
        }
      : null
  }

  function groupMoveBy(dx, dy) {
    const g = groupMove.current
    if (!g) return
    if (!g.recorded) {
      remember()
      g.recorded = true
    }
    current.current = current.current.map((s) =>
      g.origins.has(s.id)
        ? { ...s, x: g.origins.get(s.id).x + dx, y: g.origins.get(s.id).y + dy }
        : s
    )
    setShapes(current.current)
  }

  // --- Text.

  function onText(id, text) {
    current.current = current.current.map((s) => {
      if (s.id !== id) return s
      const next = { ...s, text }
      return next.type === 'text' ? { ...next, ...sizeOf(next) } : next
    })
    setShapes(current.current)
  }

  // Leaving a text: an empty one goes away; the edit becomes one step to undo.
  function onTextDone(id) {
    setEditing(null)
    const shape = current.current.find((s) => s.id === id)
    if (shape?.type === 'text' && !shape.text?.trim()) {
      current.current = current.current.filter((s) => s.id !== id)
      setShapes(current.current)
      setSelected((ids) => ids.filter((other) => other !== id))
    } else {
      remember()
    }
  }

  // --- Style and arrangement.

  const chosen = shapes.filter((s) => selected.includes(s.id))
  const shown = chosen.length ? resolveShapeStyle(chosen[0].style) : resolveShapeStyle(style)
  const keys = chosen.length
    ? [...new Set(chosen.flatMap((s) => styleKeys(s.type)))]
    : styleKeys(tool === 'draw' ? 'draw' : tool === 'text' ? 'text' : (tool ?? 'rect'))

  // The change goes to the selected shapes, and becomes the style of the next ones.
  function changeStyle(next) {
    setStyle((s) => ({ ...s, ...next }))
    if (!chosen.length) return
    change(
      update(selected, (s) => {
        const shape = { ...s, style: { ...s.style, ...next } }
        return shape.type === 'text' ? { ...shape, ...sizeOf(shape) } : shape
      })
    )
  }

  function remove() {
    if (!selected.length) return
    change(current.current.filter((s) => !selected.includes(s.id)))
    setSelected([])
  }

  function duplicate(offset = 24) {
    if (!chosen.length) return
    const copies = chosen.map((s) => ({
      ...s,
      id: nextId.current++,
      x: s.x + offset,
      y: s.y + offset,
      seed: newSeed()
    }))
    change((all) => [...all, ...copies])
    select(copies.map((s) => s.id))
  }

  // Later shapes draw on top: bringing to the front moves them to the end.
  function arrange(front) {
    if (!chosen.length) return
    const rest = current.current.filter((s) => !selected.includes(s.id))
    const moved = current.current.filter((s) => selected.includes(s.id))
    change(front ? [...rest, ...moved] : [...moved, ...rest])
  }

  function nudge(dx, dy) {
    change(update(selected, (s) => ({ ...s, x: s.x + dx, y: s.y + dy })))
  }

  function paste() {
    const copied = clipboard.current
    if (!copied?.length) return
    const copies = copied.map((s) => ({
      ...s,
      id: nextId.current++,
      x: s.x + 24,
      y: s.y + 24,
      seed: newSeed()
    }))
    clipboard.current = copies
    change((all) => [...all, ...copies])
    select(copies.map((s) => s.id))
  }

  // The keys the whiteboard answers, while nothing that takes text has the keyboard. Returns
  // whether it took the key.
  function onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey
    const run = (fn) => {
      fn()
      return true
    }
    if (mod && e.code === 'KeyZ') return run(e.shiftKey ? redo : undo)
    if (mod && e.code === 'KeyY') return run(redo)
    if (mod && e.code === 'KeyV' && clipboard.current) return run(paste)
    if (!selected.length) return false
    if (e.key === 'Delete' || e.key === 'Backspace') return run(remove)
    if (mod && e.code === 'KeyD') return run(() => duplicate())
    if (mod && e.code === 'KeyC') return run(() => (clipboard.current = chosen))
    if (mod && e.code === 'KeyX') {
      return run(() => {
        clipboard.current = chosen
        remove()
      })
    }
    if (e.key === ']') return run(() => arrange(true))
    if (e.key === '[') return run(() => arrange(false))
    const only = chosen.length === 1 && chosen[0]
    if (e.key === 'Enter' && only && (CLOSED.has(only.type) || only.type === 'text')) {
      return run(() => setEditing(only.id))
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (arrows[e.key]) {
      const step = e.shiftKey ? NUDGE_FAR : NUDGE
      return run(() => nudge(arrows[e.key][0] * step, arrows[e.key][1] * step))
    }
    return false
  }

  // A selection box picks the shapes it touches too.
  function selectInBox(box, base) {
    const inside = current.current.filter((s) => touchesBox(s, box)).map((s) => s.id)
    setSelected([...new Set([...base, ...inside])])
  }

  return {
    shapes,
    selected,
    setSelected,
    editing,
    draft,
    style: shown,
    keys,
    showStyle: DRAW_TOOLS.has(tool) || chosen.length > 0,
    changeStyle,
    actions: chosen.length
      ? { front: () => arrange(true), back: () => arrange(false), duplicate, remove }
      : null,
    toolStart,
    toolMove,
    toolEnd,
    onShapeDown,
    onShapeDoubleClick,
    onHandleDown,
    onText,
    onTextDone,
    onKeyDown,
    selectInBox,
    startGroupMove,
    groupMoveBy,
    bounds: () => current.current.map(bounds)
  }
}

// A text's box follows what's written, unless the user set its width.
function sizeOf(shape) {
  const box = textBox(shape)
  return shape.fixedWidth ? { h: box.h } : box
}

function roundShape(s) {
  return { ...s, x: round(s.x), y: round(s.y), w: round(s.w), h: round(s.h) }
}

function recallStyle() {
  try {
    return { ...STYLE_DEFAULTS, ...JSON.parse(localStorage.getItem(STYLE_MEMORY)) }
  } catch {
    return STYLE_DEFAULTS
  }
}
