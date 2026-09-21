import { useEffect, useRef, useState } from 'react'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const GRADE = 20

// Câmera: tela = mundo * z + (x, y)  |  mundo = (tela - (x, y)) / z
export default function Canvas({ children }) {
  const viewport = useRef(null)
  const arrastando = useRef(false)
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 })

  // Pan: arrastar só começa se o clique foi no fundo, não num nó.
  function aoApertar(e) {
    if (e.target !== e.currentTarget) return
    arrastando.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function aoMover(e) {
    if (!arrastando.current) return
    // movementX/Y já estão em px de tela, mesma unidade do translate: não divide por z.
    setCam((c) => ({ ...c, x: c.x + e.movementX, y: c.y + e.movementY }))
  }

  function aoSoltar() {
    arrastando.current = false
  }

  useEffect(() => {
    const el = viewport.current
    const aoRolar = (e) => {
      if (e.ctrlKey) {
        // Zoom (Ctrl+roda ou pinça do trackpad) mantendo o ponto sob o cursor parado.
        e.preventDefault()
        const caixa = el.getBoundingClientRect()
        const mx = e.clientX - caixa.left
        const my = e.clientY - caixa.top
        setCam((c) => {
          const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.z * Math.exp(-e.deltaY * 0.001)))
          const wx = (mx - c.x) / c.z
          const wy = (my - c.y) / c.z
          return { x: mx - wx * z, y: my - wy * z, z }
        })
      } else if (e.target === el) {
        // Roda no fundo = pan. Em cima de um terminal, deixa ele rolar o histórico.
        e.preventDefault()
        setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', aoRolar, { passive: false })
    return () => el.removeEventListener('wheel', aoRolar)
  }, [])

  return (
    <div
      ref={viewport}
      className="viewport"
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      style={{
        backgroundSize: `${GRADE * cam.z}px ${GRADE * cam.z}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`
      }}
    >
      <div
        className="mundo"
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}
      >
        {children}
      </div>
    </div>
  )
}
