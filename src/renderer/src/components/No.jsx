const LARGURA_MIN = 240
const ALTURA_MIN = 120

// Uma caixa no mundo: posição e tamanho em coordenadas do mundo, não da tela.
export default function No({ x, y, w, h, camada, titulo, aoMudar, aoFocar, children }) {
  function mover(e) {
    arrastar(e, (dx, dy) => aoMudar({ x: x + dx, y: y + dy }))
  }

  function redimensionar(e) {
    arrastar(e, (dx, dy) =>
      aoMudar({ w: Math.max(LARGURA_MIN, w + dx), h: Math.max(ALTURA_MIN, h + dy) })
    )
  }

  return (
    <div
      className="no"
      style={{ left: x, top: y, width: w, height: h, zIndex: camada }}
      // Capture: roda antes de qualquer filho (inclusive o xterm) poder engolir o evento.
      onPointerDownCapture={aoFocar}
    >
      <div className="no-barra" onPointerDown={mover}>
        {titulo}
      </div>
      <div className="no-conteudo">{children}</div>
      <div className="no-alca" onPointerDown={redimensionar} />
    </div>
  )
}

// Arrasto genérico: chama aoArrastar(dx, dy) com o deslocamento desde o clique, já em unidades do mundo.
function arrastar(e, aoArrastar) {
  if (e.button !== 0) return
  const alvo = e.currentTarget
  const no = alvo.closest('.no')
  // Mesma ideia da correção do xterm: tamanho na tela / tamanho de layout = zoom atual.
  const escala = no.getBoundingClientRect().width / no.offsetWidth || 1
  const x0 = e.clientX
  const y0 = e.clientY

  alvo.setPointerCapture(e.pointerId)

  function aoMover(ev) {
    aoArrastar(Math.round((ev.clientX - x0) / escala), Math.round((ev.clientY - y0) / escala))
  }
  function aoSoltar() {
    alvo.removeEventListener('pointermove', aoMover)
    alvo.removeEventListener('pointerup', aoSoltar)
    alvo.removeEventListener('pointercancel', aoSoltar)
  }

  alvo.addEventListener('pointermove', aoMover)
  alvo.addEventListener('pointerup', aoSoltar)
  alvo.addEventListener('pointercancel', aoSoltar)
}
