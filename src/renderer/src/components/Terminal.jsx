import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Terminal colors from the app's palette (main.css): paper-white text on the node's black.
const THEME = {
  background: '#16171a',
  foreground: '#ebe6dc',
  cursor: '#ebe6dc',
  cursorAccent: '#16171a',
  selectionBackground: '#3d3e44'
}

// How long to wait between pasting a message from another agent and pressing Enter.
const ENTER_DELAY = 500

// A real terminal: xterm.js draws it, the PTY in main runs it.
// `workspaceId` and `nodeId` say which canvas node the PTY belongs to, and so which links apply.
// With `agent` (a key of AGENTS), the PTY opens straight into that agent instead of a shell, and
// `session` is the id its conversation is saved under. `role` (a key of ROLES) goes into the
// prompt the agent opens with.
export default function Terminal({ workspaceId, nodeId, agent, session, role, cwd, onExit }) {
  const container = useRef(null)

  // onExit changes on every parent render. If it were a dependency of the effect below, every
  // render would kill the PTY and spawn another; kept in a ref, the effect always reads the latest.
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  })

  useEffect(() => {
    const term = new XTerm({
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container.current)
    fixMouseUnderZoom(term)
    fit.fit()
    term.focus()

    let id = null
    let alive = true

    const offData = window.api.pty.onData((from, data) => {
      if (from === id) term.write(data)
    })
    const offExit = window.api.pty.onExit((from, code) => {
      if (from !== id) return
      // A clean exit (e.g. `exit`) closes the node; on error it stays open to show why.
      if (code === 0) onExitRef.current?.()
      else term.write(`\r\n[process exited with code ${code}]\r\n`)
    })

    // Message from another agent (`anbu send`): it comes in as a paste, like Ctrl+V, and the
    // Enter follows separately. If it arrived with the text, the agent could take the Enter as
    // part of the paste, and the message would sit in the input without being sent.
    const offPaste = window.api.pty.onPaste((from, text) => {
      if (from !== id) return
      term.paste(text)
      setTimeout(() => alive && term.input('\r', false), ENTER_DELAY)
    })

    const options = {
      workspaceId,
      nodeId,
      agent,
      session,
      role,
      cwd,
      cols: term.cols,
      rows: term.rows
    }
    window.api.pty.create(options).then((newId) => {
      // StrictMode mounts/unmounts twice in dev: if already unmounted, kill the orphan PTY.
      if (!alive) return window.api.pty.kill(newId)
      id = newId
    })

    const input = term.onData((data) => id && window.api.pty.write(id, data))

    // Container size changed -> recompute cols/rows and tell the PTY.
    // While dragging the corner this fires on every pixel; the PTY is only told when cols/rows
    // actually change, otherwise the program inside (Claude Code, vim) redraws for nothing.
    let lastSize = ''
    const observer = new ResizeObserver(() => {
      fit.fit()
      const size = `${term.cols}x${term.rows}`
      if (!id || size === lastSize) return
      lastSize = size
      window.api.pty.resize(id, term.cols, term.rows)
    })
    observer.observe(container.current)

    return () => {
      alive = false
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      offPaste()
      if (id) window.api.pty.kill(id)
      term.dispose()
    }
  }, [workspaceId, nodeId, agent, session, role, cwd])

  return <div ref={container} className="terminal" />
}

// xterm computes the cell under the mouse as (clientX - rect.left) / cellWidth: the distance is
// in screen px (already including the canvas scale) and the cell in layout px (without it). Here
// the event is "unscaled" before it reaches xterm. This uses a private API (_core), which is why
// @xterm/xterm is pinned in package.json — check that this still holds when upgrading.
function fixMouseUnderZoom(term) {
  const mouse = term._core._mouseService

  function unscale(event, element) {
    const rect = element.getBoundingClientRect()
    const scale = rect.width / element.offsetWidth || 1
    return {
      clientX: rect.left + (event.clientX - rect.left) / scale,
      clientY: rect.top + (event.clientY - rect.top) / scale
    }
  }

  // Text selection.
  const getCoords = mouse.getCoords.bind(mouse)
  mouse.getCoords = (event, element, ...rest) =>
    getCoords(unscale(event, element), element, ...rest)

  // Clicks forwarded to programs that use the mouse (Claude Code, htop, vim).
  const getMouseReportCoords = mouse.getMouseReportCoords.bind(mouse)
  mouse.getMouseReportCoords = (event, element) =>
    getMouseReportCoords(unscale(event, element), element)
}
