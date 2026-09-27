// Geometry for freehand strokes. A stroke is { id, width, points: [[x, y], ...] }, all in world
// coordinates.

// SVG path through the points. Each point becomes the control of a quadratic curve that ends
// halfway to the next one, which smooths the corners of the raw mouse samples. A single point
// (a click) turns into a dot thanks to the round cap.
export function strokePath(points) {
  const [[x0, y0]] = points
  if (points.length === 1) return `M${x0} ${y0}L${x0} ${y0}`
  let d = `M${x0} ${y0}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]
    const [nx, ny] = points[i + 1]
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
  }
  const [lx, ly] = points[points.length - 1]
  return `${d}L${lx} ${ly}`
}

// Whether an eraser of the given radius, moving in a straight line from `from` to `to`, touches
// the stroke. The path is checked every `radius`, so a quick swipe can't jump over a thin stroke.
export function touches(stroke, from, to, radius) {
  const reach = radius + stroke.width / 2
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / radius))
  for (let i = 0; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    if (distanceToStroke(stroke.points, x, y) <= reach) return true
  }
  return false
}

function distanceToStroke(points, x, y) {
  if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1])
  let min = Infinity
  for (let i = 1; i < points.length; i++) {
    min = Math.min(min, distanceToSegment(x, y, points[i - 1], points[i]))
  }
  return min
}

// Projects the point onto the segment's line and clamps it to the segment's ends.
function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}
