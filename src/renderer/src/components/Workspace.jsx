import { useEffect, useRef, useState } from 'react'
import Canvas from './Canvas'
import Links from './Links'
import CanvasNode from './CanvasNode'
import Terminal from './Terminal'
import Note from './Note'
import Drawings from './Drawings'
import AgentButton from './AgentButton'
import { touches } from '../drawing'
import { AGENTS } from '../../../shared/agents'
import { ROLES } from '../../../shared/roles'

// Size of a new node of each type.
const SIZES = {
  terminal: { w: 640, h: 400 },
  note: { w: 280, h: 200 }
}

// Drawing sizes, in screen pixels at the zoom in use: a stroke drawn zoomed out is as thick on
// screen as one drawn up close, and both scale with the canvas afterwards.
const STROKE_WIDTH = 3
// A new point is only recorded this far from the last one, which keeps the saved file small.
const MIN_STEP = 2
const ERASER_RADIUS = 8

// One canvas with its camera, nodes, links and drawings. `saved` is what was loaded from disk: from then on
// this component owns the state, and main keeps a copy that it saves.
// An inactive workspace is hidden, not unmounted, so its terminals keep running.
export default function Workspace({ workspaceId, saved, active }) {
  const container = useRef(null)
  const [cam, setCam] = useState(saved.camera)
  const [nodes, setNodes] = useState(saved.nodes)
  // Links have no direction for now: from/to only say which node the drag started on.
  const [links, setLinks] = useState(saved.links)
  // Link being dragged: source node, tip in world coordinates and the valid node under the
  // cursor (or null).
  const [draft, setDraft] = useState(null)
  const [strokes, setStrokes] = useState(saved.strokes)
  // 'draw', 'erase' or null (the pointer works on the nodes as usual).
  const [tool, setTool] = useState(null)
  // Stroke being drawn. The ref is what the handlers build on: pointerup can arrive before React
  // renders the last move, and the state would still have the old points.
  const [sketch, setSketch] = useState(null)
  const sketchRef = useRef(null)
  const lastErase = useRef(null)
  // Counters pick up after the saved ids and layers.
  const nextId = useRef(highest(saved.nodes, 'id') + 1)
  const nextLinkId = useRef(highest(saved.links, 'id') + 1)
  const nextStrokeId = useRef(highest(saved.strokes, 'id') + 1)
  const topLayer = useRef(highest(saved.nodes, 'layer'))
  // The link drag reads the camera from its listeners; the ref avoids using a stale camera
  // if the user zooms mid-drag.
  const camRef = useRef(cam)
  useEffect(() => {
    camRef.current = cam
  }, [cam])

  // Main saves the workspace to disk and delivers agent messages along its links.
  useEffect(() => {
    window.api.workspace.update(workspaceId, { camera: cam, nodes, links, strokes })
  }, [workspaceId, cam, nodes, links, strokes])

  // An agent wrote to a note with `anbu note`. Main has already changed its own copy; this
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

  // Creates a node centered on the point (in world coordinates), in front of the others, with any
  // extra `fields` its type needs. Terminals and notes share the id sequence: the id is what
  // `anbu send` takes, and it has to be unique across the whole workspace.
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
      title: `${type} ${id}`,
      ...fields
    }
    setNodes((current) => [...current, node])
  }

  // Center of the viewport converted to world coordinates: world = (screen - (x, y)) / z.
  function createNodeAtCenter(type, fields) {
    const { width, height } = container.current.getBoundingClientRect()
    createNode(type, { x: (width / 2 - cam.x) / cam.z, y: (height / 2 - cam.y) / cam.z }, fields)
  }

  // An agent node is a terminal that opens straight into the agent. It keeps the "terminal N"
  // title, since that's how other agents and `anbu send` refer to it. The session id lets the
  // node resume its conversation after a restart; agents that can't resume ignore it. The role,
  // if any, is fixed for the node's lifetime: it's part of the prompt the conversation began with.
  async function createAgent(agent, role) {
    const cwd = await window.api.pty.pickFolder(agent)
    if (!cwd) return
    createNodeAtCenter('terminal', {
      agent,
      cwd,
      session: crypto.randomUUID(),
      ...(role && { role })
    })
  }

  // Removing the node from state unmounts its <Terminal>, whose cleanup kills the PTY.
  function closeNode(id) {
    setNodes((current) => current.filter((node) => node.id !== id))
    setLinks((current) => current.filter((l) => l.from !== id && l.to !== id))
  }

  // Dragging from a node's port to another node creates a link between the two. Two linked
  // terminals can message each other; a terminal linked to a note can read and write it. Two
  // notes can't be linked: there would be no agent on either end.
  function startLink(from, e) {
    if (e.button !== 0) return
    // Without this the pointerdown bubbles up to the bar and the node starts moving.
    e.stopPropagation()
    const port = e.currentTarget
    port.setPointerCapture(e.pointerId)
    const source = nodes.find((n) => n.id === from)

    // With the pointer captured, events always target the port; to find out what is under
    // the cursor we have to ask the document.
    function nodeUnder(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node')
      const id = Number(el?.dataset.id)
      const target = nodes.find((n) => n.id === id)
      if (!target || id === from) return null
      return target.type === 'terminal' || source.type === 'terminal' ? id : null
    }

    // clientX/Y count from the window, and the viewport starts below the tab bar.
    const viewport = container.current.getBoundingClientRect()
    function toWorld(ev) {
      const c = camRef.current
      return {
        x: (ev.clientX - viewport.left - c.x) / c.z,
        y: (ev.clientY - viewport.top - c.y) / c.z
      }
    }

    function onMove(ev) {
      setDraft({ from, ...toWorld(ev), target: nodeUnder(ev) })
    }

    function onRelease(ev) {
      port.removeEventListener('pointermove', onMove)
      port.removeEventListener('pointerup', onRelease)
      port.removeEventListener('pointercancel', onRelease)
      setDraft(null)

      const to = ev.type === 'pointerup' ? nodeUnder(ev) : null
      if (!to) return
      setLinks((current) => {
        const exists = current.some(
          (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from)
        )
        return exists ? current : [...current, { id: nextLinkId.current++, from, to }]
      })
    }

    port.addEventListener('pointermove', onMove)
    port.addEventListener('pointerup', onRelease)
    port.addEventListener('pointercancel', onRelease)
  }

  function removeLink(id) {
    setLinks((current) => current.filter((l) => l.id !== id))
  }

  function toolStart(point) {
    if (tool === 'draw') {
      updateSketch({ width: round(STROKE_WIDTH / cam.z, 100), points: [roundPoint(point)] })
    } else {
      lastErase.current = point
      erase(point, point)
    }
  }

  function toolMove(point) {
    if (tool === 'draw') {
      const current = sketchRef.current
      const [lx, ly] = current.points[current.points.length - 1]
      if (Math.hypot(point.x - lx, point.y - ly) < MIN_STEP / cam.z) return
      updateSketch({ ...current, points: [...current.points, roundPoint(point)] })
    } else {
      erase(lastErase.current, point)
      lastErase.current = point
    }
  }

  function toolEnd() {
    const current = sketchRef.current
    updateSketch(null)
    if (!current) return
    const stroke = { id: nextStrokeId.current++, ...current }
    setStrokes((all) => [...all, stroke])
  }

  function updateSketch(next) {
    sketchRef.current = next
    setSketch(next)
  }

  // The eraser removes whole strokes: any stroke it touches on its way from `from` to `to`.
  function erase(from, to) {
    const radius = ERASER_RADIUS / cam.z
    setStrokes((all) => {
      const kept = all.filter((stroke) => !touches(stroke, from, to, radius))
      return kept.length === all.length ? all : kept
    })
  }

  return (
    <div className="workspace" ref={container} hidden={!active}>
      <Canvas
        cam={cam}
        setCam={setCam}
        tool={tool}
        onToolStart={toolStart}
        onToolMove={toolMove}
        onToolEnd={toolEnd}
        overlay={<Drawings strokes={strokes} sketch={sketch} />}
      >
        <Links nodes={nodes} links={links} draft={draft} onRemove={removeLink} />
        {nodes.map((node) => (
          <CanvasNode
            key={node.id}
            {...node}
            badge={badge(node)}
            isLinkTarget={draft?.target === node.id}
            onChange={(changes) => updateNode(node.id, changes)}
            onRaise={() => raise(node.id)}
            onClose={() => closeNode(node.id)}
            onLinkStart={(e) => startLink(node.id, e)}
          >
            {node.type === 'note' ? (
              <Note text={node.text} onChange={(text) => updateNode(node.id, { text })} />
            ) : (
              <Terminal
                workspaceId={workspaceId}
                nodeId={node.id}
                agent={node.agent}
                session={node.session}
                role={node.role}
                cwd={node.cwd}
                onExit={() => closeNode(node.id)}
              />
            )}
          </CanvasNode>
        ))}
      </Canvas>

      <div className="toolbar">
        <button onClick={() => createNodeAtCenter('terminal')}>+ Terminal</button>
        {Object.keys(AGENTS).map((agent) => (
          <AgentButton key={agent} agent={agent} onCreate={(role) => createAgent(agent, role)} />
        ))}
        <button onClick={() => createNodeAtCenter('note', { text: '' })}>+ Note</button>
        <span className="toolbar-divider" />
        {['draw', 'erase'].map((name) => (
          <button
            key={name}
            className={tool === name ? 'active' : undefined}
            // Clicking the active tool turns it off.
            onClick={() => setTool((current) => (current === name ? null : name))}
          >
            {name === 'draw' ? 'Draw' : 'Erase'}
          </button>
        ))}
      </div>

      {nodes.length === 0 && strokes.length === 0 && (
        <div className="empty">Open a terminal, an agent or a note from the toolbar</div>
      )}
    </div>
  )
}

// Which agent a terminal opened with, and in which role.
function badge({ agent, role }) {
  if (!AGENTS[agent]) return undefined
  return ROLES[role] ? `${AGENTS[agent].label} · ${ROLES[role].label}` : AGENTS[agent].label
}

function highest(items, key) {
  return items.reduce((max, item) => Math.max(max, item[key]), 0)
}

// Points are saved to a tenth of a world unit: enough detail up close, and a shorter file.
function roundPoint({ x, y }) {
  return [round(x, 10), round(y, 10)]
}

function round(value, factor) {
  return Math.round(value * factor) / factor
}
