import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Um terminal de verdade: xterm.js desenha, o PTY no main executa.
export default function Terminal({ cmd, args }) {
  const caixa = useRef(null)

  useEffect(() => {
    const term = new XTerm({ fontSize: 13, cursorBlink: true, theme: { background: '#0d0d10' } })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(caixa.current)
    corrigirMouseComZoom(term)
    fit.fit()

    let id = null
    let vivo = true

    const pararDados = window.api.pty.aoReceber((de, dados) => {
      if (de === id) term.write(dados)
    })
    const pararSaida = window.api.pty.aoSair((de, code) => {
      if (de === id) term.write(`\r\n[fim] code=${code}\r\n`)
    })

    window.api.pty.criar({ cmd, args, cols: term.cols, rows: term.rows }).then((novo) => {
      // O StrictMode monta/desmonta duas vezes em dev: se já desmontou, mata o PTY órfão.
      if (!vivo) return window.api.pty.matar(novo)
      id = novo
    })

    const digitar = term.onData((dados) => id && window.api.pty.escrever(id, dados))

    // Mudou o tamanho da caixa -> recalcula cols/rows e avisa o PTY.
    const observador = new ResizeObserver(() => {
      fit.fit()
      if (id) window.api.pty.redimensionar(id, term.cols, term.rows)
    })
    observador.observe(caixa.current)

    return () => {
      vivo = false
      observador.disconnect()
      digitar.dispose()
      pararDados()
      pararSaida()
      if (id) window.api.pty.matar(id)
      term.dispose()
    }
  }, [cmd, args])

  return <div ref={caixa} className="terminal" />
}

// O xterm calcula a célula sob o mouse como (clientX - rect.left) / larguraDaCélula: a distância
// vem em px de tela (já com o scale do canvas) e a célula em px de layout (sem scale). Aqui o
// evento é "des-escalado" antes de chegar nele. Usa API privada (_core), por isso a versão do
// @xterm/xterm está fixada no package.json — ao atualizar, conferir se isto ainda vale.
function corrigirMouseComZoom(term) {
  const mouse = term._core._mouseService

  function desescalar(evento, elemento) {
    const rect = elemento.getBoundingClientRect()
    const escala = rect.width / elemento.offsetWidth || 1
    return {
      clientX: rect.left + (evento.clientX - rect.left) / escala,
      clientY: rect.top + (evento.clientY - rect.top) / escala
    }
  }

  // Seleção de texto.
  const getCoords = mouse.getCoords.bind(mouse)
  mouse.getCoords = (evento, elemento, ...resto) =>
    getCoords(desescalar(evento, elemento), elemento, ...resto)

  // Cliques repassados a programas que usam o mouse (Claude Code, htop, vim).
  const getMouseReportCoords = mouse.getMouseReportCoords.bind(mouse)
  mouse.getMouseReportCoords = (evento, elemento) =>
    getMouseReportCoords(desescalar(evento, elemento), elemento)
}
