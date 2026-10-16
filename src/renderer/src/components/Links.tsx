import { useEffect, useLayoutEffect, useRef, type JSX } from 'react'
import type { Box, CanvasNode, Link, NodeId, Point } from '../../../shared/types'

// The rope being pulled out of a node: its tip in world coordinates and the node under the cursor
// that could take it. `mode` is 'drag', or 'pick' once a click left it on the cursor.
export interface LinkDraft extends Point {
  from: NodeId
  mode: 'drag' | 'pick'
  target: NodeId | null
}

// A rope: its ends, its belly and the belly's velocity.
interface Rope {
  a: Point
  b: Point
  p: Point
  v: Point
}

// Links are drawn as ropes pinned between two nodes, in world coordinates inside .world. Ropes sit
// behind the nodes and their pins in the overlay above, so a pin on a node's edge isn't half
// hidden; the rope being pulled goes in the overlay whole.
//
// Each rope hangs from its midpoint, which a spring pulls toward where gravity would leave it, so
// it swings a little when a node moves. The springs run outside React: a frame loop writes the
// paths into the DOM while any rope is moving.

// How much slack a rope has, past the straight line between its ends: a little always, and more
// the longer it is. The sag follows from it, up to a limit.
const SLACK = 18
const SLACK_SHARE = 0.06
const MAX_SAG = 140
const PIN_RADIUS = 5
// The belly's spring, per second: how hard it's pulled to rest, and how fast its swing dies out.
const STIFFNESS = 140
const DAMPING = 11
// Below this, in world units and units per second, the belly counts as at rest.
const REST = 0.05

// `live` has the ids of the nodes whose agent is at work: a rope to one carries a pulse.
// `focus` has the ids of the selected nodes: the ropes to them stand out.
export default function Links({
  nodes,
  links,
  live,
  focus,
  onRemove
}: {
  nodes: CanvasNode[]
  links: Link[]
  live?: Set<NodeId>
  focus?: Set<NodeId>
  onRemove: (id: number) => void
}): JSX.Element {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const svg = useRef<SVGSVGElement>(null)
  // link id -> its rope.
  const ropes = useRef(new Map<number, Rope>())
  const frame = useRef(0)
  const ropesShown = links
    .map((l) => ({ link: l, ends: linkEnds(byId.get(l.from), byId.get(l.to)) }))
    .filter((r): r is { link: Link; ends: [Point, Point] } => r.ends !== null)

  // After every render: the ends move to where the nodes are now, and the springs take it from
  // there. Before paint, so a new rope never shows up without its path.
  useLayoutEffect(() => {
    const state = ropes.current
    const shown = new Set()
    for (const {
      link,
      ends: [a, b]
    } of ropesShown) {
      shown.add(link.id)
      const rope = state.get(link.id)
      if (rope) Object.assign(rope, { a, b })
      else state.set(link.id, { a, b, p: belly(a, b), v: { x: 0, y: 0 } })
    }
    for (const id of state.keys()) if (!shown.has(id)) state.delete(id)
    paint(svg.current, state)
    if (frame.current) return
    let last: number | null = null
    const step = (now: number): void => {
      const dt = Math.min(1 / 30, last == null ? 1 / 60 : (now - last) / 1000)
      last = now
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      let moving = false
      for (const rope of ropes.current.values()) moving = swing(rope, dt, still) || moving
      paint(svg.current, ropes.current)
      frame.current = moving ? requestAnimationFrame(step) : 0
    }
    frame.current = requestAnimationFrame(step)
  })

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <svg ref={svg} className="links" width="1" height="1">
      {ropesShown.map(({ link: l }) => (
        <g
          key={l.id}
          className="link"
          data-link={l.id}
          data-live={live?.has(l.from) || live?.has(l.to) || undefined}
          data-focus={focus?.has(l.from) || focus?.has(l.to) || undefined}
          onClick={() => onRemove(l.id)}
        >
          <title>Click to unlink</title>
          <path className="link-shadow" />
          <path className="link-line" />
          <path className="link-strand" />
          <path className="link-flow" />
          {/* Wide invisible stroke: a bigger click target than the thin line. */}
          <path className="link-hitbox" />
          <g className="link-cut">
            <circle r="9" />
            <path d="M-3 -3L3 3M3 -3L-3 3" />
          </g>
        </g>
      ))}
    </svg>
  )
}

