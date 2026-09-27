import { useEffect, useRef } from 'react'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const GRID = 20

export default function Canvas({ cam, setCam, children }) {
  const viewport = useRef(null)
  const panning = useRef(false)

  function onPointerDown(e) {
    if (e.target !== e.currentTarget) return
    panning.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!panning.current) return
    setCam((c) => ({ ...c, x: c.x + e.movementX, y: c.y + e.movementY }))
  }

  function onPointerUp() {
    panning.current = false
  }

  useEffect(() => {
    const el = viewport.current
    const onWheel = (e) => {
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
      } else if (e.target === el || e.target.closest('.links')) {
        e.preventDefault()
        setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setCam])

  return (
    <div
      ref={viewport}
      className="viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        backgroundSize: `${GRID * cam.z}px ${GRID * cam.z}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`
      }}
    >
      <div
        className="world"
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}
      >
        {children}
      </div>
    </div>
  )
}
