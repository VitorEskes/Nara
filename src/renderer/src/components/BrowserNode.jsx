import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  ExpandIcon,
  RefreshIcon,
  ShrinkIcon
} from './icons'
import { normalizeUrl } from '../../../shared/url'

// Pages share one session, kept across runs: a login in one browser node holds in the others.
const PARTITION = 'persist:nara-browser'
export const HOME = 'about:blank'

// A web page on the canvas: an address bar over an Electron <webview>, which runs the page in a
// process of its own (main/browser.js locks it down). `url` is where it was last, saved with the
// workspace; onUrl hears every navigation. A linked agent drives it through main with `nara
// browser`, so the page tells main who it is once it's ready.
//
// On the canvas a page would take the wheel and every click from the camera, so it only takes
// the pointer while `interactive` (its node selected, or expanded); until then a shield over it
// passes the press to the node, which selects it. `expanded` fills the room between the panels;
// onExpand toggles it.
export default function BrowserNode({
  workspaceId,
  nodeId,
  url,
  interactive,
  expanded,
  onUrl,
  onExpand,
  onFocus
}) {
  const view = useRef(null)
  // The webview loads its src once; later navigations go through it, not through React. Changing
  // the attribute would load the page again.
  const [src] = useState(() => url || HOME)
  const [address, setAddress] = useState(url && url !== HOME ? url : '')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [favicon, setFavicon] = useState(null)
  const [failed, setFailed] = useState(null)
  // What the latest callbacks are, for the listeners added once.
  const latest = useRef({})
  useEffect(() => {
    latest.current = { onUrl, onFocus, editing }
  })

  useEffect(() => {
    const el = view.current
    let attached = false
    const sync = () => {
      setNav({ back: el.canGoBack(), forward: el.canGoForward() })
      const current = el.getURL()
      if (!latest.current.editing) setAddress(current === HOME ? '' : current)
      latest.current.onUrl(current)
    }
    const handlers = {
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
      'did-navigate': () => {
        setFavicon(null)
        sync()
      },
      'did-navigate-in-page': sync,
      'page-favicon-updated': (e) => setFavicon(e.favicons?.[0] ?? null),
      // -3 is a load the page itself stopped (a redirect, a new navigation): not a failure.
      'did-fail-load': (e) => {
        if (e.isMainFrame && e.errorCode !== -3) {
          setFailed({ code: e.errorCode, text: e.errorDescription, url: e.validatedURL })
        }
      },
      focus: () => latest.current.onFocus()
    }
    for (const [name, fn] of Object.entries(handlers)) el.addEventListener(name, fn)
    return () => {
      for (const [name, fn] of Object.entries(handlers)) el.removeEventListener(name, fn)
      window.api.browser.detach(workspaceId, nodeId)
    }
  }, [workspaceId, nodeId])

  function go(e) {
    e.preventDefault()
    const next = normalizeUrl(address)
    if (!next) return
    setEditing(false)
    e.currentTarget.querySelector('input')?.blur()
    view.current.loadURL(next).catch(() => {})
  }

  return (
    <div className="browser" data-interactive={interactive || undefined}>
      <div className="browser-bar">
        <button
          className="icon-button small"
          aria-label="Back"
          data-tip="Back"
          disabled={!nav.back}
          onClick={() => view.current.goBack()}
        >
          <ArrowLeftIcon size={14} />
        </button>
        <button
          className="icon-button small"
          aria-label="Forward"
          data-tip="Forward"
          disabled={!nav.forward}
          onClick={() => view.current.goForward()}
        >
          <ArrowRightIcon size={14} />
        </button>
        <button
          className="icon-button small"
          aria-label={loading ? 'Stop' : 'Reload'}
          data-tip={loading ? 'Stop' : 'Reload'}
          onClick={() => (loading ? view.current.stop() : view.current.reload())}
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
              const current = view.current.getURL()
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
          className="icon-button small"
          aria-label={expanded ? 'Back to the canvas' : 'Fill the screen'}
          aria-pressed={expanded}
          data-tip={expanded ? 'Back to the canvas' : 'Fill the screen'}
          onClick={onExpand}
        >
          {expanded ? <ShrinkIcon size={14} /> : <ExpandIcon size={14} />}
        </button>
      </div>
      <div className="browser-page">
        <webview
          ref={view}
          src={src}
          // Electron's own attributes: React passes them through to the element as they are.
          // eslint-disable-next-line react/no-unknown-property
          partition={PARTITION}
          // eslint-disable-next-line react/no-unknown-property
          allowpopups="true"
          className="browser-view"
        />
        {src === HOME && !address && !loading && !failed && (
          <div className="browser-blank">
            <p>Type an address above, or link an agent: it can open its dev server here.</p>
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
        {/* Until the node is selected, a press here selects it instead of reaching the page. */}
        {!interactive && <div className="browser-shield" />}
      </div>
    </div>
  )
}