// `draft` is the rope being pulled: from the edge of its node to the cursor, with a pin at the
// cursor end.
export function LinkPins({
  nodes,
  links,
  draft
}: {
  nodes: CanvasNode[]
  links: Link[]
  draft: LinkDraft | null
}): JSX.Element {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const source = draft && byId.get(draft.from)
  const start = source && draft && edgePoint(source, center(source), draft)
  return (
    <svg className="link-pins" width="1" height="1">
      {source && start && draft && (
        <g className="draft">
          <path className="link-draft" d={ropePath(start, draft, belly(start, draft))} />
          <circle className="draft-pin" cx={draft.x} cy={draft.y} r={PIN_RADIUS} />
        </g>
      )}
      {links.flatMap((l) => {
        const ends = linkEnds(byId.get(l.from), byId.get(l.to))
        if (!ends) return []
        return ends.map(({ x, y }, i) => (
          <g key={`${l.id}-${i}`}>
            <circle className="pin-halo" cx={x} cy={y} r={PIN_RADIUS + 3} />
            <circle cx={x} cy={y} r={PIN_RADIUS} />
            <circle className="pin-hole" cx={x} cy={y} r={PIN_RADIUS * 0.4} />
          </g>
        ))
      })}
    </svg>
  )
}

// One step of a belly's spring. Returns whether it's still moving.
function swing(rope: Rope, dt: number, still: boolean): boolean {
  const target = belly(rope.a, rope.b)
  if (still) {
    rope.p = target
    rope.v = { x: 0, y: 0 }
    return false
  }
  const dx = target.x - rope.p.x
  const dy = target.y - rope.p.y
  rope.v.x += (dx * STIFFNESS - rope.v.x * DAMPING) * dt
  rope.v.y += (dy * STIFFNESS - rope.v.y * DAMPING) * dt
  rope.p.x += rope.v.x * dt
  rope.p.y += rope.v.y * dt
  const resting =
    Math.abs(dx) < REST && Math.abs(dy) < REST && Math.hypot(rope.v.x, rope.v.y) < REST
  if (resting) {
    rope.p = target
    rope.v = { x: 0, y: 0 }
  }
  return !resting
}

// Writes each rope's path into its elements, and puts the cut mark on its belly.
function paint(svg: SVGSVGElement | null, ropes: Map<number, Rope>): void {
  if (!svg) return
  for (const [id, { a, b, p }] of ropes) {
    const group = svg.querySelector(`[data-link="${id}"]`)
    if (!group) continue
    const d = ropePath(a, b, p)
    for (const path of group.querySelectorAll(':scope > path')) path.setAttribute('d', d)
    group.querySelector('.link-cut')?.setAttribute('transform', `translate(${p.x} ${p.y})`)
  }
}

// Where the belly of a rope between a and b hangs at rest: below the middle, by how much its
// slack lets it (a parabola's sag for a rope that much longer than the span).
function belly(a: Point, b: Point): Point {
  const span = Math.hypot(b.x - a.x, b.y - a.y)
  const slack = SLACK + span * SLACK_SHARE
  const sag = Math.min(MAX_SAG, Math.sqrt((3 * span * slack) / 8))
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag }
}

// A quadratic curve from a to b that passes through the belly p halfway: its control point is
// twice as far from the chord's middle as the belly is.
function ropePath(a: Point, b: Point, p: Point): string {
  const cx = 2 * p.x - (a.x + b.x) / 2
  const cy = 2 * p.y - (a.y + b.y) / 2
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

// Where the rope meets each node: the point on the node's edge along the line between the two
// centers. Nodes that overlap enough to share a center have no line between them.
function linkEnds(a: Box | undefined, b: Box | undefined): [Point, Point] | null {
  if (!a || !b) return null
  const ca = center(a)
  const cb = center(b)
  if (ca.x === cb.x && ca.y === cb.y) return null
  return [edgePoint(a, ca, cb), edgePoint(b, cb, ca)]
}

function center(node: Box): Point {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 }
}

// Walks from the center toward `to` until it hits the edge of the node's box: whichever of the
// vertical or horizontal edges comes first.
function edgePoint(node: Box, from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const t = Math.min(
    dx ? node.w / 2 / Math.abs(dx) : Infinity,
    dy ? node.h / 2 / Math.abs(dy) : Infinity
  )
  // Past t = 1 the edge is beyond the other node's center: the boxes overlap. The pin stays at
  // the other center instead of flying past it.
  const k = Math.min(t, 1)
  return { x: from.x + dx * k, y: from.y + dy * k }
}
