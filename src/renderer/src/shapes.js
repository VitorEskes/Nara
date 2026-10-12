import rough from 'roughjs'
import { getStroke } from 'perfect-freehand'

// The whiteboard on the canvas: shapes, lines, arrows, freehand strokes and text, all in world
// coordinates, drawn over the nodes (Shapes.jsx). A shape is
//
//   { id, type, x, y, w, h, angle, style, text, points, seed }
//
// - rect, ellipse, triangle, diamond and text fill the box (x, y, w, h), turned by `angle`
//   (radians) around its center. Closed shapes can carry a label in `text`.
// - line and arrow run from (x, y) to (x + w, y + h): w and h may be negative, and they don't turn.
// - draw is a freehand stroke: `points` are [x, y] pairs relative to the box's corner, scaled with
//   the box when it's resized.
//
// `style` holds keys of the options below, so the colors follow the theme; `seed` keeps a sketched
// shape's wobble the same on every render.

export const TYPES = ['rect', 'ellipse', 'triangle', 'diamond', 'line', 'arrow', 'draw', 'text']
export const CLOSED = new Set(['rect', 'ellipse', 'triangle', 'diamond'])
export const LINES = new Set(['line', 'arrow'])

// Ink reads on either theme: it's the text color. The rest are mid tones that hold up on both.
export const COLORS = {
  ink: { label: 'Ink', color: 'var(--text)' },
  gray: { label: 'Gray', color: '#8e8e98' },
  green: { label: 'Green', color: '#3fb57f' },
  blue: { label: 'Blue', color: '#4f8ff7' },
  amber: { label: 'Amber', color: '#e9a23b' },
  red: { label: 'Red', color: '#ec6556' },
  violet: { label: 'Violet', color: '#a77bf3' }
}

export const FILLS = {
  none: { label: 'No fill' },
  tint: { label: 'Tint' },
  solid: { label: 'Solid' }
}

// Stroke widths in world units, as drawn at 100%.
export const WIDTHS = {
  s: { label: 'Thin', px: 1.5 },
  m: { label: 'Medium', px: 2.5 },
  l: { label: 'Bold', px: 4.5 }
}

export const STROKES = {
  clean: { label: 'Clean' },
  sketch: { label: 'Sketch' }
}

export const DASHES = {
  solid: { label: 'Solid' },
  dashed: { label: 'Dashed' },
  dotted: { label: 'Dotted' }
}

export const TEXT_SIZES = {
  s: { label: 'S', px: 16 },
  m: { label: 'M', px: 22 },
  l: { label: 'L', px: 32 },
  xl: { label: 'XL', px: 48 }
}

export const TEXT_FONTS = {
  sans: { label: 'Sans', family: 'var(--font-ui)' },
  hand: { label: 'Serif', family: 'var(--font-display)' },
  mono: { label: 'Mono', family: 'var(--font-mono)' }
}

const OPTIONS = {
  stroke: COLORS,
  fill: FILLS,
  width: WIDTHS,
  sketch: STROKES,
  dash: DASHES,
  size: TEXT_SIZES,
  font: TEXT_FONTS
}

export const STYLE_DEFAULTS = {
  stroke: 'ink',
  fill: 'none',
  width: 'm',
  sketch: 'clean',
  dash: 'solid',
  size: 'm',
  font: 'sans'
}

// The style with every key filled in and checked.
export function resolveShapeStyle(style = {}) {
  return Object.fromEntries(
    Object.entries(STYLE_DEFAULTS).map(([key, fallback]) => [
      key,
      Object.hasOwn(OPTIONS[key], style[key] ?? '') ? style[key] : fallback
    ])
  )
}

// The keys of a style that apply to a type of shape, for the style bar.
export function styleKeys(type) {
  if (type === 'text') return ['stroke', 'size', 'font']
  if (type === 'draw') return ['stroke', 'width']
  if (LINES.has(type)) return ['stroke', 'width', 'sketch', 'dash']
  return ['stroke', 'fill', 'width', 'sketch', 'dash', 'size', 'font']
}

export function center(s) {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 }
}

