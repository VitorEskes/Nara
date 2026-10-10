// Links look like a string pinned between two nodes. Everything is drawn in world coordinates
// inside .world, so pan and zoom come for free from the camera transform.
//
// The string sits behind the nodes (z-index 0), and its pins go in the overlay, above them: a pin
// sits on the node's edge, and half of it would be hidden under the node otherwise. The string
// being pulled goes in the overlay too, whole: it has to stay in sight over any node it crosses.

// How far a string sags below the straight line, as a share of its length, and at most.
const SAG = 0.2
const MAX_SAG = 120
const PIN_RADIUS = 5

export default function Links({ nodes, links, onRemove }) {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  return (
    <svg className="links" width="1" height="1">
      {links.map((l) => {
        const ends = linkEnds(byId.get(l.from), byId.get(l.to))
        if (!ends) return null
        const d = stringPath(...ends)
        return (
          <g key={l.id} className="link" onClick={() => onRemove(l.id)}>
            <title>Click to unlink</title>
            {/* Wide invisible stroke: a bigger click target than the thin line. */}
            <path className="link-hitbox" d={d} />
            <path className="link-line" d={d} />
          </g>
        )
      })}
    </svg>
  )
}

// `draft` is the string being pulled: from the edge of its node to the cursor, with a pin at the
// cursor end.
export function LinkPins({ nodes, links, draft }) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const source = draft && byId.get(draft.from)
  const start = source && edgePoint(source, center(source), draft)
  return (
    <svg className="link-pins" width="1" height="1">
      {source && (
        <g className="draft">
          <path className="link-draft" d={stringPath(start, draft)} />
          <circle className="draft-pin" cx={draft.x} cy={draft.y} r={PIN_RADIUS} />
        </g>
      )}
      {links.flatMap((l) => {
        const ends = linkEnds(byId.get(l.from), byId.get(l.to))
        if (!ends) return []
        return ends.map(({ x, y }, i) => (
          <g key={`${l.id}-${i}`}>
            <circle cx={x} cy={y} r={PIN_RADIUS} />
            <circle className="pin-hole" cx={x} cy={y} r={PIN_RADIUS * 0.4} />
          </g>
        ))
      })}
    </svg>
  )
}

// Where the string meets each node: the point on the node's edge along the line between the two
// centers. Nodes that overlap enough to share a center have no line between them.
function linkEnds(a, b) {
  if (!a || !b) return null
  const ca = center(a)
  const cb = center(b)
  if (ca.x === cb.x && ca.y === cb.y) return null
  return [edgePoint(a, ca, cb), edgePoint(b, cb, ca)]
}

function center(node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 }
}

// Walks from the center toward `to` until it hits the edge of the node's box: whichever of the
// vertical or horizontal edges comes first.
function edgePoint(node, from, to) {
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

// A quadratic curve whose control point hangs below the midpoint, like a string under gravity.
function stringPath(a, b) {
  const sag = Math.min(MAX_SAG, Math.hypot(b.x - a.x, b.y - a.y) * SAG)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2 + sag
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}
