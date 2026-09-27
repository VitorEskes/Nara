import { useEffect, useRef, useState } from 'react'
import Canvas from './components/Canvas'
import Links from './components/Links'
import CanvasNode from './components/CanvasNode'
import Terminal from './components/Terminal'

const NODE_WIDTH = 640
const NODE_HEIGHT = 400

export default function App() {
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 })
  const [nodes, setNodes] = useState([
    { id: 1, x: 80, y: 80, w: NODE_WIDTH, h: NODE_HEIGHT, layer: 1, title: 'terminal 1' }
  ])
  // Links have no direction for now: from/to only say which node the drag started on.
  const [links, setLinks] = useState([])
  // Link being dragged: source node, tip in world coordinates and the valid node under the
  // cursor (or null).
  const [draft, setDraft] = useState(null)
  const nextId = useRef(2)
  const nextLinkId = useRef(1)
  const topLayer = useRef(1)
  // The link drag reads the camera from its listeners; the ref avoids using a stale camera
  // if the user zooms mid-drag.
  const camRef = useRef(cam)
  useEffect(() => {
    camRef.current = cam
  }, [cam])

  // Main delivers the messages between agents, so it needs to know who is linked to whom.
  useEffect(() => {
    window.api.links.set(links)
  }, [links])

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

  // Center of the window converted to world coordinates: world = (screen - (x, y)) / z.
  function createNodeAtCenter() {
    createNode({
      x: (window.innerWidth / 2 - cam.x) / cam.z,
      y: (window.innerHeight / 2 - cam.y) / cam.z
    })
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

    // The viewport fills the whole window, so clientX/Y are already screen coordinates.
    function toWorld(ev) {
      const c = camRef.current
      return { x: (ev.clientX - c.x) / c.z, y: (ev.clientY - c.y) / c.z }
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
    <>
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
            <Terminal nodeId={node.id} onExit={() => closeNode(node.id)} />
          </CanvasNode>
        ))}
      </Canvas>

      <div className="toolbar">
        <button onClick={createNodeAtCenter}>+ Terminal</button>
      </div>

      {nodes.length === 0 && <div className="empty">Click “+ Terminal” to open a terminal</div>}
    </>
  )
}