function rotate(p, c, angle) {
  if (!angle) return p
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

// A world point in the shape's own frame: as if it weren't turned.
export function toLocal(shape, p) {
  return rotate(p, center(shape), -(shape.angle ?? 0))
}

export function toWorld(shape, p) {
  return rotate(p, center(shape), shape.angle ?? 0)
}

// The outline in the shape's own frame, as points; closed shapes close back to the first.
export function outline(s) {
  const { x, y, w, h } = s
  switch (s.type) {
    case 'rect':
    case 'text':
      return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
      ]
    case 'diamond':
      return [
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2]
      ]
    case 'triangle':
      return [
        [x + w / 2, y],
        [x + w, y + h],
        [x, y + h]
      ]
    case 'ellipse':
      return Array.from({ length: 40 }, (_, i) => {
        const t = (i / 40) * Math.PI * 2
        return [x + w / 2 + (Math.cos(t) * w) / 2, y + h / 2 + (Math.sin(t) * h) / 2]
      })
    case 'line':
    case 'arrow':
      return [
        [x, y],
        [x + w, y + h]
      ]
    case 'draw':
      return (s.points ?? []).map(([px, py]) => [x + px, y + py])
    default:
      return []
  }
}

// The box around the shape as it sits on the canvas, turned or not: { x, y, w, h }.
export function bounds(s) {
  const points = outline(s).map(([px, py]) => toWorld(s, { x: px, y: py }))
  if (!points.length) return { x: s.x, y: s.y, w: 0, h: 0 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// Whether a world point is on the shape, within `reach`: on its outline, or anywhere inside one
// that's filled, labeled or a text.
export function hits(s, p, reach) {
  const local = toLocal(s, p)
  const points = outline(s)
  const width = WIDTHS[resolveShapeStyle(s.style).width].px
  const closed = CLOSED.has(s.type) || s.type === 'text'
  const solid =
    s.type === 'text' || (closed && (resolveShapeStyle(s.style).fill !== 'none' || s.text))
  if (solid && inside(points, local)) return true
  return distanceTo(points, local, closed) <= reach + width / 2
}

function inside(points, { x, y }) {
  let result = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result
  }
  return result
}

function distanceTo(points, p, closed) {
  if (points.length === 1) return Math.hypot(p.x - points[0][0], p.y - points[0][1])
  let min = Infinity
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    min = Math.min(min, segmentDistance(p, a, b))
  }
  return min
}

