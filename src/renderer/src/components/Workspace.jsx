import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { tell } from '../dialogs'
import { createPortal } from 'react-dom'
import Canvas, { ZOOM_MAX, ZOOM_MIN } from './Canvas'
import Links, { LinkPins } from './Links'
import CanvasNode from './CanvasNode'
import Terminal from './Terminal'
import Note from './Note'
import BrowserNode from './BrowserNode'
import Shapes from './Shapes'
import StyleBar from './StyleBar'
import Launcher from './Launcher'
import Inspector from './Inspector'
import TopBar from './TopBar'
import Minimap from './Minimap'
import Explorer from './Explorer'
import WorkspaceNav from './WorkspaceNav'
import ViewSwitch from './ViewSwitch'
import {
  ArrowIcon,
  CircleIcon,
  DiamondIcon,
  EraserIcon,
  FitIcon,
  GlobeIcon,
  HandIcon,
  LineIcon,
  LinkIcon,
  MapIcon,
  MinusIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
  PointerIcon,
  SquareIcon,
  TerminalIcon,
  TextIcon,
  TriangleIcon
} from './icons'
import { useWhiteboard } from '../whiteboard'
import { PAPERS, resolveStyle, terminalLook } from '../nodeStyle'
import { defaultTitle, nodeLabel } from '../nodeLabel'
import { AGENTS } from '../../../shared/agents'
import { CODE_TOGGLE, REVIEW_TOGGLE, canvasKeyFor } from '../shortcuts'
import { totalUsage } from '../telemetry'
import { tip } from '../tip'

// Monaco is big; it loads the first time a workspace switches to code or review.
const CodeView = lazy(() => import('./CodeView'))
const ReviewView = lazy(() => import('./ReviewView'))

// How often the explorer reads its folder again while it's on screen, in ms. Agents add and remove
// files all the time; a read is one git command.
const FILES_POLL = 4000
// How often the review queue is read again, in ms: often while it's on screen, now and then
// otherwise, for the count on the Review tab. A read is a few git commands per agent.
const QUEUE_POLL = { shown: 3000, hidden: 10000 }

// Size of a new node of each type.
const SIZES = {
  terminal: { w: 640, h: 400 },
  note: { w: 280, h: 200 },
  browser: { w: 960, h: 640 }
}
// The room a browser filling the screen leaves around it, in screen pixels: the same as the side
// panel's.
const EXPANDED_MARGIN = 10

// Each step of the zoom buttons and keys multiplies the zoom by this.
const ZOOM_STEP = 1.25
// How far the pointer can wander, in screen pixels, for a press on a link handle to still count
// as a click.
const CLICK_SLOP = 4
// How long the camera takes to glide to a new spot (zoom buttons, fit).
const FLY_TIME = 260
// Room left around the nodes when fitting them on screen, in screen pixels; the bottom also
// clears the dock.
const FIT_PADDING = { side: 64, top: 64, bottom: 110 }

