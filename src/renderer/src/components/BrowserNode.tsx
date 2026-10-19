import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import type {
  ConsoleMessageEvent,
  DidFailLoadEvent,
  DidNavigateEvent,
  PageFaviconUpdatedEvent,
  WebviewTag
} from 'electron'
import BrowserComposer, { type Recipient, type Subject } from './BrowserComposer'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BugIcon,
  CloseIcon,
  CodeIcon,
  CrosshairIcon,
  RefreshIcon,
  TerminalIcon
} from './icons'
import { CANCEL_PICK_SCRIPT, PICK_SCRIPT, asPicked } from '../browserPicker'
import { normalizeUrl } from '../../../shared/url'
import type { NodeId, RunningServer } from '../../../shared/types'

// Pages share one session, kept across runs: a login in one browser node holds in the others.
const PARTITION = 'persist:nara-browser'
const HOME = 'about:blank'
// How often a blank page looks again for the servers the workspace's terminals started, in ms.
const SERVERS_POLL = 4000
// A console message at this level is an error (the webview's levels go from 0 to 3).
const ERROR_LEVEL = 3

// A web page on the canvas: an address bar over an Electron <webview>, which runs the page in its
// own process (main/browser.ts locks it down). Linked agents drive it with `nara browser`.
//
// It knows the local servers the workspace's terminals started (main/servers.ts): a blank page and
// the address field offer them, and a blank browser linked to a terminal opens the one it starts.
// The crosshair points at an element of the page and the bug sends the console's errors: either
// way, a line from the user goes with it to an agent (BrowserComposer.tsx).
//
// A page would take the wheel and every click from the camera, so it only takes the pointer while
// `interactive` (selected or expanded); until then a shield over it passes the press to the node.
// `linked` are the terminals linked to it, and `agents` the ones that can be told about it.
export default function BrowserNode({
  workspaceId,
  nodeId,
  label,
  url,
  interactive,
  linked,
  agents,
  onUrl,
  onFocus
}: {
  workspaceId: string
  nodeId: NodeId
  label: string
  url?: string
  interactive: boolean
  linked: NodeId[]
  agents: Recipient[]
  onUrl: (url: string) => void
  onFocus: () => void
}): JSX.Element {
  const view = useRef<WebviewTag>(null)
  // The webview loads its src once; later navigations go through it, not through React. Changing
  // the attribute would load the page again.
  const [src] = useState(() => url || HOME)
  const [address, setAddress] = useState(url && url !== HOME ? url : '')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [favicon, setFavicon] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ code: number; text: string; url: string } | null>(null)
  // The page's address as of its last navigation; blank is about:blank, before anything opened.
  const [current, setCurrent] = useState(src)
  const blank = current === HOME
  const [servers, setServers] = useState<RunningServer[]>([])
  const [picking, setPicking] = useState(false)
  const [subject, setSubject] = useState<Subject | null>(null)
  // The page the composer's message is about: its address and title when it opened.
  const [about, setAbout] = useState({ url: '', title: '' })
  // The console's errors since the page last loaded.
  const [errors, setErrors] = useState(0)
  // What the latest callbacks and props are, for the listeners added once.
  const latest = useRef({ onUrl, onFocus, editing, linked })
  useEffect(() => {
    latest.current = { onUrl, onFocus, editing, linked }
  })

  useEffect(() => {
    const el = view.current as WebviewTag
    let attached = false
    const sync = (): void => {
      setNav({ back: el.canGoBack(), forward: el.canGoForward() })
      const now = el.getURL()
      setCurrent(now)
      if (!latest.current.editing) setAddress(now === HOME ? '' : now)
      latest.current.onUrl(now)
    }
    const handlers: Record<string, (e: never) => void> = {
      'dom-ready': () => {
        if (attached) return
        attached = true
        window.api.browser.attach(workspaceId, nodeId, el.getWebContentsId())
      },
      'did-start-loading': () => {
        setLoading(true)
        setFailed(null)
      },
      'did-stop-loading': () => {
        setLoading(false)
        sync()
      },
      // A new page: its console starts empty, and a pick still going on the old one is over.
      'did-navigate': (e: DidNavigateEvent) => {
        setFavicon(null)
        setErrors(0)
        if (e.url) setPicking(false)
        sync()
      },
      'did-navigate-in-page': sync,
      'page-favicon-updated': (e: PageFaviconUpdatedEvent) => setFavicon(e.favicons?.[0] ?? null),
      // -3 is a load the page itself stopped (a redirect, a new navigation): not a failure.
      'did-fail-load': (e: DidFailLoadEvent) => {
        if (e.isMainFrame && e.errorCode !== -3) {
          setFailed({ code: e.errorCode, text: e.errorDescription, url: e.validatedURL })
        }
      },
      'console-message': (e: ConsoleMessageEvent) => {
        if (e.level >= ERROR_LEVEL) setErrors((n) => n + 1)
      },
      focus: () => latest.current.onFocus()
    }
    for (const [name, fn] of Object.entries(handlers))
      el.addEventListener(name, fn as EventListener)
    return () => {
      for (const [name, fn] of Object.entries(handlers)) {
        el.removeEventListener(name, fn as EventListener)
      }
      window.api.browser.detach(workspaceId, nodeId)
    }
  }, [workspaceId, nodeId])

  // A terminal linked to this browser printed the address of a server it started: a blank page
  // opens it.
  useEffect(
    () =>
      window.api.servers.onFound((id, server) => {
        if (id !== workspaceId || !latest.current.linked.includes(server.nodeId)) return
        if (isBlank()) open(server.url)
      }),
    // open and isBlank only read refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId]
  )

  // The servers that answer, while a blank page or the address field offers them. A blank page
  // just linked to a terminal that already has one up opens it.
  const offering = blank || editing
  const linkedKey = linked.join(',')
  useEffect(() => {
    if (!offering) return
    let live = true
    const read = (): void => {
      window.api.servers.list(workspaceId).then((list) => {
        if (!live) return
        setServers(list)
        const mine = list.find((s) => latest.current.linked.includes(s.nodeId))
        if (mine && isBlank()) open(mine.url)
      })
    }
    read()
    const timer = setInterval(read, SERVERS_POLL)
    return () => {
      live = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offering, workspaceId, linkedKey])

  function isBlank(): boolean {
    try {
      const now = view.current?.getURL()
      return !now || now === HOME
    } catch {
      // Not attached yet: still on its first page.
      return src === HOME
    }
  }

  function open(next: string): void {
    setEditing(false)
    setCurrent(next)
    setAddress(next)
    view.current?.loadURL(next).catch(() => {})
  }

  function go(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    const next = normalizeUrl(address)
    if (!next) return
    e.currentTarget.querySelector('input')?.blur()
    open(next)
  }

  // Points at an element of the page: its outline follows the pointer there until a click picks
  // one, and the composer opens on it while its screenshot is taken. Pressed again, it gives up.
  async function pick(): Promise<void> {
    const el = view.current
    if (!el) return
    if (picking) {
      el.executeJavaScript(CANCEL_PICK_SCRIPT).catch(() => {})
      return setPicking(false)
    }
    setSubject(null)
    setPicking(true)
    // The page takes the keyboard, for Escape.
    el.focus()
    let element
    try {
      element = asPicked(await el.executeJavaScript(PICK_SCRIPT, true))
    } catch {
      element = null
    }
    setPicking(false)
    if (!element) return
    setAbout(page())
    setSubject({ kind: 'element', element })
    const shot = await window.api.browser.shot(workspaceId, nodeId, element.rect)
    setSubject((current) =>
      current?.kind === 'element' && current.element === element ? { ...current, shot } : current
    )
  }

  async function sendErrors(): Promise<void> {
    const list = await window.api.browser.errors(workspaceId, nodeId)
    if (!list.length) return setErrors(0)
    setAbout(page())
    setSubject({ kind: 'errors', errors: list })
  }

  function page(): { url: string; title: string } {
    try {
      return { url: view.current?.getURL() ?? '', title: view.current?.getTitle() ?? '' }
    } catch {
      return { url: address, title: '' }
    }
  }

  // The address field offers the servers that match what's typed in it; all of them while it
  // still shows the page's own address.
  const typed = address.trim().toLowerCase()
  const suggestions = editing
    ? servers.filter((s) => !typed || address === current || s.url.includes(typed))
    : []
  const terminalName = (id: NodeId): string =>
    agents.find((a) => a.id === id)?.label ?? `terminal ${id}`

  return (
    <div className="browser" data-interactive={interactive || undefined}>
      <div className="browser-bar">
        <button
          className="icon-button small"
          aria-label="Back"
          data-tip="Back"
          disabled={!nav.back}
          onClick={() => view.current?.goBack()}
        >
          <ArrowLeftIcon size={14} />
        </button>
        <button
          className="icon-button small"
          aria-label="Forward"
          data-tip="Forward"
          disabled={!nav.forward}
          onClick={() => view.current?.goForward()}
        >
          <ArrowRightIcon size={14} />
        </button>
        <button
          className="icon-button small"
          aria-label={loading ? 'Stop' : 'Reload'}
          data-tip={loading ? 'Stop' : 'Reload'}
          onClick={() => (loading ? view.current?.stop() : view.current?.reload())}
        >
          {loading ? <CloseIcon size={14} /> : <RefreshIcon size={14} />}
        </button>
        <form className="browser-address" onSubmit={go}>
          {favicon && !editing ? (
            <img
              className="browser-favicon"
              src={favicon}
              alt=""
              // The window only loads images over https: a dev server's icon falls back.
              onError={() => setFavicon(null)}
            />
          ) : (
            <span className="browser-favicon blank" />
          )}
          <input
            className="browser-input"
            aria-label="Address"
            value={address}
            placeholder="Search or type an address"
            spellCheck={false}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              // Escape puts the address back, and a second one leaves the field.
              const current = view.current?.getURL() ?? HOME
              const shown = current === HOME ? '' : current
              if (address !== shown) {
                e.stopPropagation()
                setAddress(shown)
              } else e.currentTarget.blur()
            }}
          />
          {loading && <span className="browser-progress" />}
        </form>
        <button
          className={picking ? 'icon-button small active' : 'icon-button small'}
          aria-label={picking ? 'Stop pointing' : 'Point at an element to tell an agent about it'}
          aria-pressed={picking}
          data-tip={picking ? 'Stop pointing' : 'Point at an element'}
          disabled={blank}
          onClick={pick}
        >
          <CrosshairIcon size={14} />
        </button>
        {errors > 0 && (
          <button
            className="browser-errors"
            aria-label={`${errors} errors in the console: send them to an agent`}
            data-tip="Send the errors to an agent"
            onClick={sendErrors}
          >
            <BugIcon size={13} />
            {errors > 99 ? '99+' : errors}
          </button>
        )}
        <button
          className="icon-button small browser-devtools"
          aria-label="Developer tools"
          data-tip="Developer tools"
          disabled={blank}
          onClick={() => view.current?.openDevTools()}
        >
          <CodeIcon size={14} />
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul className="browser-suggest" role="listbox" aria-label="Running in this workspace">
          {suggestions.map((server) => (
            <li key={server.url} role="presentation">
              <button
                role="option"
                aria-selected={false}
                // Before the field loses the focus, and the list with it.
                onMouseDown={(e) => {
                  e.preventDefault()
                  open(server.url)
                  ;(document.activeElement as HTMLElement | null)?.blur()
                }}
              >
                <span className="suggest-dot" />
                <span className="suggest-url">{server.url}</span>
                <span className="suggest-from">{terminalName(server.nodeId)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="browser-page">
        <webview
          ref={view as unknown as React.Ref<HTMLWebViewElement>}
          src={src}
          // Electron's own attributes: React passes them through to the element as they are.
          // eslint-disable-next-line react/no-unknown-property
          partition={PARTITION}
          // React's types call it a boolean, but React only writes the attribute out for a string.
          // eslint-disable-next-line react/no-unknown-property
          allowpopups={'true' as unknown as boolean}
          className="browser-view"
        />
        {blank && !address && !loading && !failed && (
          <div className="browser-blank">
            {servers.length ? (
              <>
                <p>Running in this workspace</p>
                <ul className="browser-servers">
                  {servers.map((server) => (
                    <li key={server.url}>
                      <button className="browser-server" onClick={() => open(server.url)}>
                        <span className="suggest-dot" />
                        <span className="suggest-url">{server.url}</span>
                        <span className="suggest-from">
                          <TerminalIcon size={12} />
                          {terminalName(server.nodeId)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Type an address above, or link a terminal: when it starts a dev server, the page
                opens here.
              </p>
            )}
          </div>
        )}
        {failed && (
          <div className="browser-blank error">
            <p>
              Couldn’t open <bdi>{failed.url}</bdi>
            </p>
            <p className="browser-error">{failed.text || `Error ${failed.code}`}</p>
          </div>
        )}
        {picking && (
          <div className="browser-picking" role="status">
            <CrosshairIcon size={13} />
            Click an element of the page
            <kbd>Esc</kbd>
          </div>
        )}
        {subject && (
          <BrowserComposer
            subject={subject}
            page={about}
            browser={label}
            agents={agents}
            onSend={(to, text) => window.api.agents.reply(workspaceId, to, { kind: 'text', text })}
            onClose={() => setSubject(null)}
          />
        )}
        {/* Until the node is selected, a press here selects it instead of reaching the page. */}
        {!interactive && <div className="browser-shield" />}
      </div>
    </div>
  )
}
