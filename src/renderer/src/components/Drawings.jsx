import { memo } from 'react'
import { strokePath } from '../drawing'

// Freehand strokes, in an <svg> drawn over the nodes. As with the links, coordinates are in world
// space and the camera transform handles pan and zoom; the width scales with the zoom too, since
// a stroke is part of the canvas. The svg ignores the pointer, so a stroke over a terminal never
// gets in the way of using it.
export default function Drawings({ strokes, sketch }) {
  return (
    <svg className="drawings" width="1" height="1">
      {strokes.map((stroke) => (
        <Stroke key={stroke.id} points={stroke.points} width={stroke.width} />
      ))}
      {sketch && <Stroke points={sketch.points} width={sketch.width} />}
    </svg>
  )
}

// The canvas re-renders on every drag; memo keeps finished strokes from rebuilding their path.
const Stroke = memo(function Stroke({ points, width }) {
  return <path d={strokePath(points)} strokeWidth={width} />
})
