import { useEffect, useState } from 'react'
import Workspace from './components/Workspace'
import WorkspaceTabs from './components/WorkspaceTabs'

export default function App() {
  // Every saved workspace as { id, name }; `open` holds the ids shown as tabs, in order.
  const [all, setAll] = useState([])
  const [open, setOpen] = useState([])
  const [active, setActive] = useState(null)
  // Saved state of each tab mounted so far. A tab mounts the first time it's shown and stays
  // mounted while open, hidden when inactive, so its terminals keep running in the background.
  const [loaded, setLoaded] = useState({})

  useEffect(() => {
    // One after the other: the session may create the first workspace, which the list must see.
    async function start() {
      const session = await window.api.workspace.session()
      setAll(await window.api.workspace.list())
      setOpen(session.open)
      setActive(session.active)
    }
    start()
  }, [])

  useEffect(() => {
    if (!active || loaded[active]) return
    window.api.workspace.load(active).then((saved) => {
      setLoaded((current) => ({ ...current, [active]: saved }))
    })
  }, [active, loaded])

  useEffect(() => {
    if (active) window.api.workspace.saveSession({ open, active })
  }, [open, active])

  function openWorkspace(id) {
    setOpen((current) => (current.includes(id) ? current : [...current, id]))
    setActive(id)
  }

  async function createWorkspace() {
    const workspace = await window.api.workspace.create()
    setAll((current) => [...current, workspace])
    openWorkspace(workspace.id)
  }

  async function closeWorkspace(id) {
    // Main saves it before the tab unmounts and takes its terminals down.
    await window.api.workspace.close(id)
    const index = open.indexOf(id)
    const rest = open.filter((other) => other !== id)
    setOpen(rest)
    setLoaded((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (id === active) setActive(rest[Math.max(0, index - 1)])
  }

  function renameWorkspace(id, name) {
    setAll((current) => current.map((w) => (w.id === id ? { ...w, name } : w)))
    window.api.workspace.rename(id, name)
  }

  async function removeWorkspace(id) {
    if (await window.api.workspace.remove(id)) {
      setAll((current) => current.filter((w) => w.id !== id))
    }
  }

  if (!active) return null

  const names = new Map(all.map((w) => [w.id, w.name]))
  return (
    <div className="app">
      <WorkspaceTabs
        tabs={open.map((id) => ({ id, name: names.get(id) }))}
        closed={all.filter((w) => !open.includes(w.id))}
        active={active}
        onSelect={setActive}
        onCreate={createWorkspace}
        onClose={closeWorkspace}
        onRename={renameWorkspace}
        onOpen={openWorkspace}
        onRemove={removeWorkspace}
      />
      <main className="workspaces">
        {open
          .filter((id) => loaded[id])
          .map((id) => (
            <Workspace key={id} workspaceId={id} saved={loaded[id]} active={id === active} />
          ))}
      </main>
    </div>
  )
}
