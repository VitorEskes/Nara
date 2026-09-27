// Lines between nodes, drawn in an <svg> inside .world: coordinates are already in world space,
// so pan and zoom come for free from the camera transform.
// It sits behind the nodes (z-index 0) and connects center to center: the part that would cross
// each node stays hidden, and the line seems to start at the edge without computing the edge.
export default function Links({ nodes, links, draft, onRemove }) {
  const centers = new Map(
    nodes.map((node) => [node.id, { x: node.x + node.w / 2, y: node.y + node.h / 2 }])
  )

  return (
    <svg className="links" width="1" height="1">
      {links.map((l) => {
        const a = centers.get(l.from)
        const b = centers.get(l.to)
        if (!a || !b) return null
        return (
          <g key={l.id} className="link" onClick={() => onRemove(l.id)}>
            <title>Click to unlink</title>
            {/* Wide invisible stroke: a bigger click target than the thin line. */}
            <line className="link-hitbox" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line className="link-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          </g>
        )
      })}

      {draft && centers.has(draft.from) && (
        <line
          className="link-draft"
          x1={centers.get(draft.from).x}
          y1={centers.get(draft.from).y}
          x2={draft.x}
          y2={draft.y}
        />
      )}
    </svg>
  )
}
