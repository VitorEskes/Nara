import { useEffect, useRef, type JSX } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_SIZES, type TerminalLook } from '../nodeStyle'
import type { PtyOptions } from '../../../preload'
import type { NodeId } from '../../../shared/types'
import { TERMINAL_THEMES } from '../terminalThemes'

// How long to wait between pasting a message from another agent and pressing Enter.
const ENTER_DELAY = 500

// A terminal: xterm.js draws it and a PTY in main runs it. `workspaceId` and `nodeId` say which
// node the PTY belongs to, and so which links apply. With `agent`, the PTY opens straight into
// that agent, and `session` is the id its conversation is saved under; changing `role` restarts
// the agent, which resumes under the new role. `look` changes in place without touching the PTY.
export default function Terminal({
  workspaceId,
  nodeId,
  agent,
  session,
  role,
  command,
  cwd,
  worktree,
  look,
  onExit
}: {
  workspaceId: string
  nodeId: NodeId
  agent?: string
  session?: string
  role?: string
  command?: string
  cwd?: string
  // { branch, base } as JSON, so it compares by value.
  worktree?: string
  look: TerminalLook
  onExit?: () => void
}): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  // The open terminal and the function that fits it to its box, for the look effect.
  const live = useRef<{ term: XTerm; refit: () => void } | null>(null)
  const fontSize = TERMINAL_SIZES[look.size].px
  const { theme, cursor } = look
  // Read once when the terminal opens; later changes go through the effect at the bottom.
  const lookRef = useRef({ fontSize, theme, cursor })

  // onExit changes on every parent render. If it were a dependency of the effect below, every
  // render would kill the PTY and spawn another; kept in a ref, the effect always reads the latest.
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  })

  useEffect(() => {
    const initial = lookRef.current
    const term = new XTerm({
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: initial.fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: initial.cursor,
      cursorInactiveStyle: 'outline',
      theme: TERMINAL_THEMES[initial.theme].colors
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const box = container.current as HTMLDivElement
    term.open(box)
    fixMouseUnderZoom(term)
    fit.fit()
    term.focus()

    let id: number | null = null
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

    // Message from another agent (`nara send`): it comes in as a paste, like Ctrl+V, and the
    // Enter follows separately. If it arrived with the text, the agent could take the Enter as
    // part of the paste, and the message would sit in the input without being sent.
    const offPaste = window.api.pty.onPaste((from, text) => {
      if (from !== id) return
      term.paste(text)
      setTimeout(() => {
        if (alive) term.input('\r', false)
      }, ENTER_DELAY)
    })

    const options: PtyOptions = {
      workspaceId,
      nodeId,
      agent,
      session,
      role,
      command,
      cwd,
      // Only what the prompt needs, and as text, so it can be a dependency below.
      worktree: worktree ? JSON.parse(worktree) : undefined,
      cols: term.cols,
      rows: term.rows
    }
    window.api.pty.create(options).then((newId) => {
      // StrictMode mounts/unmounts twice in dev: if already unmounted, kill the orphan PTY.
      if (!alive) return window.api.pty.kill(newId)
      id = newId
    })

    const input = term.onData((data) => {
      if (id) window.api.pty.write(id, data)
    })

    // Container size changed -> recompute cols/rows and tell the PTY.
    // While dragging the corner this fires on every pixel; the PTY is only told when cols/rows
    // actually change, otherwise the program inside (Claude Code, vim) redraws for nothing.
    let lastSize = ''
    function refit(): void {
      fit.fit()
      const size = `${term.cols}x${term.rows}`
      if (!id || size === lastSize) return
      lastSize = size
      window.api.pty.resize(id, term.cols, term.rows)
    }
    const observer = new ResizeObserver(refit)
    observer.observe(box)
    live.current = { term, refit }

    return () => {
      alive = false
      live.current = null
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      offPaste()
      if (id) window.api.pty.kill(id)
      term.dispose()
    }
  }, [workspaceId, nodeId, agent, session, role, command, cwd, worktree])

  // The colors and the cursor change in place. A new size changes how many rows and columns fit
  // in the same box, so the PTY hears about it.
  useEffect(() => {
    lookRef.current = { fontSize, theme, cursor }
    if (!live.current) return
    const { term, refit } = live.current
    term.options.theme = TERMINAL_THEMES[theme].colors
    term.options.cursorStyle = cursor
    if (term.options.fontSize === fontSize) return
    term.options.fontSize = fontSize
    refit()
  }, [fontSize, theme, cursor])

  return <div ref={container} className="terminal" />
}

// xterm computes the cell under the mouse as (clientX - rect.left) / cellWidth: the distance is
// in screen px (already including the canvas scale) and the cell in layout px (without it). Here
// the event is "unscaled" before it reaches xterm. This uses a private API (_core), which is why
// @xterm/xterm is pinned in package.json: check that this still holds when upgrading.
interface MouseService {
  getCoords: (event: Coords, element: HTMLElement, ...rest: unknown[]) => unknown
  getMouseReportCoords: (event: Coords, element: HTMLElement) => unknown
}
type Coords = Pick<MouseEvent, 'clientX' | 'clientY'>

function fixMouseUnderZoom(term: XTerm): void {
  const mouse = (term as unknown as { _core: { _mouseService: MouseService } })._core._mouseService

  function unscale(event: Coords, element: HTMLElement): Coords {
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
