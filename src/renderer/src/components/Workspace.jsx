import { useEffect, useRef, useState } from 'react'
import Canvas from './Canvas'
import Links from './Links'
import CanvasNode from './CanvasNode'
import Terminal from './Terminal'

const NODE_WIDTH = 640
const NODE_HEIGHT = 400

// One canvas with its camera, nodes and links. `saved` is what was loaded from disk: from then on
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

  // Main saves the workspace to disk and delivers agent messages along its links.
  useEffect(() => {
    window.api.workspace.update(workspaceId, { camera: cam, nodes, links })
  }, [workspaceId, cam, nodes, links])

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

  // Creates a terminal centered on the point (in world coordinates), in front of the others.
  function createNode(center) {
    const id = nextId.current++
    const node = {
      id,
      x: Math.round(center.x - NODE_WIDTH / 2),
      y: Math.round(center.y - NODE_HEIGHT / 2),
      w: NODE_WIDTH,
      h: NODE_HEIGHT,
      layer: ++topLayer.current,
      title: `terminal ${id}`
    }
    setNodes((current) => [...current, node])
  }

  // Center of the viewport converted to world coordinates: world = (screen - (x, y)) / z.
  function createNodeAtCenter() {
    const { width, height } = container.current.getBoundingClientRect()
    createNode({ x: (width / 2 - cam.x) / cam.z, y: (height / 2 - cam.y) / cam.z })
  }

  // Removing the node from state unmounts its <Terminal>, whose cleanup kills the PTY.
  function closeNode(id) {
    setNodes((current) => current.filter((node) => node.id !== id))
    setLinks((current) => current.filter((l) => l.from !== id && l.to !== id))
  }

  // Dragging from a node's port to another node creates a link between the two.
  function startLink(from, e) {
    if (e.button !== 0) return
    // Without this the pointerdown bubbles up to the bar and the node starts moving.
    e.stopPropagation()
    const port = e.currentTarget
    port.setPointerCapture(e.pointerId)

    // With the pointer captured, events always target the port; to find out what is under
    // the cursor we have to ask the document.
    function nodeUnder(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node')
      const id = Number(el?.dataset.id)
      return id && id !== from ? id : null
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

  return (
    <div className="workspace" ref={container} hidden={!active}>
      <Canvas cam={cam} setCam={setCam}>
        <Links nodes={nodes} links={links} draft={draft} onRemove={removeLink} />
        {nodes.map((node) => (
          <CanvasNode
            key={node.id}
            {...node}
            isLinkTarget={draft?.target === node.id}
            onChange={(changes) => updateNode(node.id, changes)}
            onRaise={() => raise(node.id)}
            onClose={() => closeNode(node.id)}
            onLinkStart={(e) => startLink(node.id, e)}
          >
            <Terminal
              workspaceId={workspaceId}
              nodeId={node.id}
              cwd={node.cwd}
              onExit={() => closeNode(node.id)}
            />
          </CanvasNode>
        ))}
      </Canvas>

      <div className="toolbar">
        <button onClick={createNodeAtCenter}>+ Terminal</button>
      </div>

      {nodes.length === 0 && <div className="empty">Click “+ Terminal” to open a terminal</div>}
    </div>
  )
}

function highest(items, key) {
  return items.reduce((max, item) => Math.max(max, item[key]), 0)
}
