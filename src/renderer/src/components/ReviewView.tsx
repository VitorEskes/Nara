import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
  type WheelEvent
} from 'react'
import { ask } from '../dialogs'
import { monaco, setUpTheme } from '../monaco'
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
import { nodeLabel } from '../nodeLabel'
import { STATE_LABELS, URGENCY, ago } from '../agentStatus'
import Modal from './Modal'
import {
  BranchIcon,
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  CodeIcon,
  CommitIcon,
  DiffIcon,
  SendIcon,
  TrashIcon
} from './icons'
import type {
  AgentState,
  AgentStatus,
  CanvasNode,
  NodeId,
  ReviewComment,
  ReviewFile,
  ReviewItem,
  ReviewItemState,
  ReviewState,
  Worktree
} from '../../../shared/types'

type Model = monaco.editor.ITextModel

// The diff's two sides for one file (`key`), or why they can't be shown.
interface Sides {
  key: string | null
  error?: string
  original?: Model
  modified?: Model
  path?: string
  deleted?: boolean
}

// A comment being written: on lines start to end, new (no id) or an edit of one.
interface Draft {
  start: number
  end: number
  text: string
  id: string | null
}

// A comment where its line is now.
type Anchored = ReviewComment & { outdated?: boolean }

interface CardSpec {
  key: string
  line: number
  comment?: Anchored
  draft?: boolean
}

interface Place {
  top: number
  left: number
  width: number
}

type Notice = { ok?: string; error?: string }
type ChangeItem = Partial<ReviewItemState> | ((s: ReviewItemState) => Partial<ReviewItemState>)

// What review state an item starts with: the file showing, which files were viewed (path -> the
// file's sig then, so a file that changes again shows as unviewed), the comments not sent yet,
// the overall comment and the rounds already sent.
const BLANK: ReviewItemState = {
  file: null,
  viewed: {},
  comments: [],
  note: '',
  rounds: [],
  to: null
}
// Lines of code quoted with a comment, at most.
const QUOTE_MAX = 6
const STATUS_WORDS: Record<ReviewFile['status'], string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted'
}