function segmentDistance({ x, y }, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

// Whether the shape touches a box (a selection box), in world coordinates.
export function touchesBox(s, box) {
  const b = bounds(s)
  return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y
}

// What to draw, in the shape's own frame: [{ d, kind }], where `kind` is 'stroke' (drawn with
// the stroke color) or 'fill' (filled with it, a freehand stroke's outline, an arrow's head).
// Sketched shapes come from rough.js, with the shape's seed.
const generator = rough.generator()

export function shapePaths(s) {
  const style = resolveShapeStyle(s.style)
  const width = WIDTHS[style.width].px
  const { x, y, w, h } = s

  if (s.type === 'draw') {
    const points = (s.points ?? []).map(([px, py]) => [x + px, y + py])
    if (!points.length) return []
    const stroke = getStroke(points, {
      size: width * 2.4,
      thinning: 0.55,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: true
    })
    return [{ d: polygonPath(stroke), kind: 'fill' }]
  }

  if (s.type === 'text') return []

  if (style.sketch === 'sketch') {
    const options = {
      seed: s.seed ?? 1,
      roughness: 1.1,
      bowing: 1.2,
      strokeWidth: width,
      preserveVertices: true
    }
    let drawable
    if (s.type === 'rect') drawable = generator.rectangle(x, y, w, h, options)
    else if (s.type === 'ellipse') drawable = generator.ellipse(x + w / 2, y + h / 2, w, h, options)
    else if (s.type === 'line' || s.type === 'arrow') {
      drawable = generator.line(x, y, x + w, y + h, options)
    } else drawable = generator.polygon(outline(s), options)
    const paths = generator.toPaths(drawable).map((path) => ({ d: path.d, kind: 'stroke' }))
    if (s.type === 'arrow') {
      paths.push(
        ...arrowHead(s, width)
          .map((head) => generator.toPaths(generator.linearPath(head, options))[0])
          .map((path) => ({ d: path.d, kind: 'stroke' }))
      )
    }
    return paths
  }

  if (s.type === 'rect') return [{ d: roundedRect(x, y, w, h), kind: 'stroke' }]
  if (s.type === 'ellipse') {
    const rx = w / 2
    const ry = h / 2
    return [
      {
        d: `M${x} ${y + ry}a${rx} ${ry} 0 1 0 ${w} 0a${rx} ${ry} 0 1 0 ${-w} 0z`,
        kind: 'stroke'
      }
    ]
  }
  if (s.type === 'line') return [{ d: `M${x} ${y}L${x + w} ${y + h}`, kind: 'stroke' }]
  if (s.type === 'arrow') {
    const heads = arrowHead(s, width)
      .map((head) => `M${head.map(([px, py]) => `${px} ${py}`).join('L')}`)
      .join('')
    return [{ d: `M${x} ${y}L${x + w} ${y + h}${heads}`, kind: 'stroke' }]
  }
  return [{ d: roundedPolygon(outline(s)), kind: 'stroke' }]
}

// The path of the area a closed shape fills, clean even when its stroke is sketched.
export function fillPath(s) {
  if (s.type === 'rect') return roundedRect(s.x, s.y, s.w, s.h)
  if (s.type === 'ellipse') {
    const { x, y, w, h } = s
    return `M${x} ${y + h / 2}a${w / 2} ${h / 2} 0 1 0 ${w} 0a${w / 2} ${h / 2} 0 1 0 ${-w} 0z`
  }
  return roundedPolygon(outline(s))
}

// The two strokes of an arrow's head, at the end of the line, as polylines.
function arrowHead({ x, y, w, h }, width) {
  const length = Math.hypot(w, h)
  if (!length) return []
  const size = Math.min(length * 0.4, 10 + width * 3)
  const angle = Math.atan2(h, w)
  const tip = [x + w, y + h]
  const wing = (turn) => [
    tip[0] - size * Math.cos(angle + turn),
    tip[1] - size * Math.sin(angle + turn)
  ]
  return [[wing(0.45), tip, wing(-0.45)]]
}

function roundedRect(x, y, w, h) {
  const r = Math.min(10, Math.abs(w) / 4, Math.abs(h) / 4)
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${
    y + h
  } ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
}

// A polygon with its corners slightly softened, like the rounded rectangles.
function roundedPolygon(points) {
  const n = points.length
  if (n < 3) return ''
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const [cx, cy] = points[i]
    const next = points[(i + 1) % n]
    const toPrev = Math.hypot(prev[0] - cx, prev[1] - cy)
    const toNext = Math.hypot(next[0] - cx, next[1] - cy)
    const r = Math.min(8, toPrev / 4, toNext / 4)
    const a = [cx + ((prev[0] - cx) / toPrev) * r, cy + ((prev[1] - cy) / toPrev) * r]
    const b = [cx + ((next[0] - cx) / toNext) * r, cy + ((next[1] - cy) / toNext) * r]
    d += `${i ? 'L' : 'M'}${a[0]} ${a[1]}Q${cx} ${cy} ${b[0]} ${b[1]}`
  }
  return `${d}Z`
}

// perfect-freehand's outline as a smooth closed path.
function polygonPath(points) {
  if (!points.length) return ''
  const d = points.reduce(
    (acc, [x0, y0], i, all) => {
      const [x1, y1] = all[(i + 1) % all.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...points[0], 'Q']
  )
  return `${d.join(' ')}Z`
}

// The dash pattern for a stroke of the given width.
export function dashArray(dash, width) {
  if (dash === 'dashed') return `${width * 4} ${width * 3}`
  if (dash === 'dotted') return `0 ${width * 2.4}`
  return undefined
}

// A box from two corners, any way round: what dragging out a new shape gives. With `square` the
// sides are equal (Shift); with `centered` the first point is the center (Alt).
export function boxFrom(a, b, { square = false, centered = false } = {}) {
  let dx = b.x - a.x
  let dy = b.y - a.y
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }
  if (centered) {
    return {
      x: a.x - Math.abs(dx),
      y: a.y - Math.abs(dy),
      w: Math.abs(dx) * 2,
      h: Math.abs(dy) * 2
    }
  }
  return {
    x: Math.min(a.x, a.x + dx),
    y: Math.min(a.y, a.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy)
  }
}

// A line's end, snapped to the nearest 15° when `snap` (Shift).
export function lineEnd(a, b, snap) {
  if (!snap) return b
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const step = Math.PI / 12
  const angle = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / step) * step
  return { x: a.x + Math.cos(angle) * length, y: a.y + Math.sin(angle) * length }
}