// One canvas with its camera, nodes, links and whiteboard. `saved` is what was loaded from disk: from then on
// this component owns the state, and main keeps a copy that it saves.
// An inactive workspace is hidden, not unmounted, so its terminals keep running. New terminals
// and agents open in `folder`; a workspace from before folders existed has none, and onPickFolder
// asks for one. `roles` has every role an agent can take, built-in and custom, by key; onSaveRole
// and onRemoveRole change the custom ones. `commands` are the agents' commands from the settings,
// for the new terminal dialog. `jump` ({ nodeId, at }) is the pet sending the user to one of this
// workspace's agents. `meta` and `project` are the workspace's name and project, for the top bar;
// `statuses` and `telemetry` what main reports about its agents, by node id. `inspector` says
// whether the side panel is open, and onInspector opens or closes it. `navSlot` is where in the sidebar its views and
// agents go while it's on screen, or null while the sidebar is hidden. onShortcuts opens the list
// of shortcuts (the ? key).
export default function Workspace({
  workspaceId,
  saved,
  active,
  folder,
  meta,
  project,
  statuses,
  telemetry,
  limits,
  onPickFolder,
  roles,
  commands,
  jump,
  inspector,
  onInspector,
  navSlot,
  sidebarHidden,
  onShowSidebar,
  onSaveRole,
  onRemoveRole,
  onShortcuts
}) {
  const container = useRef(null)
  const [cam, setCam] = useState(saved.camera)
  const [nodes, setNodes] = useState(saved.nodes)
  // Links have no direction for now: from/to only say which node the drag started on.
  const [links, setLinks] = useState(saved.links)
  // Link being dragged: source node, tip in world coordinates and the valid node under the
  // cursor (or null).
  const [draft, setDraft] = useState(null)
  // 'hand', 'erase', a whiteboard tool (whiteboard.js) or null: the pointer works on the nodes
  // and shapes as usual.
  const [tool, setTool] = useState(null)
  // The shape the dock's shapes button draws: the last one picked from its menu.
  const [shapeKind, setShapeKind] = useState(() => localStorage.getItem('shape-kind') ?? 'rect')
  const [shapeMenu, setShapeMenu] = useState(false)
  // Space held down: the pointer pans the camera from anywhere, like the hand tool.
  const [grab, setGrab] = useState(false)
  // The selected nodes' ids. The side panel edits the node when there's exactly one; several move
  // together when one of them is dragged.
  const [selection, setSelection] = useState([])
  // What was selected when a selection box started, for a box that adds to it.
  const boxBase = useRef([])
  const shapeBoxBase = useRef([])
  // Where each node of the group being dragged started.
  const moveOrigin = useRef(null)
  // The viewport's size in pixels, for the minimap's view of the camera, with the side panel's
  // width and the top bar's height (main.css) for a browser filling the room between them.
  const [size, setSize] = useState({ w: 0, h: 0, panel: 0, top: 0 })
  const [minimap, setMinimap] = useState(() => localStorage.getItem('minimap') === 'open')
  // The new terminal dialog, while open: { number } is the id the terminal will get.
  const [launcher, setLauncher] = useState(null)
  // The inspector's section, kept while the selection moves from node to node.
  const [panelTab, setPanelTab] = useState('activity')
  // How many times each node's agent was restarted from the inspector: a new count remounts its
  // terminal, which starts the agent again and resumes its conversation.
  const [restarts, setRestarts] = useState({})
  // The last edit the inspector sent each note ({ seq, type, ... }), applied by the note once.
  const [noteCommands, setNoteCommands] = useState({})
  // The node whose row the pointer is on in the panel's connections, lit up on the canvas.
  const [hoveredPeer, setHoveredPeer] = useState(null)
  // The code view: whether it shows instead of the canvas, the folder its explorer is on (the
  // workspace's own or an agent's worktree), the open files and the one showing. Saved with the
  // workspace.
  const [code, setCode] = useState(() => ({
    mode: 'canvas',
    root: null,
    tabs: [],
    current: null,
    ...saved.code
  }))
  // Once the code view has been opened it stays mounted, with its editor's state, until the
  // workspace closes.
  const [codeMounted, setCodeMounted] = useState(code.mode === 'code')
  // The explorer's folder as main read it: { root, files, status, repo, truncated } or null.
  const [listing, setListing] = useState(null)
  const [listingSeq, setListingSeq] = useState(0)
  // Folders made in the explorer that have no files yet: git doesn't list those.
  const [madeFolders, setMadeFolders] = useState([])
  // The review view (ReviewView.jsx): the item showing, split or inline, and by repository what's
  // been viewed and the comments not sent yet. Saved with the workspace.
  const [review, setReview] = useState(() => ({
    folder: null,
    inline: true,
    items: {},
    ...saved.review
  }))
  const [reviewMounted, setReviewMounted] = useState(code.mode === 'review')
  // What the agents changed (main/review.js), or null until it's first read.
  const [queue, setQueue] = useState(null)
  const [queueSeq, setQueueSeq] = useState(0)
  // The browser node filling the room between the panels, or null, and the box it was resized
  // to there (in screen pixels), or null for the whole room.
  const [expanded, setExpanded] = useState(null)
  const [expandedBox, setExpandedBox] = useState(null)
  // Counters pick up after the saved ids and layers.
  const nextId = useRef(highest(saved.nodes, 'id') + 1)
  const nextLinkId = useRef(highest(saved.links, 'id') + 1)
  const topLayer = useRef(highest(saved.nodes, 'layer'))
  // The link drag reads the camera from its listeners; the ref avoids using a stale camera
  // if the user zooms mid-drag.
  const camRef = useRef(cam)
  useEffect(() => {
    camRef.current = cam
  }, [cam])
  const flight = useRef(0)

  const board = useWhiteboard({
    saved,
    camRef,
    tool,
    setTool,
    clearNodes: () => setSelection([]),
    // A drag of shapes takes the selected nodes along.
    group: {
      start: () => moveStartGroup(selection),
      by: moveBy
    }
  })

  useEffect(() => {
    localStorage.setItem('shape-kind', shapeKind)
  }, [shapeKind])

  // Main saves the workspace to disk and delivers agent messages along its links.
  useEffect(() => {
    window.api.workspace.update(workspaceId, {
      camera: cam,
      nodes,
      links,
      shapes: board.shapes,
      code,
      review
    })
  }, [workspaceId, cam, nodes, links, board.shapes, code, review])

  // An agent wrote to a note with `nara note`. Main has already changed its own copy; this
  // brings the screen in line with it.
  useEffect(
    () =>
      window.api.workspace.onNoteWritten((id, nodeId, text) => {
        if (id !== workspaceId) return
        setNodes((current) =>
          current.map((node) => (node.id === nodeId ? { ...node, text } : node))
        )
      }),
    [workspaceId]
  )

  function updateNode(id, changes) {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...changes } : node)))
  }

  // Brings a node to the front by changing only its z-index. Reordering the array would make
  // React move the element in the DOM, and the terminal inside would lose focus.
  function raise(id) {
    const node = nodes.find((n) => n.id === id)
    if (node.layer === topLayer.current) return
    updateNode(id, { layer: ++topLayer.current })
  }

  useEffect(() => {
    localStorage.setItem('minimap', minimap ? 'open' : 'closed')
  }, [minimap])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const css = getComputedStyle(entry.target)
      setSize({
        w: width,
        h: height,
        panel: parseFloat(css.getPropertyValue('--inspector-width')) || 0,
        top: parseFloat(css.getPropertyValue('--topbar-height')) || 0
      })
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  // Clicking a node brings it to the front and selects it. Shift or Ctrl adds it to the selection
  // or takes it out; a node that's already part of a selection keeps the group, so dragging it
  // moves them all.
  function pointerDownOnNode(node, e) {
    // With the connect tool, a press on a node pulls a string out of it instead.
    if (tool === 'link') {
      if (e.button !== 0) return
      startLink(node.id, e)
      return
    }
    raise(node.id)
    // Looking at an agent that finished counts as having seen it; one that asked for something
    // still waits for an answer.
    if (statuses.get(node.id)?.state === 'review') window.api.agents.seen(workspaceId, node.id)
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) board.setSelected([])
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelection((current) =>
        current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id]
      )
    } else if (!selection.includes(node.id)) {
      setSelection([node.id])
    }
  }

  // Dragging a node's bar moves it, and the rest of the selection with it if it's selected: the
  // other nodes and the selected shapes.
  function moveStart(id) {
    moveStartGroup(selection.includes(id) ? selection : [id])
    board.startGroupMove()
  }

  function moveStartGroup(group) {
    moveOrigin.current = new Map(
      nodes.filter((n) => group.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }])
    )
  }

  function moveNodesBy(dx, dy) {
    const origin = moveOrigin.current
    if (!origin?.size) return
    setNodes((current) =>
      current.map((n) =>
        origin.has(n.id) ? { ...n, x: origin.get(n.id).x + dx, y: origin.get(n.id).y + dy } : n
      )
    )
  }

  function moveBy(dx, dy) {
    moveNodesBy(dx, dy)
    board.groupMoveBy(dx, dy)
  }

  // A selection box picks every node it touches, plus what was selected before if it adds.
  function selectBox(box, additive, first) {
    if (first) {
      boxBase.current = additive ? selection : []
      shapeBoxBase.current = additive ? board.selected : []
    }
    board.selectInBox(box, shapeBoxBase.current)
    const inside = nodes
      .filter((n) => n.x < box.x + box.w && n.x + n.w > box.x)
      .filter((n) => n.y < box.y + box.h && n.y + n.h > box.y)
      .map((n) => n.id)
    setSelection([...new Set([...boxBase.current, ...inside])])
  }

  // A click on empty canvas clears the selection; one on the bars and panels around it (the top
  // bar, the inspector, the dock) leaves it, so they can work on what's selected. Capture,
  // because the canvas and the nodes stop some pointer events on their way up.
  function pointerDownAnywhere(e) {
    // Panning (other buttons, Space, the hand) leaves the selection alone.
    if (e.button !== 0 || grab || tool === 'hand') return
    if (!e.target.closest('.viewport')) return
    if (e.target.closest('.node, .shape, .shape-frame')) return
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
      setSelection([])
      board.setSelected([])
    }
  }

  // Creates a node centered on the point (in world coordinates), in front of the others, with any
  // extra `fields` its type needs. Terminals and notes share the id sequence: the id is what
  // `nara send` takes, and it has to be unique across the whole workspace.
  function createNode(type, center, fields) {
    const id = nextId.current++
    const { w, h } = SIZES[type]
    const node = {
      id,
      type,
      x: Math.round(center.x - w / 2),
      y: Math.round(center.y - h / 2),
      w,
      h,
      layer: ++topLayer.current,
      title: defaultTitle(type, id),
      ...fields
    }
    setNodes((current) => [...current, node])
    setSelection([id])
  }

  // New notes are graphite cards; any paper can be picked in the inspector.
  function newNote() {
    createNodeAtCenter('note', { text: '', style: { paper: 'graphite' } })
  }

  // A browser starts blank, its address bar waiting.
  function newBrowser() {
    createNodeAtCenter('browser', { url: '' })
  }

  // A browser fills the room between the panels, or goes back to its place on the canvas. It's
  // the one selected while it's there, so the side panel shows it.
  function toggleExpanded(id) {
    setExpandedBox(null)
    if (expanded === id) return setExpanded(null)
    raise(id)
    setSelection([id])
    board.setSelected([])
    setExpanded(id)
  }

  // Center of the viewport converted to world coordinates: world = (screen - (x, y)) / z.
  function createNodeAtCenter(type, fields) {
    const { width, height } = container.current.getBoundingClientRect()
    createNode(type, { x: (width / 2 - cam.x) / cam.z, y: (height / 2 - cam.y) / cam.z }, fields)
  }

  // The dock's Terminal button and T open the new terminal dialog, which picks what runs in it.
  function openLauncher() {
    setLauncher({ number: nextId.current })
  }

  // Opens what the dialog chose. An agent node is a terminal that opens straight into the agent;
  // other agents and `nara send` still call it "terminal N", whatever its title. The session id
  // lets the node resume its conversation after a restart; agents that can't resume ignore it.
  // An agent needs a folder, so a workspace without one asks for it first.
  // With `isolate`, the agent gets a git worktree of its own first, on a new branch, and opens
  // there.
  async function launch({ agent, cwd, isolate, ...fields }) {
    let dir = cwd ?? (agent ? await onPickFolder() : undefined)
    if (agent && !dir) return
    let worktree
    if (isolate) {
      const made = await window.api.git.worktree(dir, fields.title)
      if (made.error) {
        tell({ title: 'Couldn’t make a worktree', message: made.error })
        return
      }
      worktree = made
      dir = made.path
    }
    createNodeAtCenter('terminal', {
      ...fields,
      ...(dir && { cwd: dir }),
      ...(worktree && { worktree }),
      ...(agent && { agent, session: crypto.randomUUID() })
    })
  }

  // Moves the camera to `target` over a short glide instead of jumping, easing out.
  function flyTo(target) {
    cancelAnimationFrame(flight.current)
    const from = camRef.current
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches
    let start = null
    function step(now) {
      start ??= now
      const t = instant ? 1 : Math.min(1, (now - start) / FLY_TIME)
      const k = 1 - (1 - t) ** 3
      setCam({
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        z: from.z + (target.z - from.z) * k
      })
      if (t < 1) flight.current = requestAnimationFrame(step)
    }
    flight.current = requestAnimationFrame(step)
  }

  // Zooms to `z` keeping the center of the viewport where it is.
  function zoomTo(z) {
    const { width, height } = container.current.getBoundingClientRect()
    const c = camRef.current
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
    const wx = (width / 2 - c.x) / c.z
    const wy = (height / 2 - c.y) / c.z
    flyTo({ x: width / 2 - wx * next, y: height / 2 - wy * next, z: next })
  }

  // Frames every node and shape, never zooming in past 100%.
  function zoomToFit() {
    const boxes = [...nodes, ...board.bounds()]
    if (!boxes.length) return flyTo({ x: 0, y: 0, z: 1 })
    const left = Math.min(...boxes.map((b) => b.x))
    const top = Math.min(...boxes.map((b) => b.y))
    const right = Math.max(...boxes.map((b) => b.x + b.w))
    const bottom = Math.max(...boxes.map((b) => b.y + b.h))
    const { width, height } = container.current.getBoundingClientRect()
    const room = {
      w: width - FIT_PADDING.side * 2,
      h: height - FIT_PADDING.top - FIT_PADDING.bottom
    }
    const z = Math.max(
      ZOOM_MIN,
      Math.min(1, room.w / Math.max(1, right - left), room.h / Math.max(1, bottom - top))
    )
    flyTo({
      x: FIT_PADDING.side + (room.w - (right - left) * z) / 2 - left * z,
      y: FIT_PADDING.top + (room.h - (bottom - top) * z) / 2 - top * z,
      z
    })
  }

  // A workspace that's put away takes its dialog with it.
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (!active) setLauncher(null)
  }

  // The folders the code view can work in: the workspace's, and each agent's worktree.
  const roots = [
    folder && { path: folder, label: folder.split('/').pop() || folder },
    ...nodes
      .filter((n) => n.worktree?.path)
      .map((n) => ({ path: n.worktree.path, label: `${nodeLabel(n)} · ${n.worktree.branch}` }))
  ].filter(Boolean)
  const root = roots.find((r) => r.path === code.root)?.path ?? roots[0]?.path ?? null
  const coding = code.mode === 'code'
  const reviewing = code.mode === 'review'
  // Code and review both take the canvas's place.
  const offCanvas = coding || reviewing
  const codeVisible = active && coding

  function setMode(mode) {
    if (mode === 'code') setCodeMounted(true)
    if (mode === 'review') setReviewMounted(true)
    setCode((current) => ({ ...current, mode }))
  }

  // Opens the review on the change a node's agent is making.
  function reviewNode(nodeId) {
    const item = queue?.find((i) => i.nodeIds.includes(nodeId))
    if (item) setReview((current) => ({ ...current, folder: item.folder }))
    setMode('review')
  }

  // Reads the review queue: now, every few seconds while the window has the focus (more often
  // while the review shows), and whenever it gets the focus back.
  useEffect(() => {
    if (!active) return
    let live = true
    const read = () => window.api.review.queue(workspaceId).then((items) => live && setQueue(items))
    read()
    const timer = setInterval(
      () => document.hasFocus() && read(),
      reviewing ? QUEUE_POLL.shown : QUEUE_POLL.hidden
    )
    window.addEventListener('focus', read)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener('focus', read)
    }
  }, [active, reviewing, workspaceId, queueSeq])

  // Changes waiting on the user: their agents aren't at work on them.
  const toReview = (queue ?? []).filter(
    (item) => !item.nodeIds.some((id) => statuses.get(id)?.state === 'working')
  ).length

  // Opens a file in the code view, switching to it, in a new tab unless it has one.
  function openFile(path) {
    setCodeMounted(true)
    setCode((current) => ({
      ...current,
      mode: 'code',
      tabs: current.tabs.includes(path) ? current.tabs : [...current.tabs, path],
      current: path
    }))
  }

  // A file or folder renamed in the explorer: its tabs follow it, unsaved edits and all.
  async function movedFile(from, to, type) {
    const { moveBuffer } = await import('../buffers')
    const moves = new Map()
    for (const tab of code.tabs) {
      if (tab === from) moves.set(tab, to)
      else if (type === 'folder' && tab.startsWith(`${from}/`)) {
        moves.set(tab, to + tab.slice(from.length))
      }
    }
    for (const [a, b] of moves) moveBuffer(a, b)
    const move = (path) => moves.get(path) ?? path
    setCode((current) => ({
      ...current,
      tabs: current.tabs.map(move),
      current: current.current && move(current.current)
    }))
    refreshFiles()
  }

  // A file or folder moved to the trash: its tabs close.
  function trashedFile(path) {
    const gone = (tab) => tab === path || tab.startsWith(`${path}/`)
    setCode((current) => {
      const tabs = current.tabs.filter((tab) => !gone(tab))
      return {
        ...current,
        tabs,
        current: current.current && gone(current.current) ? (tabs.at(-1) ?? null) : current.current
      }
    })
    const rel = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null
    if (rel)
      setMadeFolders((current) => current.filter((f) => f !== rel && !f.startsWith(`${rel}/`)))
    refreshFiles()
  }

  function refreshFiles() {
    setListingSeq((n) => n + 1)
  }

  // Reads the explorer's folder while the code view shows: now, every few seconds while the
  // window has the focus, and whenever it gets it back.
  useEffect(() => {
    if (!codeVisible || !root) return
    let live = true
    const read = () =>
      window.api.code.list(workspaceId, root).then((result) => {
        if (live) setListing({ root, ...result })
      })
    read()
    const timer = setInterval(() => document.hasFocus() && read(), FILES_POLL)
    window.addEventListener('focus', read)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener('focus', read)
    }
  }, [codeVisible, root, workspaceId, listingSeq])

  // A new root starts without the folders made in the last one.
  const [madeRoot, setMadeRoot] = useState(root)
  if (root !== madeRoot) {
    setMadeRoot(root)
    setMadeFolders([])
  }

  // Ctrl+Shift+E switches between the canvas and the code, and Ctrl+Shift+G to the review and
  // back, from anywhere in the workspace: taken in the capture phase, before a terminal or the
  // editor gets it.
  useEffect(() => {
    if (!active) return
    function onKeyDown(e) {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return
      const to =
        e.code === CODE_TOGGLE.code
          ? coding
            ? 'canvas'
            : 'code'
          : e.code === REVIEW_TOGGLE.code
            ? reviewing
              ? 'canvas'
              : 'review'
            : null
      if (!to) return
      e.preventDefault()
      e.stopPropagation()
      setMode(to)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  // Single-key tools and zoom, while this workspace's canvas is on screen and nothing takes text.
  useEffect(() => {
    if (!active || launcher || offCanvas) return
    const actions = {
      select: () => setTool(null),
      hand: () => setTool('hand'),
      minimap: () => setMinimap((open) => !open),
      draw: () => setTool('draw'),
      erase: () => setTool('erase'),
      link: () => setTool((current) => (current === 'link' ? null : 'link')),
      text: () => setTool('text'),
      rect: () => pickShape('rect'),
      ellipse: () => pickShape('ellipse'),
      line: () => pickShape('line'),
      arrow: () => pickShape('arrow'),
      terminal: openLauncher,
      note: newNote,
      browser: newBrowser,
      zoomIn: () => zoomTo(camRef.current.z * ZOOM_STEP),
      zoomOut: () => zoomTo(camRef.current.z / ZOOM_STEP),
      zoomReset: () => zoomTo(1),
      zoomFit: zoomToFit,
      shortcuts: onShortcuts
    }
    const typing = (e) => e.target.closest?.('.xterm, input, textarea, select')
    function onKeyDown(e) {
      if (e.defaultPrevented || typing(e)) return
      if (e.key === 'Escape' && expanded != null) {
        setExpanded(null)
        return
      }
      // A browser filling the screen keeps the camera and the tools out of it.
      if (expanded != null) return
      if (e.key === 'Escape') {
        setTool(null)
        setSelection([])
        board.setSelected([])
        setShapeMenu(false)
        return
      }
      if (board.onKeyDown(e)) {
        e.preventDefault()
        return
      }
      // Space on a focused button still presses it.
      if (e.code === 'Space' && !e.target.closest?.('button')) {
        e.preventDefault()
        setGrab(true)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault()
        setSelection(nodes.map((n) => n.id))
        board.setSelected(board.shapes.map((shape) => shape.id))
        return
      }
      const name = canvasKeyFor(e)
      if (!name) return
      e.preventDefault()
      actions[name]()
    }
    // Let go of Space anywhere, even after the focus moved, and the hand goes away.
    function onKeyUp(e) {
      if (e.code === 'Space') setGrab(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onKeyUp)
    }
  })

  // Removing the node from state unmounts its <Terminal>, whose cleanup kills the PTY.
  function closeNode(id) {
    setNodes((current) => current.filter((node) => node.id !== id))
    setLinks((current) => current.filter((l) => l.from !== id && l.to !== id))
    // A node that's gone isn't selected any more: with two selected, the inspector would otherwise
    // keep showing the workspace instead of the one left.
    setSelection((current) => current.filter((other) => other !== id))
    setExpanded((current) => (current === id ? null : current))
  }

  // Whether a link from one node to another would be new and valid. Two linked terminals can
  // message each other and a terminal linked to a note can read and write it; two notes can't be
  // linked, since there would be no agent on either end.
  function canLink(from, to) {
    const a = nodes.find((n) => n.id === from)
    const b = nodes.find((n) => n.id === to)
    if (!a || !b || a.id === b.id) return false
    if (a.type !== 'terminal' && b.type !== 'terminal') return false
    return !links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))
  }

  // Pulls a string out of a node, from its port on the bar or from the connector in its panel.
  // Dragging and letting go on another node links the two. A click without dragging leaves the
  // string on the cursor instead, and the next click picks the other end; Escape, or a click
  // anywhere but a node that can take the link, puts it away.
  function startLink(from, e) {
    if (e.button !== 0) return
    // Without this the pointerdown bubbles up to the bar and the node starts moving.
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = { x: e.clientX, y: e.clientY }
    let mode = 'drag'
    let moved = false

    // With the pointer captured, events always target the handle; to find out what is under
    // the cursor we have to ask the document.
    function nodeUnder(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node')
      const id = Number(el?.dataset.id)
      return canLink(from, id) ? id : null
    }

    // clientX/Y count from the window, and the viewport starts right of the sidebar.
    const viewport = container.current.getBoundingClientRect()
    function show(ev) {
      const c = camRef.current
      setDraft({
        from,
        mode,
        x: (ev.clientX - viewport.left - c.x) / c.z,
        y: (ev.clientY - viewport.top - c.y) / c.z,
        target: nodeUnder(ev)
      })
    }

    function onMove(ev) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > CLICK_SLOP) moved = true
      if (moved || mode === 'pick') show(ev)
    }

    function onUp(ev) {
      if (mode === 'pick') return
      if (moved) return finish(nodeUnder(ev))
      mode = 'pick'
      show(ev)
    }

    // The click that picks the other end does nothing else: not select a node, not press a
    // button under it.
    function onPick(ev) {
      if (mode !== 'pick') return
      ev.preventDefault()
      ev.stopPropagation()
      swallowNextClick()
      finish(ev.button === 0 ? nodeUnder(ev) : null)
    }

    function onKeyDown(ev) {
      if (ev.key !== 'Escape') return
      ev.stopPropagation()
      finish(null)
    }

    function onCancel() {
      if (mode === 'drag') finish(null)
    }

    function finish(to) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('pointerdown', onPick, true)
      window.removeEventListener('keydown', onKeyDown, true)
      setDraft(null)
      if (to) addLink(from, to)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('pointerdown', onPick, true)
    window.addEventListener('keydown', onKeyDown, true)
  }

  function addLink(from, to) {
    setLinks((current) => {
      const exists = current.some(
        (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from)
      )
      return exists ? current : [...current, { id: nextLinkId.current++, from, to }]
    })
  }

  function removeLink(id) {
    setLinks((current) => current.filter((l) => l.id !== id))
  }

  // Glides the camera until the node sits in the middle of the screen, at the same zoom, and
  // selects it.
  function locate(id) {
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    const { width, height } = container.current.getBoundingClientRect()
    const { z } = camRef.current
    // Selecting it opens the inspector if the panel is on: the node centers in the room left.
    const panel = inspector
      ? parseFloat(getComputedStyle(container.current).getPropertyValue('--inspector-width')) + 24
      : 0
    flyTo({
      x: (width - panel) / 2 - (node.x + node.w / 2) * z,
      y: height / 2 - (node.y + node.h / 2) * z,
      z
    })
    raise(id)
    setSelection([id])
  }

  // The pet's jump: the camera glides to the agent, and its terminal takes the keyboard. Checked
  // on every render, like the keys below, and done once per jump.
  const jumped = useRef(null)
  useEffect(() => {
    if (!jump || !active || jumped.current === jump.at) return
    jumped.current = jump.at
    setMode('canvas')
    locate(jump.nodeId)
    container.current
      .querySelector(`.node[data-id="${jump.nodeId}"] .xterm-helper-textarea`)
      ?.focus()
  })

  // The dock's shapes button draws the last shape picked from its menu.
  function pickShape(kind) {
    setShapeKind(kind)
    setTool(kind)
    setShapeMenu(false)
  }

  const selectedNode = selection.length === 1 && nodes.find((node) => node.id === selection[0])
  // The side panel, while it's open: the inspector on the canvas, the explorer in the code, the
  // files and actions in the review. The views sit at its top.
  const panelShown = inspector
  const views = (
    <ViewSwitch mode={code.mode} onMode={setMode} toReview={toReview} className="panel-views" />
  )
  const linked = new Set(links.flatMap((l) => [l.from, l.to]))
  const working = new Set(
    [...statuses.values()].filter((s) => s.state === 'working').map((s) => s.nodeId)
  )
  // The browser filling the screen: its box in world coordinates, on the room left of the side
  // panel and under the top bar, scaled back by the zoom so the page shows at its own size.
  const expandedNode = !offCanvas && nodes.find((n) => n.id === expanded && n.type === 'browser')
  const frame = expandedNode && size.w > 0 && expandedFrame()
  function expandedFrame() {
    const room = expandedRoom()
    const box = expandedBox ? fitIn(expandedBox, room) : room
    return {
      x: (box.x - cam.x) / cam.z,
      y: (box.y - cam.y) / cam.z,
      w: box.w,
      h: box.h,
      scale: 1 / cam.z,
      screen: box
    }
  }
  // The room between the panels, in screen pixels.
  function expandedRoom() {
    const x = EXPANDED_MARGIN
    const y = size.top + EXPANDED_MARGIN
    const right = size.w - (panelShown ? size.panel + EXPANDED_MARGIN * 2 : EXPANDED_MARGIN)
    return { x, y, w: Math.max(240, right - x), h: Math.max(160, size.h - EXPANDED_MARGIN - y) }
  }
  // Whether a browser takes the pointer: the one selected alone, or filling the screen.
  const browsing = (node) =>
    expanded === node.id || (selection.length === 1 && selection[0] === node.id && !tool)
  // While a string is out, the nodes it can't be tied to step back.
  const dimmed = (node) => draft && node.id !== draft.from && !canLink(draft.from, node.id)
  const linkSource = draft && nodes.find((n) => n.id === draft.from)
  const hasTargets = draft && nodes.some((n) => canLink(draft.from, n.id))
  // The agent in a terminal: the one it opened with, or one typed in it (main/shell.js).
  const agentOf = (n) => (AGENTS[n.agent] ? n.agent : (statuses.get(n.id)?.agent ?? null))
  const agentNodes = nodes
    .filter((n) => n.type === 'terminal' && agentOf(n))
    .map((n) => (AGENTS[n.agent] ? n : { ...n, agent: agentOf(n) }))
  const spend = {
    ...totalUsage(agentNodes.map((n) => telemetry.get(n.id)?.usage)),
    agents: agentNodes.map((n) => ({
      id: n.id,
      name: nodeLabel(n),
      agent: n.agent,
      usage: telemetry.get(n.id)?.usage
    }))
  }

  return (
    <div
      className={draft ? 'workspace linking' : 'workspace'}
      ref={container}
      hidden={!active}
      data-inspector={panelShown ? 'open' : undefined}
      data-mode={code.mode}
      data-expanded={frame ? '' : undefined}
      onPointerDownCapture={pointerDownAnywhere}
    >
      <Canvas
        cam={cam}
        setCam={setCam}
        tool={tool}
        grab={grab}
        locked={Boolean(frame)}
        onSelectBox={selectBox}
        onToolStart={board.toolStart}
        onToolMove={board.toolMove}
        onToolEnd={board.toolEnd}
        overlay={
          <>
            <LinkPins nodes={nodes} links={links} draft={draft} />
            <Shapes
              shapes={board.shapes}
              draft={board.draft}
              selected={new Set(board.selected)}
              editing={board.editing}
              zoom={cam.z}
              onShapeDown={board.onShapeDown}
              onShapeDoubleClick={board.onShapeDoubleClick}
              onHandleDown={board.onHandleDown}
              onText={board.onText}
              onTextDone={board.onTextDone}
            />
          </>
        }
      >
        <Links
          nodes={nodes}
          links={links}
          live={working}
          focus={new Set(selection)}
          onRemove={removeLink}
        />
        {nodes.map((node) => (
          <CanvasNode
            key={node.id}
            {...node}
            label={nodeLabel(node)}
            agent={agentOf(node) && { key: agentOf(node), label: AGENTS[agentOf(node)].label }}
            role={Object.hasOwn(roles, node.role ?? '') ? roles[node.role] : undefined}
            look={node.type === 'terminal' ? terminalLook(node.style) : undefined}
            paper={node.type === 'note' ? PAPERS[resolveStyle(node.style).paper].color : undefined}
            paperDark={node.type === 'note' && PAPERS[resolveStyle(node.style).paper].dark}
            status={statuses.get(node.id)}
            usage={telemetry.get(node.id)?.usage}
            linked={linked.has(node.id)}
            selected={selection.includes(node.id)}
            isLinkTarget={draft?.target === node.id}
            dimmed={dimmed(node)}
            highlighted={hoveredPeer === node.id}
            frame={expandedNode?.id === node.id ? frame : undefined}
            onFrame={setExpandedBox}
            onChange={(changes) => updateNode(node.id, changes)}
            onRaise={(e) => pointerDownOnNode(node, e)}
            onMoveStart={() => moveStart(node.id)}
            onMoveBy={moveBy}
            onClose={() => closeNode(node.id)}
            onLinkStart={(e) => startLink(node.id, e)}
          >
            {node.type === 'note' ? (
              <Note
                text={node.text}
                style={node.style}
                view={node.view}
                command={noteCommands[node.id]}
                onChange={(text) => updateNode(node.id, { text })}
              />
            ) : node.type === 'browser' ? (
              <BrowserNode
                workspaceId={workspaceId}
                nodeId={node.id}
                url={node.url}
                interactive={browsing(node)}
                expanded={expandedNode?.id === node.id}
                onUrl={(url) => node.url !== url && updateNode(node.id, { url })}
                onExpand={() => toggleExpanded(node.id)}
                onFocus={() => {
                  raise(node.id)
                  if (expanded == null && !selection.includes(node.id)) setSelection([node.id])
                }}
              />
            ) : (
              <Terminal
                key={restarts[node.id] ?? 0}
                workspaceId={workspaceId}
                nodeId={node.id}
                agent={node.agent}
                session={node.session}
                // A plain terminal's role is for the agents typed in it, which main reads when
                // one starts; changing it mustn't restart the shell.
                role={AGENTS[node.agent] ? node.role : undefined}
                command={node.command}
                cwd={node.cwd}
                worktree={
                  node.worktree
                    ? JSON.stringify({ branch: node.worktree.branch, base: node.worktree.base })
                    : undefined
                }
                look={terminalLook(node.style)}
                onExit={() => closeNode(node.id)}
              />
            )}
          </CanvasNode>
        ))}
      </Canvas>

      {navSlot &&
        createPortal(
          <WorkspaceNav
            folder={folder}
            agents={agentNodes}
            statuses={statuses}
            telemetry={telemetry}
            queue={queue}
            selected={selectedNode ? selectedNode.id : null}
            onSelect={(id) => {
              if (id == null) setSelection([])
              else if (offCanvas) setSelection([id])
              else locate(id)
            }}
            onLocate={(id) => {
              setMode('canvas')
              locate(id)
            }}
            onReview={reviewNode}
          />,
          navSlot
        )}

      <TopBar
        workspace={meta}
        project={project}
        folder={folder}
        limits={limits}
        spend={spend}
        sidebarHidden={sidebarHidden}
        onShowSidebar={onShowSidebar}
        inspector={inspector}
        onInspector={onInspector}
        mode={code.mode}
        onMode={setMode}
        toReview={toReview}
        onLocate={(id) => {
          setMode('canvas')
          locate(id)
        }}
        // Dictation goes to the selected agent, if one is.
        onVoice={() =>
          window.api.voice.open(
            selectedNode && AGENTS[selectedNode.agent]
              ? { workspaceId, nodeId: selectedNode.id }
              : null
          )
        }
      />

      {codeMounted && (
        <Suspense fallback={null}>
          <CodeView
            workspaceId={workspaceId}
            visible={codeVisible}
            root={root}
            files={listing?.root === root ? listing.files : null}
            tabs={code.tabs}
            current={code.current}
            onTabs={({ tabs, current }) => setCode((c) => ({ ...c, tabs, current }))}
            onOpen={openFile}
          />
        </Suspense>
      )}

      {reviewMounted && (
        <Suspense fallback={null}>
          <ReviewView
            workspaceId={workspaceId}
            visible={active && reviewing}
            panel={inspector}
            items={queue}
            nodes={nodes}
            statuses={statuses}
            state={review}
            onState={setReview}
            onOpenFile={openFile}
            onNodeChange={updateNode}
            onRefresh={() => setQueueSeq((n) => n + 1)}
            views={views}
          />
        </Suspense>
      )}

      {coding && !root && (
        <div className="code-view code-message">
          <div className="empty-state">
            <h2 className="empty-title">No folder yet</h2>
            <p className="empty-text">
              Pick the folder this workspace works in, and its files show here.
            </p>
            <div className="empty-actions">
              <button className="button primary" onClick={onPickFolder}>
                Pick a folder
              </button>
            </div>
          </div>
        </div>
      )}

      {inspector && coding && !root && (
        <aside className="floating inspector explorer" aria-label="Explorer">
          {views}
        </aside>
      )}

      {inspector && coding && root && (
        <Explorer
          workspaceId={workspaceId}
          roots={roots}
          root={root}
          onRoot={(path) => setCode((c) => ({ ...c, root: path }))}
          listing={listing?.root === root ? listing : null}
          made={madeFolders}
          onMade={(path) => setMadeFolders((current) => [...current, path])}
          activePath={code.current}
          onOpen={openFile}
          onRefresh={refreshFiles}
          onMoved={movedFile}
          onTrashed={trashedFile}
          views={views}
        />
      )}

      {inspector && !offCanvas && (
        <Inspector
          views={views}
          node={selectedNode || null}
          nodes={nodes}
          links={links}
          roles={roles}
          folder={folder}
          workspace={meta}
          statuses={statuses}
          telemetry={telemetry}
          section={panelTab}
          onSection={setPanelTab}
          onSaveRole={onSaveRole}
          onChange={(changes) => selectedNode && updateNode(selectedNode.id, changes)}
          onNoteCommand={(id, command) =>
            setNoteCommands((current) => ({
              ...current,
              [id]: { ...command, seq: (current[id]?.seq ?? 0) + 1 }
            }))
          }
          onRestart={() =>
            setRestarts((current) => ({
              ...current,
              [selectedNode?.id]: (current[selectedNode?.id] ?? 0) + 1
            }))
          }
          canConnect={selectedNode && nodes.some((n) => canLink(selectedNode.id, n.id))}
          onConnectStart={(e) => selectedNode && startLink(selectedNode.id, e)}
          onPeerHover={setHoveredPeer}
          onDisconnect={removeLink}
          onLocate={locate}
          onReview={reviewNode}
        />
      )}

      {!offCanvas && tool === 'link' && !draft && (
        <div className="floating link-hint" role="status">
          <LinkIcon size={14} />
          Drag from a node to another, or click one and then the other
          <kbd>Esc</kbd>
        </div>
      )}

      {!offCanvas && draft && (
        <div className="floating link-hint" role="status">
          <LinkIcon size={14} />
          {!hasTargets
            ? `Nothing left that ${nodeLabel(linkSource)} can connect to`
            : draft.mode === 'pick'
              ? `Click a node to connect ${nodeLabel(linkSource)}`
              : `Drop on a node to connect ${nodeLabel(linkSource)}`}
          {draft.mode === 'pick' && <kbd>Esc</kbd>}
        </div>
      )}

      {/* The dock in the middle of the room the canvas has, the zoom on its right; where the room
          is too narrow for both on one line, the zoom goes up above the dock (main.css). */}
      <div className="canvas-controls" hidden={offCanvas || Boolean(frame)}>
        <div className="canvas-controls-grid">
          <div className="floating dock" role="toolbar" aria-label="Tools">
            <button
              className={tool ? 'dock-button tool' : 'dock-button tool active'}
              {...tip('Select', 'V')}
              aria-pressed={!tool}
              onClick={() => setTool(null)}
            >
              <PointerIcon />
            </button>
            <button
              className={tool === 'hand' ? 'dock-button tool active' : 'dock-button tool'}
              {...tip('Hand', 'H')}
              aria-pressed={tool === 'hand'}
              onClick={() => setTool((current) => (current === 'hand' ? null : 'hand'))}
            >
              <HandIcon />
            </button>
            <span className="dock-divider" />
            <button
              className="dock-button tool"
              {...tip('Terminal or agent', 'T')}
              aria-haspopup="dialog"
              aria-expanded={Boolean(launcher)}
              onClick={openLauncher}
            >
              <TerminalIcon />
            </button>
            <button className="dock-button tool" {...tip('Note', 'N')} onClick={newNote}>
              <NoteIcon />
            </button>
            <button className="dock-button tool" {...tip('Browser', 'B')} onClick={newBrowser}>
              <GlobeIcon />
            </button>
            <ToolButton tool={tool} name="link" label="Connect" keys="C" onTool={setTool}>
              <LinkIcon />
            </ToolButton>
            <span className="dock-divider" />
            <ToolButton tool={tool} name="draw" label="Draw" keys="D" onTool={setTool}>
              <PenIcon />
            </ToolButton>
            <div className="dock-menu-anchor">
              <ToolButton
                tool={tool}
                name={shapeKind}
                label={`${SHAPES[shapeKind].label} · ${SHAPES[shapeKind].key}`}
                onTool={setTool}
                menu={shapeMenu}
                onMenu={() => setShapeMenu((open) => !open)}
              >
                {SHAPES[shapeKind].icon}
              </ToolButton>
              {shapeMenu && (
                <div className="floating dock-menu" role="menu">
                  {Object.entries(SHAPES).map(([kind, { label, key, icon }]) => (
                    <button
                      key={kind}
                      role="menuitemradio"
                      aria-checked={shapeKind === kind}
                      aria-keyshortcuts={key}
                      className="dock-menu-item"
                      onClick={() => pickShape(kind)}
                    >
                      {icon}
                      <span>{label}</span>
                      {key && <kbd aria-hidden="true">{key}</kbd>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ToolButton tool={tool} name="text" label="Text" keys="W" onTool={setTool}>
              <TextIcon />
            </ToolButton>
            <ToolButton tool={tool} name="erase" label="Erase" keys="E" onTool={setTool}>
              <EraserIcon />
            </ToolButton>
          </div>
          <div className="zoom-area">
            {minimap && (
              <Minimap
                nodes={nodes}
                links={links}
                cam={cam}
                size={size}
                onLook={(point) =>
                  setCam((c) => ({
                    ...c,
                    x: size.w / 2 - point.x * c.z,
                    y: size.h / 2 - point.y * c.z
                  }))
                }
              />
            )}
            <div className="floating zoom" role="toolbar" aria-label="Zoom">
              <button
                className="icon-button zoom-step"
                {...tip('Zoom out', '−')}
                onClick={() => zoomTo(cam.z / ZOOM_STEP)}
              >
                <MinusIcon />
              </button>
              <button
                className="zoom-level"
                {...tip('Reset to 100%', '0')}
                aria-label={`Zoom ${Math.round(cam.z * 100)}%, reset to 100%`}
                onClick={() => zoomTo(1)}
              >
                {Math.round(cam.z * 100)}%
              </button>
              <button
                className="icon-button zoom-step"
                {...tip('Zoom in', '+')}
                onClick={() => zoomTo(cam.z * ZOOM_STEP)}
              >
                <PlusIcon />
              </button>
              <span className="dock-divider zoom-step" />
              <button
                className="icon-button"
                {...tip('Fit everything on screen', '1')}
                onClick={zoomToFit}
              >
                <FitIcon />
              </button>
              <button
                className={minimap ? 'icon-button active' : 'icon-button'}
                {...tip('Minimap', 'M')}
                aria-pressed={minimap}
                onClick={() => setMinimap((open) => !open)}
              >
                <MapIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* The shapes menu and the style bar share the room above the dock: one at a time. */}
      {!offCanvas && !frame && board.showStyle && !draft && !shapeMenu && (
        <StyleBar
          style={board.style}
          keys={board.keys}
          onChange={board.changeStyle}
          actions={board.actions}
        />
      )}

      {launcher && (
        <Launcher
          number={launcher.number}
          folder={folder}
          roles={roles}
          commands={commands}
          onSaveRole={onSaveRole}
          onRemoveRole={onRemoveRole}
          onCreate={launch}
          onClose={() => setLauncher(null)}
        />
      )}

      {!offCanvas && nodes.length === 0 && board.shapes.length === 0 && (
        <div className="canvas-empty">
          <div className="empty-state">
            <h2 className="empty-title">A blank canvas</h2>
            <p className="empty-text">
              Open terminals and agents here, then link them with Connect in the dock: linked agents
              can message each other and share notes.
            </p>
            <div className="empty-actions">
              <button className="button primary" onClick={openLauncher}>
                <TerminalIcon />
                Terminal
              </button>
              <button className="button" onClick={newNote}>
                <NoteIcon />
                Note
              </button>
              <button className="button" onClick={newBrowser}>
                <GlobeIcon />
                Browser
              </button>
            </div>
            <div className="empty-hints">
              <span>
                <kbd>Scroll</kbd> or <kbd>Space</kbd> + <kbd>Drag</kbd> to pan
              </span>
              <span>
                <kbd>Drag</kbd> to select
              </span>
              <span>
                <kbd>Ctrl</kbd> + <kbd>Scroll</kbd> to zoom
              </span>
              <span>
                <kbd>T</kbd> <kbd>N</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd> <kbd>R</kbd> tools
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// The box moved inside the room and, if it's bigger, cut down to it.
function fitIn(box, room) {
  const w = Math.min(box.w, room.w)
  const h = Math.min(box.h, room.h)
  return {
    x: Math.min(Math.max(box.x, room.x), room.x + room.w - w),
    y: Math.min(Math.max(box.y, room.y), room.y + room.h - h),
    w,
    h
  }
}

// Stops the click that follows a pointerdown from reaching anything. If no click comes (the
// pointer was let go somewhere else), the listener goes away right after the pointerup, so it
// can't eat a later click.
function swallowNextClick() {
  const swallow = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.addEventListener(
    'pointerup',
    () => setTimeout(() => window.removeEventListener('click', swallow, true)),
    { capture: true, once: true }
  )
}

// The shapes the dock's shapes button can draw, with their keys.
const SHAPES = {
  rect: { label: 'Rectangle', key: 'R', icon: <SquareIcon /> },
  ellipse: { label: 'Ellipse', key: 'O', icon: <CircleIcon /> },
  triangle: { label: 'Triangle', icon: <TriangleIcon /> },
  diamond: { label: 'Diamond', icon: <DiamondIcon /> },
  line: { label: 'Line', key: 'L', icon: <LineIcon /> },
  arrow: { label: 'Arrow', key: 'A', icon: <ArrowIcon /> }
}

// A tool in the dock: pressed while it's on; clicking it again turns it off. With `onMenu`, a
// small arrow beside it opens its menu.
function ToolButton({ tool, name, label, keys, onTool, menu, onMenu, children }) {
  const on = tool === name
  return (
    <span className={onMenu ? 'dock-split' : undefined}>
      <button
        className={on ? 'dock-button tool active' : 'dock-button tool'}
        {...tip(label, keys)}
        aria-pressed={on}
        onClick={() => onTool((current) => (current === name ? null : name))}
      >
        {children}
      </button>
      {onMenu && (
        <button
          className="dock-caret"
          aria-label="More shapes"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={onMenu}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
            <path d="M1.5 5.5L4 3l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      )}
    </span>
  )
}

function highest(items, key) {
  return items.reduce((max, item) => Math.max(max, item[key]), 0)
}
