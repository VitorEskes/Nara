import { memo, useEffect, useRef } from 'react'
import {
  CLOSED,
  COLORS,
  LINES,
  TEXT_FONTS,
  TEXT_SIZES,
  WIDTHS,
  center,
  dashArray,
  fillPath,
  resolveShapeStyle,
  shapePaths
} from '../shapes'

// The whiteboard (shapes.js), in an <svg> drawn over the nodes in world coordinates; the camera
// transform handles pan and zoom. The svg ignores the pointer and each shape takes it only where
// it's drawn (or filled), so the space between shapes still reaches the nodes underneath.
// `selected` is a Set of shape ids; `editing` the id of the one whose text is being written.
// `zoom` keeps the handles the same size on screen.
export default function Shapes({
  shapes,
  draft,
  selected,
  editing,
  zoom,
  onShapeDown,
  onShapeDoubleClick,
  onHandleDown,
  onText,
  onTextDone
}) {
  const single = selected.size === 1 ? shapes.find((s) => selected.has(s.id)) : null
  return (
    <svg className="shapes" width="1" height="1">
      {shapes.map((shape) => (
        <Shape
          key={shape.id}
          shape={shape}
          editing={editing === shape.id}
          onDown={onShapeDown}
          onDoubleClick={onShapeDoubleClick}
          onText={onText}
          onTextDone={onTextDone}
        />
      ))}
      {draft && <Shape shape={draft} preview />}
      {[...selected].map((id) => {
        const shape = shapes.find((s) => s.id === id)
        return shape && shape !== single ? <Outline key={id} shape={shape} zoom={zoom} /> : null
      })}
      {single && editing !== single.id && (
        <Frame shape={single} zoom={zoom} onHandleDown={onHandleDown} />
      )}
    </svg>
  )
}

// The canvas re-renders on every drag; memo keeps the shapes that didn't change from redrawing.
const Shape = memo(function Shape({ shape, editing, preview, onDown, onDoubleClick, ...text }) {
  const style = resolveShapeStyle(shape.style)
  const color = COLORS[style.stroke].color
  const width = WIDTHS[style.width].px
  const c = center(shape)
  const turn = shape.angle ? `rotate(${(shape.angle * 180) / Math.PI} ${c.x} ${c.y})` : undefined
  const closed = CLOSED.has(shape.type)
  const fill = closed && style.fill !== 'none' ? fillPath(shape) : null
  const paths = shapePaths(shape)
  const label = shape.type === 'text' || (closed && (shape.text || editing))

  return (
    <g
      className={preview ? 'shape preview' : 'shape'}
      data-type={shape.type}
      transform={turn}
      style={{ '--ink': color }}
      onPointerDown={preview ? undefined : (e) => onDown(shape, e)}
      onDoubleClick={preview ? undefined : (e) => onDoubleClick(shape, e)}
    >
      {fill && (
        <path
          className="shape-fill"
          d={fill}
          style={{ fill: color, fillOpacity: style.fill === 'solid' ? 0.9 : 0.16 }}
        />
      )}
      {paths.map((path, i) =>
        path.kind === 'fill' ? (
          <path key={i} className="shape-ink-fill" d={path.d} />
        ) : (
          <path
            key={i}
            className="shape-stroke"
            d={path.d}
            strokeWidth={width}
            strokeDasharray={dashArray(style.dash, width)}
          />
        )
      )}
      {!preview && <HitArea shape={shape} width={width} filled={Boolean(fill) || label} />}
      {label && <Label shape={shape} style={style} editing={editing} {...text} />}
    </g>
  )
})

// Where the shape takes the pointer: a wide invisible band along its line, and its whole area
// when it's filled or has text. Easier to grab than the drawn stroke itself.
function HitArea({ shape, width, filled }) {
  const band = Math.max(12, width + 10)
  if (shape.type === 'text') {
    return (
      <rect className="shape-hit fill" x={shape.x} y={shape.y} width={shape.w} height={shape.h} />
    )
  }
  if (LINES.has(shape.type)) {
    const { x, y, w, h } = shape
    return <path className="shape-hit" d={`M${x} ${y}L${x + w} ${y + h}`} strokeWidth={band} />
  }
  if (shape.type === 'draw') {
    const d = (shape.points ?? [])
      .map(([px, py], i) => `${i ? 'L' : 'M'}${shape.x + px} ${shape.y + py}`)
      .join('')
    return <path className="shape-hit" d={d} strokeWidth={band} />
  }
  return (
    <path
      className={filled ? 'shape-hit fill' : 'shape-hit'}
      d={fillPath(shape)}
      strokeWidth={band}
    />
  )
}

