import { useEffect, useState } from 'react'
import Workspace from './components/Workspace'
import Sidebar from './components/Sidebar'

export default function App() {
  // Every project as { id, name, folder }, and every saved workspace as { id, name, project,
  // folder }; `open` holds the ids of the open workspaces, in the order they were opened.
  const [projects, setProjects] = useState([])
  const [all, setAll] = useState([])
  const [open, setOpen] = useState([])
  const [active, setActive] = useState(null)
  const [started, setStarted] = useState(false)
  // Saved state of each open workspace mounted so far. A workspace mounts the first time it's
  // shown and stays mounted while open, hidden when inactive, so its terminals keep running in
  // the background.
  const [loaded, setLoaded] = useState({})

  useEffect(() => {
    async function start() {
      const session = await window.api.workspace.session()
      setProjects(await window.api.project.list())
      setAll(await window.api.workspace.list())
      setOpen(session.open)
      setActive(session.active)
      setStarted(true)
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
    if (started) window.api.workspace.saveSession({ open, active })
  }, [started, open, active])

  function openWorkspace(id) {
    setOpen((current) => (current.includes(id) ? current : [...current, id]))
    setActive(id)
  }

  // Both ask for a folder first, and return nothing if that's canceled.
  async function createWorkspace(projectId) {
    const workspace = await window.api.workspace.create(projectId)
    if (!workspace) return
    setAll((current) => [...current, workspace])
    openWorkspace(workspace.id)
  }

  async function createProject() {
    const created = await window.api.project.create()
    if (!created) return
    setProjects((current) => [...current, created.project])
    setAll((current) => [...current, created.workspace])
    openWorkspace(created.workspace.id)
  }

  async function closeWorkspace(id) {
    // Main saves it before the workspace unmounts and takes its terminals down.
    await window.api.workspace.close(id)
    const index = open.indexOf(id)
    const rest = open.filter((other) => other !== id)
    setOpen(rest)
    setLoaded((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (id === active) setActive(rest[Math.max(0, index - 1)] ?? null)
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

  // A workspace from before folders existed picks one the first time an agent opens in it.
  async function pickFolder(id) {
    const folder = await window.api.workspace.pickFolder(id)
    if (folder) setAll((current) => current.map((w) => (w.id === id ? { ...w, folder } : w)))
    return folder
  }

  function renameProject(id, name) {
    setProjects((current) => current.map((p) => (p.id === id ? { ...p, name } : p)))
    window.api.project.rename(id, name)
  }

  async function removeProject(id) {
    if (await window.api.project.remove(id)) {
      setProjects((current) => current.filter((p) => p.id !== id))
      setAll((current) => current.filter((w) => w.project !== id))
    }
  }

  if (!started) return null

  const folders = new Map(all.map((w) => [w.id, w.folder]))
  return (
    <div className="app">
      <Sidebar
        projects={projects}
        workspaces={all.map((w) => ({ ...w, open: open.includes(w.id) }))}
        active={active}
        onSelect={openWorkspace}
        onCreateProject={createProject}
        onCreateWorkspace={createWorkspace}
        onCloseWorkspace={closeWorkspace}
        onRenameWorkspace={renameWorkspace}
        onRemoveWorkspace={removeWorkspace}
        onRenameProject={renameProject}
        onRemoveProject={removeProject}
      />
      <main className="workspaces">
        {open
          .filter((id) => loaded[id])
          .map((id) => (
            <Workspace
              key={id}
              workspaceId={id}
              saved={loaded[id]}
              active={id === active}
              folder={folders.get(id)}
              onPickFolder={() => pickFolder(id)}
            />
          ))}
        {!active && (
          <div className="empty">
            {all.length > 0
              ? 'Open a workspace from the sidebar, or create a new one'
              : 'Create a project or a workspace to start'}
          </div>
        )}
      </main>
    </div>
  )
}