// The shape after dragging one of its handles (`edge`: n, ne, e, se, s, sw, w, nw) to `p`, a world
// point. The opposite side or corner stays put on the canvas, turned shape or not. A freehand
// stroke's points scale with its box. `keepRatio` (Shift) keeps the proportions.
export function resizeShape(s, edge, p, keepRatio) {
  const local = toLocal(s, p)
  let { x, y, w, h } = s
  let left = x
  let right = x + w
  let top = y
  let bottom = y + h
  if (edge.includes('w')) left = Math.min(local.x, right - 4)
  if (edge.includes('e')) right = Math.max(local.x, left + 4)
  if (edge.includes('n')) top = Math.min(local.y, bottom - 4)
  if (edge.includes('s')) bottom = Math.max(local.y, top + 4)
  if (keepRatio && s.w && s.h && edge.length === 2) {
    const ratio = s.w / s.h
    const nw = right - left
    const nh = bottom - top
    if (nw / nh > ratio) {
      const fixed = nh * ratio
      if (edge.includes('w')) left = right - fixed
      else right = left + fixed
    } else {
      const fixed = nw / ratio
      if (edge.includes('n')) top = bottom - fixed
      else bottom = top + fixed
    }
  }
  w = right - left
  h = bottom - top
  // The side that didn't move has to stay where it was on the canvas: resizing changes the center
  // the shape turns around, so the box is shifted back by however far that side drifted.
  const anchorLocal = {
    x: edge.includes('w') ? s.x + s.w : edge.includes('e') ? s.x : s.x + s.w / 2,
    y: edge.includes('n') ? s.y + s.h : edge.includes('s') ? s.y : s.y + s.h / 2
  }
  const before = toWorld(s, anchorLocal)
  const next = { ...s, x: left, y: top, w, h }
  const anchorNext = {
    x: edge.includes('w') ? left + w : edge.includes('e') ? left : left + w / 2,
    y: edge.includes('n') ? top + h : edge.includes('s') ? top : top + h / 2
  }
  const after = toWorld(next, anchorNext)
  next.x += before.x - after.x
  next.y += before.y - after.y
  if (s.type === 'draw' && s.points && s.w && s.h) {
    next.points = s.points.map(([px, py]) => [round((px * w) / s.w), round((py * h) / s.h)])
  }
  if (s.type === 'text') next.fixedWidth = true
  return next
}

// The angle the shape turns to while its rotation handle is dragged to `p`, snapped to 15° steps
// with `snap` (Shift).
export function rotation(s, p, snap) {
  const c = center(s)
  let angle = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2
  if (snap) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12)
  return angle
}

// The box around a freehand stroke's points, with the points made relative to it.
export function strokeShape(points, fields) {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    ...fields,
    type: 'draw',
    x: round(x),
    y: round(y),
    w: Math.max(1, round(Math.max(...xs) - x)),
    h: Math.max(1, round(Math.max(...ys) - y)),
    angle: 0,
    points: points.map(([px, py]) => [round(px - x), round(py - y)])
  }
}

// The box a text needs: as wide as its longest line and as tall as its lines, or, once the user
// has set its width (`fixedWidth`), as tall as its words wrapped to that width. Measured on a
// canvas in the font the text is drawn in.
const LINE_HEIGHT = 1.3
const TEXT_PAD = 4
const FONT_NAMES = { sans: '"Geist Sans"', hand: '"Shippori Mincho B1"', mono: '"Geist Mono"' }
let measurer = null

export function textBox(shape) {
  const style = resolveShapeStyle(shape.style)
  const px = TEXT_SIZES[style.size].px
  measurer ??= document.createElement('canvas').getContext('2d')
  measurer.font = `${px}px ${FONT_NAMES[style.font]}`
  const lines = (shape.text || 'Text').split('\n')
  const lineHeight = px * LINE_HEIGHT
  if (shape.fixedWidth) {
    const room = Math.max(1, shape.w - TEXT_PAD * 2)
    let count = 0
    for (const line of lines) {
      let width = 0
      count++
      for (const word of line.split(/(\s+)/)) {
        const size = measurer.measureText(word).width
        if (width + size > room && width > 0 && word.trim()) {
          count++
          width = size
        } else width += size
      }
    }
    return { w: shape.w, h: Math.ceil(count * lineHeight + TEXT_PAD * 2) }
  }
  const widest = Math.max(...lines.map((line) => measurer.measureText(line || ' ').width))
  return {
    w: Math.ceil(widest + TEXT_PAD * 2 + 2),
    h: Math.ceil(lines.length * lineHeight + TEXT_PAD * 2)
  }
}

export function round(value) {
  return Math.round(value * 10) / 10
}

export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}
