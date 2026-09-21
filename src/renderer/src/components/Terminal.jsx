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
