import { useEffect, useMemo, useRef, useState } from 'react'
import { ask } from '../dialogs'
import {
  ChevronIcon,
  CollapseIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  RefreshIcon
} from './icons'

// What each letter of git's status says, for the tooltips.
const STATUS = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  U: 'Untracked',
  R: 'Renamed',
  C: 'Conflicted'
}

// The code view's explorer, in the inspector's place on the right: the tree of the folder the
// workspace works in (or of one of its agents' worktrees, picked at the top), with each file's git
// status. A click opens a file; the buttons and the right-click menu make, rename and trash files
// and folders. `listing` is main's answer for `root` ({ files, status, repo, truncated }); `made`
// holds the folders made here that have no files yet, which git doesn't list. `views` goes at
// its top: the workspace's views.
export default function Explorer({
  workspaceId,
  roots,
  root,
  onRoot,
  listing,
  made,
  onMade,
  activePath,
  onOpen,
  onRefresh,
  onMoved,
  onTrashed,
  views
}) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [selected, setSelected] = useState(null)
  // A name being typed: { kind: 'file' | 'folder', parent } for a new one, or { kind: 'rename',
  // path, type } for an existing one.
  const [editing, setEditing] = useState(null)
  const [menu, setMenu] = useState(null)
  const [error, setError] = useState(null)
  const tree = useRef(null)

  const files = listing?.files
  const status = listing?.status
  const top = useMemo(() => buildTree(files ?? [], made), [files, made])
  const changed = useMemo(() => changedFolders(status ?? {}), [status])
  const activeRel = activePath && relativeTo(root, activePath)

  // The open file's folders unfold and its row is selected, each time another file opens.
  const [revealed, setRevealed] = useState(null)
  if (activeRel !== revealed) {
    setRevealed(activeRel)
    if (activeRel) {
      const parents = ancestors(activeRel)
      if (!parents.every((p) => expanded.has(p))) setExpanded(new Set([...expanded, ...parents]))
      setSelected(activeRel)
    }
  }

  useEffect(() => {
    if (!activeRel) return
    tree.current
      ?.querySelector(`[data-path="${CSS.escape(activeRel)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeRel, expanded])

  // A new root starts folded.
  const [shownRoot, setShownRoot] = useState(root)
  if (root !== shownRoot) {
    setShownRoot(root)
    setExpanded(new Set())
    setSelected(null)
    setEditing(null)
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  function toggle(path) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Where something new goes: into the selected folder, or beside the selected file.
  function targetFolder(from = selected) {
    if (from == null) return ''
    if (isFolder(top, from)) return from
    return parentOf(from)
  }

  function startNew(kind, parent = targetFolder()) {
    setError(null)
    if (parent) setExpanded((current) => new Set([...current, ...ancestors(parent), parent]))
    setEditing({ kind, parent })
  }

  async function finishEdit(name) {
    const edit = editing
    setEditing(null)
    name = name.trim()
    if (!edit || !name) return
    if (name.includes('..') || name.startsWith('/')) {
      setError('Names stay inside the folder: no ".." and no leading "/".')
      return
    }
    if (edit.kind === 'rename') {
      const to = join(parentOf(edit.path), name)
      if (to === edit.path) return
      const result = await window.api.code.rename(workspaceId, abs(root, edit.path), abs(root, to))
      if (result.error) return setError(result.error)
      onMoved(abs(root, edit.path), abs(root, to), edit.type)
      setSelected(to)
      return
    }
    const path = join(edit.parent, name)
    const result = await window.api.code.create(workspaceId, abs(root, path), edit.kind)
    if (result.error) return setError(result.error)
    setSelected(path)
    if (edit.kind === 'folder') {
      onMade(path)
      setExpanded((current) => new Set([...current, ...ancestors(path), path]))
    } else {
      onRefresh()
      onOpen(abs(root, path))
    }
  }

  async function trash(path, type) {
    const name = path.split('/').pop()
    const what = type === 'folder' ? `the folder "${name}" and everything in it` : `"${name}"`
    const sure = await ask({
      title: 'Move to the trash?',
      message: `${what[0].toUpperCase()}${what.slice(1)} goes to the system’s trash, where it can be restored from.`,
      confirm: 'Move to trash',
      danger: true
    })
    if (!sure) return
    const result = await window.api.code.trash(workspaceId, abs(root, path))
    if (result.error) return setError(result.error)
    onTrashed(abs(root, path))
    setSelected(null)
  }

  function onKeyDown(e) {
    if (editing || selected == null || e.target.closest('input')) return
    const type = isFolder(top, selected) ? 'folder' : 'file'
    if (e.key === 'F2') {
      e.preventDefault()
      setEditing({ kind: 'rename', path: selected, type })
    } else if (e.key === 'Delete') {
      e.preventDefault()
      trash(selected, type)
    } else if (e.key === 'Enter' && type === 'file') {
      e.preventDefault()
      onOpen(abs(root, selected))
    }
  }

  function openMenu(e, path, type) {
    e.preventDefault()
    e.stopPropagation()
    if (path != null) setSelected(path)
    setMenu({ x: e.clientX, y: e.clientY, path, type })
  }

  const rootName = roots.find((r) => r.path === root)?.label ?? root?.split('/').pop()

  function rows(folder, depth) {
    const out = []
    if (editing && editing.kind !== 'rename' && editing.parent === folder.path) {
      out.push(
        <NameField
          key="new"
          depth={depth}
          kind={editing.kind}
          onDone={finishEdit}
          onCancel={() => setEditing(null)}
        />
      )
    }
    for (const child of folder.children) {
      const type = child.children ? 'folder' : 'file'
      if (editing?.kind === 'rename' && editing.path === child.path) {
        out.push(
          <NameField
            key={child.path}
            depth={depth}
            kind={type}
            initial={child.name}
            onDone={finishEdit}
            onCancel={() => setEditing(null)}
          />
        )
      } else if (type === 'folder') {
        const open = expanded.has(child.path)
        out.push(
          <button
            key={child.path}
            className="tree-row"
            data-path={child.path}
            style={{ '--depth': depth }}
            aria-expanded={open}
            aria-selected={selected === child.path}
            onClick={() => {
              setSelected(child.path)
              toggle(child.path)
            }}
            onContextMenu={(e) => openMenu(e, child.path, 'folder')}
          >
            <ChevronIcon size={12} className="tree-chevron" />
            <FolderIcon size={14} className="tree-icon" />
            <span className="tree-name">{child.name}</span>
            {changed.has(child.path) && <span className="tree-dot" aria-label="Has changes" />}
          </button>
        )
        if (open) out.push(...rows(child, depth + 1))
      } else {
        const letter = status?.[child.path]
        out.push(
          <button
            key={child.path}
            className="tree-row"
            data-path={child.path}
            data-status={letter}
            style={{ '--depth': depth }}
            aria-selected={selected === child.path}
            aria-current={activeRel === child.path || undefined}
            onClick={() => {
              setSelected(child.path)
              onOpen(abs(root, child.path))
            }}
            onContextMenu={(e) => openMenu(e, child.path, 'file')}
          >
            <span className="tree-chevron" />
            <FileIcon size={14} className="tree-icon" />
            <span className="tree-name">{child.name}</span>
            {letter && (
              <span className="tree-status" title={STATUS[letter]}>
                {letter}
              </span>
            )}
          </button>
        )
      }
    }
    return out
  }

  return (
    <aside className="floating inspector explorer" aria-label="Explorer">
      {views}
      <div className="inspector-pane">
        <header className="inspector-head">
          <div className="inspector-heading">
            <span className="inspector-kicker">Explorer</span>
            <h2 className="inspector-title" title={root}>
              {rootName}
            </h2>
          </div>
          <div className="explorer-actions">
            <button
              className="icon-button"
              data-tip="New file"
              aria-label="New file"
              onClick={() => startNew('file')}
            >
              <FilePlusIcon />
            </button>
            <button
              className="icon-button"
              data-tip="New folder"
              aria-label="New folder"
              onClick={() => startNew('folder')}
            >
              <FolderPlusIcon />
            </button>
            <button
              className="icon-button"
              data-tip="Refresh"
              aria-label="Refresh"
              onClick={onRefresh}
            >
              <RefreshIcon />
            </button>
            <button
              className="icon-button"
              data-tip="Collapse folders"
              aria-label="Collapse folders"
              onClick={() => setExpanded(new Set())}
            >
              <CollapseIcon />
            </button>
          </div>
        </header>

        {roots.length > 1 && (
          <label className="explorer-root">
            <span className="sr-only">Folder</span>
            <select value={root} onChange={(e) => onRoot(e.target.value)}>
              {roots.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p className="explorer-error" role="alert">
            {error}
            <button className="link-button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </p>
        )}

        <div
          className="explorer-tree"
          ref={tree}
          role="tree"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => openMenu(e, null, 'folder')}
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          {!listing ? (
            <p className="inspector-empty explorer-note">Reading the folder…</p>
          ) : listing.error ? (
            <p className="inspector-empty explorer-note">This folder can&apos;t be read.</p>
          ) : (
            <>
              {rows(top, 0)}
              {top.children.length === 0 && !editing && (
                <p className="inspector-empty explorer-note">No files yet.</p>
              )}
              {listing.truncated && (
                <p className="inspector-empty explorer-note">
                  Showing the first {listing.files.length.toLocaleString()} files.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {menu && (
        <div
          className="floating context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMenu(null)}
        >
          <button role="menuitem" onClick={() => startNew('file', targetFolder(menu.path))}>
            New file
          </button>
          <button role="menuitem" onClick={() => startNew('folder', targetFolder(menu.path))}>
            New folder
          </button>
          {menu.path != null && (
            <>
              <span className="context-divider" />
              {menu.type === 'file' && (
                <button role="menuitem" onClick={() => onOpen(abs(root, menu.path))}>
                  Open
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => setEditing({ kind: 'rename', path: menu.path, type: menu.type })}
              >
                Rename
                <kbd>F2</kbd>
              </button>
              <button
                role="menuitem"
                onClick={() => navigator.clipboard.writeText(abs(root, menu.path))}
              >
                Copy path
              </button>
              <button role="menuitem" onClick={() => navigator.clipboard.writeText(menu.path)}>
                Copy relative path
              </button>
              <button
                role="menuitem"
                onClick={() => window.api.code.reveal(workspaceId, abs(root, menu.path))}
              >
                Show in folder
              </button>
              <span className="context-divider" />
              <button
                role="menuitem"
                className="danger"
                onClick={() => trash(menu.path, menu.type)}
              >
                Move to trash
                <kbd>Del</kbd>
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

// The row where a new or renamed file's name is typed. Enter or leaving it keeps the name; Escape
// lets it go. A rename selects the name without its extension, as most editors do.
function NameField({ depth, kind, initial = '', onDone, onCancel }) {
  const input = useRef(null)
  const done = useRef(false)
  useEffect(() => {
    const el = input.current
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, kind === 'file' && dot > 0 ? dot : initial.length)
  }, [initial, kind])

  function finish(value) {
    if (done.current) return
    done.current = true
    onDone(value)
  }

  return (
    <div className="tree-row editing" style={{ '--depth': depth }}>
      <span className="tree-chevron" />
      {kind === 'folder' ? (
        <FolderIcon size={14} className="tree-icon" />
      ) : (
        <FileIcon size={14} className="tree-icon" />
      )}
      <input
        ref={input}
        className="tree-input"
        defaultValue={initial}
        aria-label={kind === 'folder' ? 'Folder name' : 'File name'}
        spellCheck={false}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') finish(e.currentTarget.value)
          if (e.key === 'Escape') {
            done.current = true
            onCancel()
          }
        }}
        onBlur={(e) => finish(e.currentTarget.value)}
      />
    </div>
  )
}

// The files as a tree of { name, path, children } folders and { name, path } files, folders first
// and each level in natural order ("file2" before "file10").
function buildTree(files, made) {
  const top = { name: '', path: '', children: [], folders: new Map() }
  function folder(path) {
    let node = top
    let at = ''
    for (const part of path.split('/')) {
      at = at ? `${at}/${part}` : part
      let next = node.folders.get(part)
      if (!next) {
        next = { name: part, path: at, children: [], folders: new Map() }
        node.folders.set(part, next)
        node.children.push(next)
      }
      node = next
    }
    return node
  }
  for (const path of made) folder(path)
  for (const path of files) {
    const parent = parentOf(path)
    const node = parent ? folder(parent) : top
    node.children.push({ name: path.slice(parent ? parent.length + 1 : 0), path })
  }
  const order = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  ;(function sort(node) {
    node.children.sort(
      (a, b) => Boolean(b.children) - Boolean(a.children) || order.compare(a.name, b.name)
    )
    for (const child of node.children) if (child.children) sort(child)
  })(top)
  return top
}

function isFolder(top, path) {
  let node = top
  for (const part of path.split('/')) {
    node = node.folders?.get(part)
    if (!node) return false
  }
  return Boolean(node.children)
}

// Every folder with a changed file somewhere inside.
function changedFolders(status) {
  const folders = new Set()
  for (const path of Object.keys(status)) for (const folder of ancestors(path)) folders.add(folder)
  return folders
}

function ancestors(path) {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

function parentOf(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function join(folder, name) {
  return folder ? `${folder}/${name}` : name
}

function abs(root, path) {
  return path ? `${root}/${path}` : root
}

function relativeTo(root, path) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null
}