// A text, or a closed shape's label: shown in place, and written in place while `editing`.
function Label({ shape, style, editing, onText, onTextDone }) {
  const input = useRef(null)
  const font = {
    fontFamily: TEXT_FONTS[style.font].family,
    fontSize: TEXT_SIZES[style.size].px * (shape.type === 'text' ? 1 : 0.75)
  }

  useEffect(() => {
    if (!editing) return
    const el = input.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const free = shape.type === 'text'
  return (
    <foreignObject
      x={shape.x}
      y={shape.y}
      width={Math.max(shape.w, 1)}
      height={Math.max(shape.h, 1)}
      className="shape-label-box"
    >
      <div className={free ? 'shape-label free' : 'shape-label'} style={font}>
        {editing ? (
          <textarea
            ref={input}
            className="shape-label-input"
            value={shape.text ?? ''}
            placeholder={free ? 'Text' : ''}
            spellCheck={false}
            rows={1}
            style={font}
            onChange={(e) => onText(shape.id, e.target.value)}
            onBlur={() => onTextDone(shape.id)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        ) : (
          <span className="shape-label-text">{shape.text}</span>
        )}
      </div>
    </foreignObject>
  )
}

// The selected shape's frame: a handle on each side and corner to resize it, one above to turn it;
// a line or an arrow gets one on each end instead.
function Frame({ shape, zoom, onHandleDown }) {
  const size = 9 / zoom
  const stroke = 1.5 / zoom
  if (LINES.has(shape.type)) {
    const ends = [
      ['start', shape.x, shape.y],
      ['end', shape.x + shape.w, shape.y + shape.h]
    ]
    return (
      <g className="shape-frame">
        {ends.map(([name, x, y]) => (
          <circle
            key={name}
            className="shape-handle"
            data-handle={name}
            cx={x}
            cy={y}
            r={size / 1.6}
            strokeWidth={stroke}
            onPointerDown={(e) => onHandleDown(shape, name, e)}
          />
        ))}
      </g>
    )
  }
  const pad = 6 / zoom
  const x = shape.x - pad
  const y = shape.y - pad
  const w = shape.w + pad * 2
  const h = shape.h + pad * 2
  const c = center(shape)
  const handles = [
    ['nw', x, y],
    ['n', x + w / 2, y],
    ['ne', x + w, y],
    ['e', x + w, y + h / 2],
    ['se', x + w, y + h],
    ['s', x + w / 2, y + h],
    ['sw', x, y + h],
    ['w', x, y + h / 2]
  ]
  const knob = y - 22 / zoom
  return (
    <g
      className="shape-frame"
      transform={shape.angle ? `rotate(${(shape.angle * 180) / Math.PI} ${c.x} ${c.y})` : undefined}
    >
      <rect className="shape-frame-box" x={x} y={y} width={w} height={h} strokeWidth={stroke} />
      <line
        className="shape-frame-box"
        x1={x + w / 2}
        y1={y}
        x2={x + w / 2}
        y2={knob}
        strokeWidth={stroke}
      />
      <circle
        className="shape-handle rotate"
        data-handle="rotate"
        cx={x + w / 2}
        cy={knob}
        r={size / 1.7}
        strokeWidth={stroke}
        onPointerDown={(e) => onHandleDown(shape, 'rotate', e)}
      />
      {handles.map(([edge, hx, hy]) => (
        <rect
          key={edge}
          className="shape-handle"
          data-handle={edge}
          x={hx - size / 2}
          y={hy - size / 2}
          width={size}
          height={size}
          rx={2 / zoom}
          strokeWidth={stroke}
          onPointerDown={(e) => onHandleDown(shape, edge, e)}
        />
      ))}
    </g>
  )
}

// A shape that's part of a bigger selection: only its outline.
function Outline({ shape, zoom }) {
  const pad = 4 / zoom
  const c = center(shape)
  if (LINES.has(shape.type)) {
    const { x, y, w, h } = shape
    return (
      <path
        className="shape-frame-box"
        d={`M${x} ${y}L${x + w} ${y + h}`}
        strokeWidth={6 / zoom}
        strokeOpacity={0.35}
      />
    )
  }
  return (
    <rect
      className="shape-frame-box"
      x={shape.x - pad}
      y={shape.y - pad}
      width={shape.w + pad * 2}
      height={shape.h + pad * 2}
      strokeWidth={1.5 / zoom}
      transform={shape.angle ? `rotate(${(shape.angle * 180) / Math.PI} ${c.x} ${c.y})` : undefined}
    />
  )
}
