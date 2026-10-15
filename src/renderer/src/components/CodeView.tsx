import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { ask } from '../dialogs'
import { languageName, monaco, setUpTheme } from '../monaco'
import {
  bufferOf,
  closeBuffer,
  isDirty,
  keepMine,
  openBuffer,
  reloadBuffer,
  saveBuffer,
  useBuffers
} from '../buffers'
import { CloseIcon, FileIcon, SearchIcon } from './icons'

// The open files and the one showing.
export interface Tabs {
  tabs: string[]
  current: string | null
}

// How many matches the quick open lists.
const QUICK_OPEN_MAX = 60

// The code view: the files open in the workspace as tabs over one Monaco editor, taking the room
// the canvas had. `tabs` are absolute paths and `current` the one showing; onTabs changes both.
// `root` is the folder the explorer is on and `files` its files, for the quick open (Ctrl+P).
// `visible` is false while the workspace is put away or showing its canvas; the editor stays
// mounted, with its undo history and scroll, and only its keys go quiet.
export default function CodeView({
  workspaceId,
  visible,
  root,
  files,
  tabs,
  current,
  onTabs,
  onOpen
}: Tabs & {
  workspaceId: string
  visible: boolean
  root: string | null
  files?: string[]
  onTabs: (tabs: Tabs) => void
  onOpen: (path: string) => void
}): JSX.Element {
  useBuffers()
  const host = useRef<HTMLDivElement>(null)
  const diffHost = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  // Each tab's cursor and scroll, kept while another one shows.
  const views = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  // What opening each tab came to: 'loading', 'ok' or an error ('binary', 'large', 'missing'...).
  const [loads, setLoads] = useState<Record<string, string>>({})
  const [quickOpen, setQuickOpen] = useState(false)
  const [comparing, setComparing] = useState<string | null>(null)
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // One editor for every tab: switching tabs swaps its model.
  useEffect(() => {
    setUpTheme()
    const ed = monaco.editor.create(host.current as HTMLDivElement, {
      model: null,
      theme: 'nara',
      fontFamily: "'Geist Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: false,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      minimap: { enabled: true, renderCharacters: false, scale: 1 },
      padding: { top: 10, bottom: 10 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: 'active', indentation: true },
      stickyScroll: { enabled: true },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false }
    })
    editor.current = ed
    const moved = ed.onDidChangeCursorPosition(({ position }) =>
      setCursor({ line: position.lineNumber, column: position.column })
    )
    return () => {
      moved.dispose()
      ed.dispose()
    }
  }, [])

  // Opens a buffer for every tab, and lets go of the ones whose tab closed.
  const opened = useRef(new Set<string>())
  useEffect(() => {
    for (const path of tabs) {
      if (opened.current.has(path)) continue
      opened.current.add(path)
      setLoads((current) => ({ ...current, [path]: 'loading' }))
      openBuffer(workspaceId, path).then((result) =>
        setLoads((current) => ({ ...current, [path]: 'error' in result ? result.error : 'ok' }))
      )
    }
    for (const path of opened.current) {
      if (tabs.includes(path)) continue
      opened.current.delete(path)
      views.current.delete(path)
      closeBuffer(workspaceId, path)
      setLoads((current) => {
        const rest = { ...current }
        delete rest[path]
        return rest
      })
    }
  }, [tabs, workspaceId])

  // Hands every buffer back when the workspace closes.
  useEffect(
    () => () => {
      for (const path of opened.current) closeBuffer(workspaceId, path)
    },
    [workspaceId]
  )

  const buffer = current && loads[current] === 'ok' ? bufferOf(current) : null

  // Shows the current tab's model, where its cursor and scroll were.
  const shown = useRef<string | null>(null)
  useEffect(() => {
    const ed = editor.current
    if (!ed) return
    const model = buffer?.model ?? null
    if (ed.getModel() === model) return
    if (shown.current && ed.getModel()) views.current.set(shown.current, ed.saveViewState())
    ed.setModel(model)
    shown.current = model ? current : null
    if (model) {
      const view = current ? views.current.get(current) : null
      if (view) ed.restoreViewState(view)
      const position = ed.getPosition()
      setCursor(position && { line: position.lineNumber, column: position.column })
      if (visible) ed.focus()
    }
  }, [buffer, current, visible])

  // The side by side comparison of a conflict: what's on disk, and the user's edits.
  useEffect(() => {
    if (!comparing || comparing !== current || buffer?.state !== 'conflict' || !buffer.disk) return
    const original = monaco.editor.createModel(buffer.disk.text, buffer.model.getLanguageId())
    const diff = monaco.editor.createDiffEditor(diffHost.current as HTMLDivElement, {
      theme: 'nara',
      fontFamily: "'Geist Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 20,
      automaticLayout: true,
      originalEditable: false,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false
    })
    diff.setModel({ original, modified: buffer.model })
    return () => {
      diff.dispose()
      original.dispose()
    }
  }, [comparing, current, buffer, buffer?.state, buffer?.disk])
  if (comparing && (comparing !== current || buffer?.state !== 'conflict')) setComparing(null)

  // The view's keys, while it's on screen. Taken in the capture phase, before Monaco sees them:
  // Ctrl+W in particular would otherwise close the window.
  useEffect(() => {
    if (!visible) return
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      const take = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (key === 's' && !e.shiftKey) {
        take()
        save()
      } else if (key === 'p' && !e.shiftKey) {
        take()
        setQuickOpen((open) => !open)
      } else if (key === 'w' && !e.shiftKey) {
        take()
        if (current) close(current)
      } else if (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp') {
        take()
        const back = e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey)
        step(back ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  function step(by: number): void {
    if (tabs.length < 2 || !current) return
    const i = tabs.indexOf(current)
    onTabs({ tabs, current: tabs[(i + by + tabs.length) % tabs.length] })
  }

  async function save(force = false): Promise<void> {
    if (!current || !bufferOf(current)) return
    const result = await saveBuffer(workspaceId, current, { force })
    if (result === 'saved' || result === 'conflict') setNotice(null)
    else setNotice(`Couldn't save: ${result}`)
  }

  async function close(path: string): Promise<void> {
    if (isDirty(bufferOf(path))) {
      const name = path.split('/').pop()
      const sure = await ask({
        title: `Close ${name}?`,
        message: 'It has changes that aren’t saved, and they’ll be lost.',
        confirm: 'Close without saving',
        danger: true
      })
      if (!sure) return
    }
    const i = tabs.indexOf(path)
    const rest = tabs.filter((tab) => tab !== path)
    const next = path === current ? (rest[Math.min(i, rest.length - 1)] ?? null) : current
    onTabs({ tabs: rest, current: next })
  }

  const labels = useMemo(() => tabLabels(tabs), [tabs])
  const load = current ? loads[current] : null
  const relative =
    root && current?.startsWith(`${root}/`) ? current.slice(root.length + 1) : current
  const model = buffer?.model

  return (
    <section className="code-view" aria-label="Code" hidden={!visible}>
      {tabs.length > 0 && (
        <div className="code-tabs" role="tablist" aria-label="Open files">
          {tabs.map((path) => {
            const tabBuffer = bufferOf(path)
            const dirty = isDirty(tabBuffer)
            const trouble = tabBuffer && tabBuffer.state !== 'ok'
            return (
              <div
                key={path}
                className="code-tab"
                role="tab"
                aria-selected={path === current}
                data-dirty={dirty || undefined}
                data-state={trouble ? tabBuffer?.state : undefined}
                title={path}
                onPointerDown={(e) => {
                  // The middle button closes, as in browsers and editors.
                  if (e.button === 1) {
                    e.preventDefault()
                    close(path)
                  } else if (e.button === 0) {
                    onTabs({ tabs, current: path })
                  }
                }}
              >
                <FileIcon size={13} className="code-tab-icon" />
                <span className="code-tab-name">{labels.get(path)?.name}</span>
                {labels.get(path)?.hint && (
                  <span className="code-tab-hint">{labels.get(path)?.hint}</span>
                )}
                <button
                  className="code-tab-close"
                  aria-label={dirty ? 'Unsaved changes; close' : 'Close'}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => close(path)}
                >
                  <span className="code-tab-dot" aria-hidden="true" />
                  <CloseIcon size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {buffer?.state === 'conflict' && (
        <div className="code-banner" data-tone="warning" role="alert">
          <span>
            <strong>{labels.get(current!)?.name}</strong> changed on disk while you had unsaved
            edits.
          </span>
          <span className="code-banner-actions">
            <button
              className="button small"
              aria-pressed={comparing === current}
              onClick={() => setComparing((c) => (c === current ? null : current))}
            >
              {comparing === current ? 'Back to editing' : 'Compare'}
            </button>
            <button className="button small" onClick={() => reloadBuffer(workspaceId, current!)}>
              Use the disk&apos;s
            </button>
            <button className="button small" onClick={() => keepMine(current!)}>
              Keep mine
            </button>
          </span>
        </div>
      )}
      {buffer?.state === 'missing' && (
        <div className="code-banner" role="status">
          <span>
            <strong>{labels.get(current!)?.name}</strong> was deleted on disk. Saving puts it back.
          </span>
          <span className="code-banner-actions">
            <button className="button small" onClick={() => close(current!)}>
              Close
            </button>
          </span>
        </div>
      )}
      {notice && (
        <div className="code-banner" data-tone="danger" role="alert">
          <span>{notice}</span>
          <span className="code-banner-actions">
            <button className="button small" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </span>
        </div>
      )}

      <div className="code-body">
        <div ref={host} className="code-editor" hidden={!buffer || comparing === current} />
        {comparing === current && <div ref={diffHost} className="code-editor" />}
        {current && load && load !== 'ok' && (
          <div className="code-message">
            {load === 'loading' ? (
              <p className="empty-text">Opening…</p>
            ) : (
              <>
                <h2 className="code-message-title">{labels.get(current)?.name}</h2>
                <p className="empty-text">{LOAD_ERRORS[load] ?? `It can't be opened: ${load}`}</p>
              </>
            )}
          </div>
        )}
        {!current && (
          <div className="code-message">
            <div className="empty-state">
              <h2 className="empty-title">No file open</h2>
              <p className="empty-text">
                Pick one in the explorer on the right, or find it by name.
              </p>
              <div className="empty-actions">
                <button className="button primary" onClick={() => setQuickOpen(true)}>
                  <SearchIcon />
                  Open a file
                </button>
              </div>
              <div className="empty-hints">
                <span>
                  <kbd>Ctrl</kbd> + <kbd>P</kbd> open a file
                </span>
                <span>
                  <kbd>Ctrl</kbd> + <kbd>S</kbd> save
                </span>
                <span>
                  <kbd>Ctrl</kbd> + <kbd>W</kbd> close
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {model && (
        <footer className="code-status">
          <span className="code-status-path" title={current ?? undefined}>
            {relative}
          </span>
          {isDirty(buffer) && <span className="code-status-unsaved">Unsaved</span>}
          <span className="code-status-end">
            {cursor && (
              <span>
                Ln {cursor.line}, Col {cursor.column}
              </span>
            )}
            <span>
              {model.getOptions().insertSpaces ? `Spaces: ${model.getOptions().tabSize}` : 'Tabs'}
            </span>
            <span>{model.getEOL() === '\n' ? 'LF' : 'CRLF'}</span>
            <span>{languageName(model)}</span>
          </span>
        </footer>
      )}

      {quickOpen && (
        <QuickOpen
          files={files}
          root={root}
          onPick={(path) => {
            setQuickOpen(false)
            onOpen(path)
          }}
          onClose={() => {
            setQuickOpen(false)
            editor.current?.focus()
          }}
        />
      )}
    </section>
  )
}

const LOAD_ERRORS: Record<string, string> = {
  binary: "It's a binary file, which the editor doesn't show.",
  large: "It's over 5 MB, too big for the editor.",
  missing: "It isn't there any more: it was moved or deleted.",
  outside: 'It is outside the folders of this workspace.'
}

// A tab's name is its file's; tabs of files with the same name also show the folder they're in.
function tabLabels(tabs: string[]): Map<string, { name: string; hint: string | null }> {
  const counts = new Map<string, number>()
  for (const path of tabs) {
    const name = path.split('/').pop() ?? ''
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return new Map(
    tabs.map((path) => {
      const parts = path.split('/')
      const name = parts.pop() ?? ''
      return [path, { name, hint: (counts.get(name) ?? 0) > 1 ? (parts.pop() ?? null) : null }]
    })
  )
}

// The file finder: type part of a name or path, pick with the arrows and Enter.
function QuickOpen({
  files,
  root,
  onPick,
  onClose
}: {
  files?: string[]
  root: string | null
  onPick: (path: string) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const matches = useMemo(() => search(files ?? [], query), [files, query])

  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(matches.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && matches[index]) {
      e.preventDefault()
      onPick(`${root}/${matches[index]}`)
    }
  }

  return (
    <div className="quick-open-backdrop" onPointerDown={onClose}>
      <div
        className="floating quick-open"
        role="dialog"
        aria-label="Open a file"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="quick-open-field">
          <SearchIcon size={14} />
          <input
            autoFocus
            value={query}
            placeholder="Find a file by name or path"
            spellCheck={false}
            aria-label="File name"
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="quick-open-list" ref={list} role="listbox">
          {matches.map((path, i) => {
            const slash = path.lastIndexOf('/')
            return (
              <li
                key={path}
                role="option"
                aria-selected={i === index}
                onPointerEnter={() => setIndex(i)}
                onClick={() => onPick(`${root}/${path}`)}
              >
                <FileIcon size={13} />
                <span className="quick-open-name">{path.slice(slash + 1)}</span>
                {slash > 0 && <span className="quick-open-dir">{path.slice(0, slash)}</span>}
              </li>
            )
          })}
          {matches.length === 0 && <li className="quick-open-none">No file matches.</li>}
        </ul>
      </div>
    </div>
  )
}

// The files whose path has the query's letters in order, best first: letters in the file's own
// name count more than in its folders, and letters next to each other more than scattered ones.
function search(files: string[], query: string): string[] {
  const q = query.replace(/\s+/g, '').toLowerCase()
  if (!q) return files.slice(0, QUICK_OPEN_MAX)
  const scored: [number, string][] = []
  for (const path of files) {
    const score = fuzzy(path.toLowerCase(), q, path.lastIndexOf('/') + 1)
    if (score > 0) scored.push([score, path])
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].length - b[1].length)
  return scored.slice(0, QUICK_OPEN_MAX).map(([, path]) => path)
}

function fuzzy(text: string, query: string, nameStart: number): number {
  let score = 0
  let at = 0
  let last = -2
  for (const ch of query) {
    const found = text.indexOf(ch, at)
    if (found < 0) return 0
    score += 1
    if (found === last + 1) score += 3
    if (found >= nameStart) score += 2
    if (found === nameStart || '/._-'.includes(text[found - 1])) score += 2
    last = found
    at = found + 1
  }
  if (text.slice(nameStart).startsWith(query)) score += 10
  return score
}