// The review view: what the workspace's agents changed, one item per repository (main/review.ts),
// file by file in a diff whose right side is the file itself, editable and saved with Ctrl+S. A
// click in the gutter leaves a comment; the comments go to the agent in one message. Finished work
// is merged (an agent's worktree) or committed (a checkout shared with the user).
//
// `items` is the queue (null while it's first read) and `state` what's been reviewed, saved with
// the workspace. `views` goes at the top of the side panel.
export default function ReviewView({
  workspaceId,
  visible,
  panel,
  items,
  nodes,
  statuses,
  state,
  onState,
  onOpenFile,
  onNodeChange,
  onRefresh,
  views
}: {
  workspaceId: string
  visible: boolean
  panel: boolean
  items: ReviewItem[] | null
  nodes: CanvasNode[]
  statuses: Map<NodeId, AgentStatus>
  state: ReviewState
  onState: Dispatch<SetStateAction<ReviewState>>
  onOpenFile: (path: string) => void
  onNodeChange: (id: NodeId, changes: Partial<CanvasNode>) => void
  onRefresh: () => void
  views: ReactNode
}): JSX.Element {
  useBuffers()
  const host = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const diff = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const owner = `${workspaceId}:review`

  const item = items?.find((i) => i.folder === state.folder) ?? items?.[0] ?? null
  const mine: ReviewItemState = item ? { ...BLANK, ...state.items?.[item.folder] } : BLANK
  const file = item ? pickFile(item, mine) : null
  const viewedCount = item ? item.files.filter((f) => mine.viewed[f.path] === f.sig).length : 0

  function changeItem(folder: string, patch: ChangeItem): void {
    onState((s) => {
      const before = { ...BLANK, ...s.items?.[folder] }
      const next = typeof patch === 'function' ? patch(before) : patch
      return { ...s, items: { ...s.items, [folder]: { ...before, ...next } } }
    })
  }

  // The models the diff shows: the file where the work began, and the file now. Read for one
  // file (`key`); while another is being read they're left out.
  const [read, setRead] = useState<Sides | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [conflict, setConflict] = useState<{ folder: string; files: string[] } | null>(null)
  const [merged, setMerged] = useState<{ worktree: Worktree; nodeId: NodeId } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // The modal open from the panel's foot.
  const [modal, setModal] = useState<'feedback' | 'commit' | null>(null)

  // One diff editor for every file; its right side takes a comment from a click in the gutter.
  const startDraft = useRef<(lines: [number, number]) => void>(() => {})
  useEffect(() => {
    setUpTheme()
    const d = monaco.editor.createDiffEditor(host.current as HTMLDivElement, {
      theme: 'nara',
      fontFamily: "'Geist Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 20,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      originalEditable: false,
      renderMarginRevertIcon: true,
      // Split is the user's pick, even when it's narrow.
      useInlineViewWhenSpaceIsLimited: false,
      ignoreTrimWhitespace: false,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 6 },
      minimap: { enabled: false },
      glyphMargin: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderLineHighlight: 'line',
      stickyScroll: { enabled: true },
      padding: { top: 8, bottom: 8 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false }
    })
    diff.current = d
    const me = d.getModifiedEditor()
    const plus = me.createDecorationsCollection()
    const { MouseTargetType } = monaco.editor
    const subs = [
      me.onMouseMove((e) => {
        const line = e.target.position?.lineNumber
        if (!line || me.getOption(monaco.editor.EditorOption.readOnly)) return plus.clear()
        plus.set([
          {
            range: new monaco.Range(line, 1, line, 1),
            options: { glyphMarginClassName: 'review-add-glyph' }
          }
        ])
      }),
      me.onMouseLeave(() => plus.clear()),
      me.onMouseDown((e) => {
        if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) return
        const line = e.target.position.lineNumber
        const [start, end] = selectedLines(me)
        startDraft.current(line >= start && line <= end ? [start, end] : [line, line])
      }),
      me.addAction({
        id: 'nara.review.comment',
        label: 'Comment on these lines',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 0,
        precondition: '!editorReadonly',
        run: (ed) => startDraft.current(selectedLines(ed as monaco.editor.ICodeEditor))
      })
    ]
    return () => {
      for (const sub of subs) sub.dispose()
      d.dispose()
      diff.current = null
    }
  }, [])

  // Reads the file's two sides each time another one shows.
  const fileKey =
    item && file ? `${item.folder}\0${file.path}\0${item.baseCommit}\0${file.status}` : null
  const models = read?.key === fileKey ? read : null
  // A comment being written belongs to the file it was started on.
  const [draftKey, setDraftKey] = useState(fileKey)
  if (draftKey !== fileKey) {
    setDraftKey(fileKey)
    setDraft(null)
  }
  useEffect(() => {
    if (!item || !file) return
    let live = true
    let original: Model | null = null
    let gone: Model | null = null
    let held = false
    const full = `${item.folder}/${file.path}`
    const setModels = (value: Sides): void => {
      if (live) setRead(value)
    }
    ;(async () => {
      if (file.binary) return setModels({ key: fileKey, error: 'binary' })
      const base = await window.api.review.original(
        workspaceId,
        item.folder,
        file.path,
        item.baseCommit
      )
      if (!live) return
      if (base.error !== undefined) return setModels({ key: fileKey, error: base.error })
      let modified: Model
      if (file.status === 'D') {
        gone = monaco.editor.createModel('', undefined, uniqueUri('nara-gone', full))
        modified = gone
      } else {
        const buffer = await openBuffer(workspaceId, full, owner)
        if ('error' in buffer) return setModels({ key: fileKey, error: buffer.error })
        held = true
        if (!live) return closeBuffer(owner, full)
        modified = buffer.model
      }
      original = monaco.editor.createModel(
        base.text,
        modified.getLanguageId(),
        uniqueUri('nara-base', full)
      )
      setModels({ key: fileKey, original, modified, path: full, deleted: file.status === 'D' })
    })()
    return () => {
      live = false
      diff.current?.setModel(null)
      original?.dispose()
      gone?.dispose()
      if (held) closeBuffer(owner, full)
    }
  }, [fileKey, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = diff.current
    if (!d) return
    if (!models?.original || !models.modified) return d.setModel(null)
    d.setModel({ original: models.original, modified: models.modified })
    d.getModifiedEditor().updateOptions({ readOnly: models.deleted })
  }, [models])

  useEffect(() => {
    diff.current?.updateOptions({ renderSideBySide: state.inline === false })
  }, [state.inline])

  // The comments on the file showing, each at the line it was left on, or where that line moved
  // to since (an agent or the user edited the file).
  const [edits, setEdits] = useState(0)
  useEffect(() => {
    if (!models?.modified) return
    const sub = models.modified.onDidChangeContent(() => setEdits((n) => n + 1))
    return () => sub.dispose()
  }, [models])
  const model = models?.modified ?? null
  const anchored = useMemo<Anchored[]>(
    () =>
      file && model
        ? mine.comments
            .filter((c) => c.path === file.path)
            .map((c) => ({ ...c, ...anchor(model, c) }))
        : [],
    [file, model, mine.comments, edits] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    startDraft.current = ([start, end]) => {
      if (!model || models?.deleted) return
      setDraft({ start, end, text: '', id: null })
    }
  })

  // Each card (a comment, or the one being written) sits in a gap opened in the diff under its
  // line. The gap is Monaco's (a view zone); the card is drawn over it, outside the editor, so
  // typing in it never reaches the editor's keys.
  const cards: CardSpec[] = [
    ...anchored.map((c) => ({ key: c.id, line: c.line, comment: c })),
    ...(draft && !draft.id ? [{ key: 'draft', line: draft.end, draft: true }] : [])
  ]
  const zones = useRef<{
    model: Model | null
    map: Map<string, { id: string; line: number; spec: monaco.editor.IViewZone }>
  }>({ model: null, map: new Map() })
  const heights = useRef(new Map<string, number>())
  const [places, setPlaces] = useState<Record<string, Place>>({})
  const cardLines = cards.map((c) => `${c.key}:${c.line}`).join(',')

  function place(): void {
    const d = diff.current
    if (!d || !layer.current) return
    const me = d.getModifiedEditor()
    const box = layer.current.getBoundingClientRect()
    const edBox = me.getContainerDomNode().getBoundingClientRect()
    const info = me.getLayoutInfo()
    const lineHeight = me.getOption(monaco.editor.EditorOption.lineHeight)
    const next: Record<string, Place> = {}
    for (const [key, zone] of zones.current.map) {
      next[key] = {
        top:
          edBox.top -
          box.top +
          me.getTopForLineNumber(zone.line) +
          lineHeight -
          me.getScrollTop() +
          4,
        left: edBox.left - box.left + info.contentLeft,
        width: Math.max(220, info.contentWidth - info.verticalScrollbarWidth - 24)
      }
    }
    setPlaces(next)
  }

  useEffect(() => {
    const me = (diff.current as monaco.editor.IStandaloneDiffEditor).getModifiedEditor()
    const z = zones.current
    // A new model starts with no gaps: Monaco drops them with the old one.
    if (z.model !== model) {
      z.model = model
      z.map = new Map()
    }
    if (!model) return
    const wanted = new Map(cardLines ? cardLines.split(',').map(splitCard) : [])
    me.changeViewZones((acc) => {
      for (const [key, zone] of z.map) {
        if (wanted.get(key) === zone.line) continue
        acc.removeZone(zone.id)
        z.map.delete(key)
      }
      for (const [key, line] of wanted) {
        if (z.map.has(key)) continue
        const spec: monaco.editor.IViewZone = {
          afterLineNumber: line,
          heightInPx: (heights.current.get(key) ?? 88) + 8,
          domNode: document.createElement('div')
        }
        z.map.set(key, { id: acc.addZone(spec), line, spec })
      }
    })
    place()
  }, [model, cardLines])

  useEffect(() => {
    const d = diff.current as monaco.editor.IStandaloneDiffEditor
    const me = d.getModifiedEditor()
    let frame = 0
    const later = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    const subs = [
      me.onDidScrollChange(later),
      me.onDidLayoutChange(later),
      d.onDidUpdateDiff(later)
    ]
    return () => {
      cancelAnimationFrame(frame)
      for (const sub of subs) sub.dispose()
    }
  }, [])

  function sized(key: string, height: number): void {
    heights.current.set(key, height)
    const zone = zones.current.map.get(key)
    if (!zone || zone.spec.heightInPx === height + 8) return
    zone.spec.heightInPx = height + 8
    diff.current?.getModifiedEditor().changeViewZones((acc) => acc.layoutZone(zone.id))
    place()
  }

  function forwardWheel(e: WheelEvent): void {
    const me = diff.current?.getModifiedEditor()
    if (me) me.setScrollTop(me.getScrollTop() + e.deltaY)
  }

  function saveComment(text: string): void {
    if (!draft || !text.trim() || !file || !item || !model) return setDraft(null)
    const { start, end, id } = draft
    if (id) {
      changeItem(item.folder, (s) => ({
        comments: s.comments.map((c) => (c.id === id ? { ...c, text: text.trim() } : c))
      }))
    } else {
      const lines: string[] = []
      for (let n = start; n <= Math.min(end, start + QUOTE_MAX - 1); n++) {
        lines.push(model.getLineContent(n))
      }
      const comment: ReviewComment = {
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        path: file.path,
        start,
        line: end,
        snippet: model.getLineContent(end),
        quote: lines.join('\n'),
        text: text.trim()
      }
      changeItem(item.folder, (s) => ({ comments: [...s.comments, comment] }))
    }
    setDraft(null)
  }

  function removeComment(id: string): void {
    if (!item) return
    changeItem(item.folder, (s) => ({ comments: s.comments.filter((c) => c.id !== id) }))
  }

  function showFile(path: string, line?: number): void {
    if (!item) return
    changeItem(item.folder, { file: path })
    if (line) {
      // Once the file's models are in, the line comes into view.
      setTimeout(() => diff.current?.getModifiedEditor().revealLineInCenter(line), 120)
    }
  }

  function step(by: number): void {
    if (!item || !file) return
    const i = item.files.findIndex((f) => f.path === file.path)
    const next = item.files[(i + by + item.files.length) % item.files.length]
    showFile(next.path)
  }

  // Marking a file as viewed moves on to the next one that isn't.
  function setViewed(path: string, on: boolean): void {
    if (!item) return
    const target = item.files.find((f) => f.path === path)
    changeItem(item.folder, (s) => {
      const viewed = { ...s.viewed }
      if (on && target?.sig) viewed[path] = target.sig
      else delete viewed[path]
      const next =
        on && path === file?.path
          ? (item.files.find((f) => f.path !== path && viewed[f.path] !== f.sig)?.path ?? path)
          : s.file
      return { viewed, file: next }
    })
  }

  async function save(): Promise<void> {
    if (!models?.path || !bufferOf(models.path)) return
    const result = await saveBuffer(workspaceId, models.path)
    if (result !== 'saved' && result !== 'conflict')
      setNotice({ error: `Couldn't save: ${result}` })
  }

  async function discard(): Promise<void> {
    if (!item || !file) return
    const name = file.path.split('/').pop()
    const back = item.worktree ? 'when the branch began' : 'at the last commit'
    const what =
      file.status === 'A'
        ? `${name} is new: it goes to the trash.`
        : `It goes back to how it was ${back}.`
    const sure = await ask({
      title: `Discard the changes to ${name}?`,
      message: what,
      confirm: 'Discard',
      danger: true
    })
    if (!sure) return
    const result = await window.api.review.discard(
      workspaceId,
      item.folder,
      file.path,
      item.baseCommit
    )
    if (result.error !== undefined) setNotice({ error: result.error })
    onRefresh()
  }

  // Who the comments go to: the agent picked, or the first of the item's that's still there.
  const agents = item
    ? item.nodeIds
        .map((id) => nodes.find((n) => n.id === id))
        .filter((node): node is CanvasNode => Boolean(node))
        .map((node) => ({ node, status: statuses.get(node.id) }))
    : []
  const target = agents.find((a) => a.node.id === mine.to) ?? agents[0] ?? null

  async function tell(text: string): Promise<boolean> {
    if (!target) return false
    const ok = await window.api.agents.reply(workspaceId, target.node.id, { kind: 'text', text })
    if (!ok) {
      setNotice({
        error: `${nodeLabel(target.node)} isn't running an agent right now, so it can't take the message.`
      })
    }
    return ok
  }

  async function send(): Promise<void> {
    const text = feedback(mine.comments, mine.note)
    if (!item || !target || !text || !(await tell(text))) return
    const count = mine.comments.length
    changeItem(item.folder, (s) => ({
      comments: [],
      note: '',
      rounds: [...s.rounds, { at: Date.now(), comments: count, to: target.node.id }].slice(-20)
    }))
    setModal(null)
    setNotice({ ok: `Sent to ${nodeLabel(target.node)}` })
  }

  async function merge(): Promise<void> {
    if (!item) return
    setBusy(true)
    const result = await window.api.review.merge(
      workspaceId,
      item.folder,
      item.dirty ? message : undefined
    )
    setBusy(false)
    if (result.conflict) return setConflict({ folder: item.folder, files: result.conflict })
    if (result.error !== undefined) return setNotice({ error: result.error })
    setConflict(null)
    setMessage('')
    setModal(null)
    if (item.worktree) setMerged({ worktree: item.worktree, nodeId: item.nodeIds[0] })
    changeItem(item.folder, { comments: [], note: '', viewed: {}, file: null })
    onRefresh()
  }

  async function commit(): Promise<void> {
    if (!item) return
    setBusy(true)
    const result = await window.api.review.commit(workspaceId, item.folder, message)
    setBusy(false)
    if (result.error !== undefined) return setNotice({ error: result.error })
    setMessage('')
    setModal(null)
    setNotice({ ok: 'Committed' })
    changeItem(item.folder, { comments: [], note: '', viewed: {}, file: null })
    onRefresh()
  }

  async function removeWorktree(): Promise<void> {
    if (!merged) return
    const { path, branch, root } = merged.worktree
    const sure = await ask({
      title: 'Remove this worktree?',
      message: `${path} is deleted, along with anything not committed in it. The branch ${branch} and its commits stay.`,
      confirm: 'Remove',
      danger: true
    })
    if (!sure) return
    const result = await window.api.git.removeWorktree(merged.worktree)
    if (result.error !== undefined) return setNotice({ error: result.error })
    onNodeChange(merged.nodeId, { worktree: undefined, cwd: root })
    setMerged(null)
    onRefresh()
  }

  // Ctrl+S saves the file showing, while the view is on screen.
  useEffect(() => {
    if (!visible) return
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      e.stopPropagation()
      save()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  const buffer = models?.path ? bufferOf(models.path) : null
  const showDiff = Boolean(models?.original)
  const itemConflict = conflict?.folder === item?.folder ? conflict : null
  // A commit needs a message; a worktree with everything committed merges as it is.
  const commitBlocked = busy || Boolean(item && (!item.worktree || item.dirty) && !message.trim())

  return (
    <>
      <section className="code-view review-view" aria-label="Review" hidden={!visible}>
        {items && items.length > 0 && (
          <div className="code-tabs review-queue" role="tablist" aria-label="Changes to review">
            {items.map((it) => (
              <QueueTab
                key={it.folder}
                item={it}
                selected={it.folder === item?.folder}
                nodes={nodes}
                statuses={statuses}
                review={{ ...BLANK, ...state.items?.[it.folder] }}
                onPick={() => onState((s) => ({ ...s, folder: it.folder }))}
              />
            ))}
          </div>
        )}

        {merged && (
          <div className="code-banner" role="status">
            <span>
              Merged <strong>{merged.worktree.branch}</strong> into {merged.worktree.base}.
            </span>
            <span className="code-banner-actions">
              <button className="button small" onClick={removeWorktree}>
                Remove the worktree
              </button>
              <button className="button small" onClick={() => setMerged(null)}>
                Keep it
              </button>
            </span>
          </div>
        )}
        {notice && (
          <div className="code-banner" data-tone={notice.error ? 'danger' : undefined} role="alert">
            <span>{notice.error ?? notice.ok}</span>
            <span className="code-banner-actions">
              <button className="button small" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </span>
          </div>
        )}

        {item && file && (
          <div className="review-filebar">
            <button
              className="icon-button"
              aria-label="Previous file"
              data-tip="Previous file"
              onClick={() => step(-1)}
            >
              <ChevronIcon size={14} className="review-prev" />
            </button>
            <button
              className="icon-button"
              aria-label="Next file"
              data-tip="Next file"
              onClick={() => step(1)}
            >
              <ChevronIcon size={14} className="review-next" />
            </button>
            <span
              className="change-mark"
              data-status={file.status}
              title={STATUS_WORDS[file.status]}
            >
              {file.status}
            </span>
            <span className="review-filepath" title={file.path}>
              <span className="change-dir">
                {file.path.slice(0, file.path.lastIndexOf('/') + 1)}
              </span>
              {file.path.slice(file.path.lastIndexOf('/') + 1)}
            </span>
            {file.added != null && <span className="added">+{file.added}</span>}
            {file.removed != null && <span className="removed">−{file.removed}</span>}
            {isDirty(buffer) && <span className="code-status-unsaved">Unsaved · Ctrl+S</span>}
            <span className="review-filebar-end">
              <label className="review-viewed">
                <input
                  type="checkbox"
                  checked={mine.viewed[file.path] === file.sig}
                  onChange={(e) => setViewed(file.path, e.target.checked)}
                />
                Viewed
              </label>
              <div
                className="segmented review-layout"
                role="tablist"
                aria-label="Diff layout"
                style={{ '--count': 2, '--index': state.inline === false ? 0 : 1 }}
              >
                <button
                  role="tab"
                  aria-selected={state.inline === false}
                  onClick={() => onState((s) => ({ ...s, inline: false }))}
                >
                  Split
                </button>
                <button
                  role="tab"
                  aria-selected={state.inline !== false}
                  onClick={() => onState((s) => ({ ...s, inline: true }))}
                >
                  Inline
                </button>
              </div>
              {file.status !== 'D' && (
                <button
                  className="icon-button"
                  aria-label="Open in the code view"
                  data-tip="Open in code"
                  onClick={() => onOpenFile(`${item.folder}/${file.path}`)}
                >
                  <CodeIcon size={14} />
                </button>
              )}
              <button
                className="icon-button danger"
                aria-label="Discard the changes to this file"
                data-tip="Discard this file"
                onClick={discard}
              >
                <TrashIcon size={14} />
              </button>
            </span>
          </div>
        )}

        {buffer?.state === 'conflict' && (
          <div className="code-banner" data-tone="warning" role="alert">
            <span>The file changed on disk while you had unsaved edits.</span>
            <span className="code-banner-actions">
              <button
                className="button small"
                onClick={() => reloadBuffer(workspaceId, buffer.path)}
              >
                Use the disk&apos;s
              </button>
              <button className="button small" onClick={() => keepMine(buffer.path)}>
                Keep mine
              </button>
            </span>
          </div>
        )}

        <div className="code-body">
          <div ref={host} className="code-editor" hidden={!showDiff} />
          <div className="review-cards" ref={layer} hidden={!showDiff}>
            {cards.map((card) => (
              <Card
                key={card.key}
                place={places[card.key]}
                onSize={(h: number) => sized(card.key, h)}
                onWheel={forwardWheel}
              >
                {card.draft || draft?.id === card.key ? (
                  <CommentEditor
                    lines={
                      card.draft && draft
                        ? [draft.start, draft.end]
                        : [card.comment!.start, card.line]
                    }
                    initial={card.draft ? '' : card.comment!.text}
                    onDone={saveComment}
                    onCancel={() => setDraft(null)}
                  />
                ) : (
                  <CommentView
                    comment={card.comment!}
                    onEdit={() =>
                      setDraft({
                        start: card.comment!.start,
                        end: card.line,
                        text: card.comment!.text,
                        id: card.key
                      })
                    }
                    onRemove={() => removeComment(card.key)}
                  />
                )}
              </Card>
            ))}
          </div>

          {item && file && !showDiff && (
            <div className="code-message">
              {models?.error ? (
                <>
                  <h2 className="code-message-title">{file.path.split('/').pop()}</h2>
                  <p className="empty-text">
                    {LOAD_ERRORS[models.error] ?? `It can't be shown: ${models.error}`}
                  </p>
                </>
              ) : (
                <p className="empty-text">Opening…</p>
              )}
            </div>
          )}
          {!item && (
            <div className="code-message">
              <div className="empty-state">
                <h2 className="empty-title">
                  {items ? 'Nothing to review' : 'Reading the changes…'}
                </h2>
                {items && (
                  <p className="empty-text">
                    When an agent changes files, in a worktree of its own or in the workspace&apos;s
                    folder, its work comes here to be read, commented on and merged.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {panel && visible && !item && (
        <aside className="floating inspector review-panel" aria-label="Review">
          {views}
          <div className="inspector-pane">
            <header className="inspector-head">
              <div className="inspector-heading">
                <span className="inspector-kicker">Review</span>
                <h2 className="inspector-title">Nothing to review</h2>
              </div>
            </header>
            <div className="inspector-body">
              <p className="inspector-empty">
                The agents&apos; changes come here as they make them, one tab per worktree or shared
                folder.
              </p>
            </div>
          </div>
        </aside>
      )}

      {panel && visible && item && (
        <aside className="floating inspector review-panel" aria-label="Review">
          {views}
          <div className="inspector-pane">
            <header className="inspector-head">
              <div className="inspector-heading">
                <span className="inspector-kicker">Review</span>
                <h2 className="inspector-title">{itemName(item, nodes)}</h2>
              </div>
            </header>
            <div className="inspector-body">
              <div className="worktree-head review-branch">
                <BranchIcon size={13} />
                <span className="worktree-branch">{item.branch}</span>
                <span className="worktree-base">
                  {item.worktree ? `from ${item.base}` : 'shared checkout'}
                </span>
              </div>

              {item.commits.length > 0 && (
                <section className="review-section">
                  <h3 className="field-label">
                    {item.commits.length} {item.commits.length === 1 ? 'commit' : 'commits'}
                  </h3>
                  <ul className="review-commits">
                    {item.commits.slice(0, 6).map((c) => (
                      <li key={c.hash}>
                        <code>{c.hash}</code> {c.subject}
                      </li>
                    ))}
                    {item.commits.length > 6 && <li>and {item.commits.length - 6} more</li>}
                  </ul>
                </section>
              )}

              <section className="review-section">
                <div className="review-section-head">
                  <h3 className="field-label">Files</h3>
                  <span className="review-progress-label">
                    {viewedCount} of {item.files.length} viewed
                  </span>
                </div>
                <div className="review-progress" aria-hidden="true">
                  <span style={{ width: `${(viewedCount / item.files.length) * 100}%` }} />
                </div>
                <ul className="change-list">
                  {item.files.map((f) => {
                    const slash = f.path.lastIndexOf('/')
                    const viewed = mine.viewed[f.path] === f.sig
                    const comments = mine.comments.filter((c) => c.path === f.path).length
                    return (
                      <li key={f.path} className="review-file">
                        <input
                          type="checkbox"
                          aria-label={`Viewed ${f.path}`}
                          checked={viewed}
                          onChange={(e) => setViewed(f.path, e.target.checked)}
                        />
                        <button
                          className="change"
                          data-status={STATUS_WORDS[f.status]}
                          data-viewed={viewed || undefined}
                          aria-current={f.path === file?.path || undefined}
                          onClick={() => showFile(f.path)}
                        >
                          <span className="change-mark">{f.status}</span>
                          <span className="change-path" title={f.path}>
                            <span className="change-dir">{f.path.slice(0, slash + 1)}</span>
                            {f.path.slice(slash + 1)}
                          </span>
                          {comments > 0 && (
                            <span className="review-file-comments" title="Comments">
                              <ChatIcon size={11} />
                              {comments}
                            </span>
                          )}
                          {mine.viewed[f.path] && !viewed && (
                            <span className="review-changed" title="Changed since you viewed it">
                              changed
                            </span>
                          )}
                          {f.added != null && <span className="added">+{f.added}</span>}
                          {f.removed != null && <span className="removed">−{f.removed}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {mine.comments.length > 0 && (
                <section className="review-section">
                  <h3 className="field-label">
                    {mine.comments.length} {mine.comments.length === 1 ? 'comment' : 'comments'} to
                    send
                  </h3>
                  <ul className="review-comment-list">
                    {mine.comments.map((c) => (
                      <li key={c.id}>
                        <button onClick={() => showFile(c.path, c.line)}>
                          <span className="review-comment-where">
                            {c.path.split('/').pop()}:{lineRange(c)}
                          </span>
                          <span className="review-comment-text">{c.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="review-actions">
              <button
                className="button"
                disabled={!target}
                title={target ? undefined : 'No agent is working on this change'}
                onClick={() => setModal('feedback')}
              >
                <ChatIcon size={14} />
                Feedback
                {mine.comments.length > 0 && (
                  <span className="review-actions-count">{mine.comments.length}</span>
                )}
              </button>
              <button className="button primary" onClick={() => setModal('commit')}>
                <CommitIcon size={14} />
                {item.worktree ? 'Merge' : 'Commit'}
              </button>
            </div>
          </div>
        </aside>
      )}

      {modal === 'feedback' && item && (
        <Modal
          title={target ? `Feedback to ${nodeLabel(target.node)}` : 'Feedback'}
          icon={<ChatIcon size={15} />}
          onSubmit={send}
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="modal-hint">
                <kbd>Ctrl</kbd> <kbd>Enter</kbd>
              </span>
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!target || (!mine.comments.length && !mine.note.trim())}
              >
                <SendIcon size={14} />
                Send
              </button>
            </>
          }
        >
          <textarea
            className="text-input modal-text"
            aria-label="Feedback for the agent"
            rows={4}
            data-autofocus
            placeholder="What should the agent change?"
            value={mine.note}
            onChange={(e) => changeItem(item.folder, { note: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                send()
              }
            }}
          />
          {mine.comments.length > 0 && (
            <p className="modal-note">
              With {mine.comments.length} line {mine.comments.length === 1 ? 'comment' : 'comments'}{' '}
              from the diff.
            </p>
          )}
          {agents.length > 1 && (
            <label className="review-to">
              <span>To</span>
              <select
                value={target?.node.id ?? ''}
                onChange={(e) => changeItem(item.folder, { to: Number(e.target.value) })}
              >
                {agents.map(({ node }) => (
                  <option key={node.id} value={node.id}>
                    {nodeLabel(node)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mine.rounds.length > 0 && (
            <p className="modal-note">
              Sent {mine.rounds.length} {mine.rounds.length === 1 ? 'time' : 'times'} before, the
              last {ago(mine.rounds[mine.rounds.length - 1].at)} ago.
            </p>
          )}
        </Modal>
      )}

      {modal === 'commit' && item && (
        <Modal
          title={item.worktree ? `Merge into ${item.base}` : 'Commit'}
          icon={<CommitIcon size={15} />}
          onSubmit={() => !commitBlocked && (item.worktree ? merge() : commit())}
          onClose={() => setModal(null)}
          footer={
            <>
              {target && (!item.worktree || item.dirty) && (
                <button
                  type="button"
                  className="link-button modal-aside"
                  onClick={async () => {
                    if (
                      await tell(
                        'Your changes look ready. Commit them with a clear message, and tell me when it is done.'
                      )
                    ) {
                      setModal(null)
                      setNotice({ ok: `Asked ${nodeLabel(target.node)} to commit` })
                    }
                  }}
                >
                  Ask the agent to commit
                </button>
              )}
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={commitBlocked}>
                <CheckIcon size={14} />
                {busy ? 'Working…' : item.worktree ? 'Merge' : 'Commit'}
              </button>
            </>
          }
        >
          {item.worktree && !item.dirty ? (
            <p className="modal-note">
              Everything is committed on <b>{item.branch}</b>: it goes into <b>{item.base}</b>.
            </p>
          ) : (
            <>
              <input
                className="text-input"
                aria-label="Commit message"
                data-autofocus
                placeholder="Commit message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="modal-note">
                {item.files.length} {item.files.length === 1 ? 'file' : 'files'} on{' '}
                <b>{item.branch}</b>
                {item.worktree
                  ? `, committed and then merged into ${item.base}.`
                  : '. Every change in this folder goes in, yours included.'}
              </p>
            </>
          )}
          {itemConflict && (
            <div className="review-conflict" role="alert">
              <p>
                It conflicts with {item.base} in {itemConflict.files.length}{' '}
                {itemConflict.files.length === 1 ? 'file' : 'files'}, so nothing was merged:
              </p>
              <ul>
                {itemConflict.files.slice(0, 6).map((f) => (
                  <li key={f}>
                    <code>{f}</code>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="button small"
                onClick={async () => {
                  if (await tell(conflictMessage(item, itemConflict.files))) {
                    setConflict(null)
                    setModal(null)
                    setNotice({ ok: 'Asked the agent to sort out the conflicts' })
                  }
                }}
              >
                Ask the agent to resolve them
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

function QueueTab({
  item,
  selected,
  nodes,
  statuses,
  review,
  onPick
}: {
  item: ReviewItem
  selected: boolean
  nodes: CanvasNode[]
  statuses: Map<NodeId, AgentStatus>
  review: ReviewItemState
  onPick: () => void
}): JSX.Element {
  const state = item.nodeIds
    .map((id): AgentState => statuses.get(id)?.state ?? 'idle')
    .sort((a, b) => URGENCY[b] - URGENCY[a])[0]
  const added = item.files.reduce((sum, f) => sum + (f.added ?? 0), 0)
  const removed = item.files.reduce((sum, f) => sum + (f.removed ?? 0), 0)
  const left = item.files.filter((f) => review.viewed[f.path] !== f.sig).length
  return (
    <div
      className="code-tab review-tab"
      role="tab"
      aria-selected={selected}
      title={item.folder}
      onPointerDown={(e) => e.button === 0 && onPick()}
    >
      <span className="review-dot" data-state={state} title={STATE_LABELS[state]} />
      <span className="code-tab-name">{itemName(item, nodes)}</span>
      <span className="review-tab-counts">
        <span className="added">+{added}</span>
        <span className="removed">−{removed}</span>
      </span>
      {left > 0 ? (
        <span className="review-tab-left" title={`${left} files not viewed`}>
          <DiffIcon size={11} />
          {left}
        </span>
      ) : (
        <span className="review-tab-done" title="Every file viewed">
          <CheckIcon size={11} />
        </span>
      )}
      {review.comments.length > 0 && (
        <span className="review-tab-left" title="Comments not sent">
          <ChatIcon size={11} />
          {review.comments.length}
        </span>
      )}
    </div>
  )
}

// A card over the diff, at `place`; it reports its height so the gap under its line fits it.
function Card({
  place,
  onSize,
  onWheel,
  children
}: {
  place?: Place
  onSize: (height: number) => void
  onWheel: (e: WheelEvent) => void
  children: ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const size = useRef(onSize)
  useEffect(() => {
    size.current = onSize
  })
  useEffect(() => {
    const el = ref.current as HTMLDivElement
    const observer = new ResizeObserver(() => size.current(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className="review-card"
      style={
        place
          ? { top: place.top, left: place.left, width: place.width }
          : { opacity: 0, pointerEvents: 'none' }
      }
      onWheel={onWheel}
    >
      {children}
    </div>
  )
}

function CommentEditor({
  lines,
  initial,
  onDone,
  onCancel
}: {
  lines: [number, number]
  initial: string
  onDone: (text: string) => void
  onCancel: () => void
}): JSX.Element {
  const [text, setText] = useState(initial)
  const field = useRef<HTMLTextAreaElement>(null)
  // After the click that opened it: Monaco takes the focus back on the mouse going down in its
  // gutter, so the field takes it on the next frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = field.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div className="review-comment editing">
      <span className="review-comment-where">{lineRange({ start: lines[0], line: lines[1] })}</span>
      <textarea
        ref={field}
        className="text-input review-note"
        aria-label="Comment"
        rows={3}
        value={text}
        placeholder="What should change here?"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            onDone(text)
          }
        }}
      />
      <div className="review-comment-actions">
        <span className="field-hint">Ctrl+Enter</span>
        <button className="button small subtle" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button small primary"
          disabled={!text.trim()}
          onClick={() => onDone(text)}
        >
          Comment
        </button>
      </div>
    </div>
  )
}

function CommentView({
  comment,
  onEdit,
  onRemove
}: {
  comment: Anchored
  onEdit: () => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="review-comment">
      <div className="review-comment-head">
        <span className="review-comment-where">{lineRange(comment)}</span>
        {comment.outdated && <span className="review-changed">line changed</span>}
        <span className="review-comment-actions">
          <button className="button small subtle" onClick={onEdit}>
            Edit
          </button>
          <button className="button small subtle danger" onClick={onRemove}>
            Delete
          </button>
        </span>
      </div>
      <p className="review-comment-text">{comment.text}</p>
    </div>
  )
}

const LOAD_ERRORS: Record<string, string> = {
  binary: "It's a binary file, which the diff doesn't show.",
  large: "It's over 5 MB, too big for the diff.",
  missing: "It isn't there any more: it was moved or deleted.",
  outside: 'It is outside the folders of this workspace.'
}

// The file to show: the one picked, else the first not viewed yet, else the first.
function pickFile(item: ReviewItem, review: ReviewItemState): ReviewFile | null {
  return (
    item.files.find((f) => f.path === review.file) ??
    item.files.find((f) => review.viewed[f.path] !== f.sig) ??
    item.files[0] ??
    null
  )
}

function itemName(item: ReviewItem, nodes: CanvasNode[]): string | undefined {
  const names = item.nodeIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((node): node is CanvasNode => Boolean(node))
    .map(nodeLabel)
  if (item.worktree) return names.join(', ') || item.branch
  return names.length ? names.join(', ') : item.folder.split('/').pop()
}

// The lines selected, the one with the cursor if none; a selection ending at the start of a line
// doesn't take that line.
function selectedLines(editor: monaco.editor.ICodeEditor): [number, number] {
  const s = editor.getSelection()
  if (!s) return [1, 1]
  const end =
    s.endColumn === 1 && s.endLineNumber > s.startLineNumber ? s.endLineNumber - 1 : s.endLineNumber
  return [s.startLineNumber, end]
}

// Where a comment's line is now: where it was left if that line still reads the same, else the
// nearest line that does, else where it was (marked outdated).
function anchor(
  model: Model,
  comment: ReviewComment
): { line: number; start: number; outdated?: boolean } {
  const count = model.getLineCount()
  const same = (n: number): boolean =>
    n >= 1 && n <= count && model.getLineContent(n).trim() === comment.snippet.trim()
  const span = comment.line - comment.start
  if (same(comment.line)) return { line: comment.line, start: comment.start }
  for (let d = 1; d <= 400; d++) {
    for (const n of [comment.line - d, comment.line + d]) {
      if (same(n)) return { line: n, start: Math.max(1, n - span) }
    }
  }
  const line = Math.min(comment.line, count)
  return { line, start: Math.max(1, line - span), outdated: true }
}

function lineRange({ start, line }: { start: number; line: number }): string {
  return start && start !== line ? `lines ${start}–${line}` : `line ${line}`
}

// The message the agent gets: each comment with where it is and the code it's about, then the
// overall comment.
function feedback(comments: ReviewComment[], note: string): string {
  if (!comments.length && !note.trim()) return ''
  const parts = [
    'Review of your changes, from the user in Nara. Address each comment, then tell me what you changed.'
  ]
  comments.forEach((c, i) => {
    const quote = c.quote
      .split('\n')
      .map((l) => `   > ${l}`)
      .join('\n')
    parts.push(
      `${i + 1}. ${c.path}, ${lineRange(c)}:\n${quote}\n   ${c.text.replace(/\n/g, '\n   ')}`
    )
  })
  if (note.trim()) parts.push(`Overall: ${note.trim()}`)
  return parts.join('\n\n')
}

function conflictMessage(item: ReviewItem, files: string[]): string {
  return [
    `Merging ${item.branch} into ${item.base} conflicts in: ${files.join(', ')}.`,
    `Merge ${item.base} into your branch (git merge ${item.base}), resolve the conflicts keeping both sides' intent, check it still works, and commit. Tell me when it's done.`
  ].join(' ')
}

// Monaco keeps one model per URI; each read of a file's old side gets its own.
let uris = 0
function uniqueUri(scheme: string, path: string): monaco.Uri {
  uris += 1
  return monaco.Uri.from({ scheme, path, query: String(uris) })
}

function splitCard(entry: string): [string, number] {
  const i = entry.lastIndexOf(':')
  return [entry.slice(0, i), Number(entry.slice(i + 1))]
}
