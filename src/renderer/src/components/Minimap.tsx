import { useRef, useState, type JSX, type PointerEvent } from 'react'
import { PAPERS, resolveStyle } from '../nodeStyle'
import type { Box, Camera, CanvasNode, Link, Point } from '../../../shared/types'

// Height of a node's bar in the miniature, in world units, like the real one.
const BAR = 36

// The whole canvas in miniature, drawn like the cards on the overview: each node where it sits,
// each link as a line between centers, and the camera as a rectangle over them. Clicking or
// dragging on it moves the camera there; onLook gets the world point to center on. `size` is
// the viewport's size in pixels.
export default function Minimap({
  nodes,
  links,
  cam,
  size,
  onLook
}: {
  nodes: CanvasNode[]
  links: Link[]
  cam: Camera
  size: { w: number; h: number }
  onLook: (point: Point) => void
}): JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  // While dragging, the frame stays as it was when the drag began: the camera is part of what
  // the frame fits, and a frame that moved with it would slide away under the pointer.
  const [frozen, setFrozen] = useState<Box | null>(null)

  const view = { x: -cam.x / cam.z, y: -cam.y / cam.z, w: size.w / cam.z, h: size.h / cam.z }
  const frame = frozen ?? fit([...nodes, view])

  function look(e: PointerEvent): void {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    onLook(point)
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setFrozen(frame)
    look(e)
  }

  function onPointerMove(e: PointerEvent): void {
    if (frozen) look(e)
  }

  function onPointerUp(): void {
    setFrozen(null)
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const center = (n: Box): [number, number] => [n.x + n.w / 2, n.y + n.h / 2]

  return (
    <div className="floating minimap" aria-label="Minimap">
      <svg
        ref={svg}
        viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {links.map(({ id, from, to }) => {
          const a = byId.get(from)
          const b = byId.get(to)
          if (!a || !b) return null
          const [x1, y1] = center(a)
          const [x2, y2] = center(b)
          return <line key={id} className="preview-link" x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
        {nodes.map((n) =>
          n.type === 'note' ? (
            <rect
              key={n.id}
              className="preview-note"
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="6"
              vectorEffect="non-scaling-stroke"
              style={{ fill: PAPERS[resolveStyle(n.style).paper].color }}
            />
          ) : (
            <g key={n.id}>
              <rect className="preview-terminal" x={n.x} y={n.y} width={n.w} height={n.h} rx="12" />
              <rect className="preview-bar" x={n.x} y={n.y} width={n.w} height={BAR} rx="12" />
            </g>
          )
        )}
        <rect
          className="minimap-view"
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          rx={8 / cam.z}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

// The box around every given box, with some room on each side.
function fit(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  const pad = Math.max(right - left, bottom - top) * 0.08
  return {
    x: left - pad,
    y: top - pad,
    w: Math.max(1, right - left + pad * 2),
    h: Math.max(1, bottom - top + pad * 2)
  }
}
