import { useEffect, useState } from 'react'
import Workspace from './components/Workspace'
import Sidebar from './components/Sidebar'
import Overview from './components/Overview'
import ProjectBadge from './components/ProjectBadge'
import Pet from './components/Pet'
import { BUILT_IN_PET } from './pets'
import { byName } from './workspaceList'
import { SidebarIcon } from './components/icons'
import { SHORTCUTS, shortcutFor } from './shortcuts'
import { ROLES } from '../../shared/roles'

// Below this window width the sidebar hides itself, leaving the room to the canvas.
const NARROW = 760

// The preferences only the renderer needs: the pet (its id, or null for none) and its size.
const PREFS = 'prefs'
const PREF_DEFAULTS = { pet: BUILT_IN_PET, petSize: 'm' }

export default function App() {
  // Every project as { id, name, folder }, and every saved workspace as { id, name, project,
  // folder, terminals, notes }; `open` holds the ids of the open workspaces, in the order they
  // were opened.
  const [projects, setProjects] = useState([])
  const [all, setAll] = useState([])
  const [open, setOpen] = useState([])
  const [active, setActive] = useState(null)
  const [started, setStarted] = useState(false)
  // The page with every workspace, in place of the canvas. The active workspace stays mounted
  // under it, hidden like any other, and comes back when it closes.
  const [overview, setOverview] = useState(false)
  // Saved state of each open workspace mounted so far. A workspace mounts the first time it's
  // shown and stays mounted while open, hidden when inactive, so its terminals keep running in
  // the background.
  const [loaded, setLoaded] = useState({})
  // The roles the user made, offered on every canvas after the built-in ones.
  const [customRoles, setCustomRoles] = useState([])
  const [prefs] = useState(recallPrefs)
  // What every agent is doing, for the pet (main's status.js).
  const [statuses, setStatuses] = useState([])
  // The node the pet sent the user to: the workspace it's in glides there once it's on screen.
  const [jump, setJump] = useState(null)

  useEffect(() => {
    window.api.agents.status().then(setStatuses)
    return window.api.agents.onStatus(setStatuses)
  }, [])
  // Remembered across runs; the first run starts with it shown unless the window is narrow.
  const [sidebar, setSidebar] = useState(
    () => localStorage.getItem('sidebar') ?? (innerWidth < NARROW ? 'closed' : 'open')
  )

  useEffect(() => {
    localStorage.setItem('sidebar', sidebar)
  }, [sidebar])

  useEffect(() => {
    const narrow = matchMedia(`(max-width: ${NARROW}px)`)
    const onChange = (e) => e.matches && setSidebar('closed')
    narrow.addEventListener('change', onChange)
    return () => narrow.removeEventListener('change', onChange)
  }, [])

  // 'light', 'dark' or 'system'; main applies it (see main/theme.js) and the CSS follows.
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    window.api.theme.get().then(setTheme)
  }, [])

  // The switch crossfades the window: the browser snapshots the old colors, waits for the new
  // ones and fades between them. The new colors arrive once main has changed the theme, which
  // the media query reports; when they don't change (say, from dark to a system that's dark too)
  // there's no report, and the timeout ends the wait.
  function changeTheme(next) {
    setTheme(next)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !document.startViewTransition) return window.api.theme.set(next)
    document.startViewTransition(
      () =>
        new Promise((resolve) => {
          matchMedia('(prefers-color-scheme: dark)').addEventListener('change', resolve, {
            once: true
          })
          setTimeout(resolve, 250)
          window.api.theme.set(next)
        })
    )
  }

  function toggleTheme() {
    changeTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark')
  }

  function toggleSidebar() {
    setSidebar((current) => (current === 'open' ? 'closed' : 'open'))
  }

  useEffect(() => {
    async function start() {
      const session = await window.api.workspace.session()
      setProjects(await window.api.project.list())
      setAll(await window.api.workspace.list())
      setCustomRoles(await window.api.roles.list())
      setOpen(session.open)
      setActive(session.active)
      setOverview(!session.active)
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

  // Capture, so a focused terminal doesn't also get the keys. Registered again on every render,
  // which keeps the handlers reading the current state.
  useEffect(() => {
    const actions = {
      newWorkspace: () => createWorkspace(),
      overview: showOverview,
      newProject: createProject,
      sidebar: toggleSidebar,
      theme: toggleTheme
    }
    function onKeyDown(e) {
      const name = shortcutFor(e)
      if (!name) return
      e.preventDefault()
      e.stopPropagation()
      actions[name]()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  function openWorkspace(id) {
    setOpen((current) => (current.includes(id) ? current : [...current, id]))
    setActive(id)
    setOverview(false)
  }

  // Opens the project's workspace opened last, or its first one if none is open. A project with
  // no workspaces gets a new one.
  function openProject(id) {
    const members = all.filter((w) => w.project === id)
    const latest = open.findLast((other) => members.some((w) => w.id === other))
    const chosen = latest ?? byName(members)[0]?.id
    if (chosen) openWorkspace(chosen)
    else createWorkspace(id)
  }

  // The list is read again for the counts on the cards: the canvases have changed since.
  async function showOverview() {
    setOverview(true)
    setAll(await window.api.workspace.list())
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
    if (rest.length === 0) setOverview(true)
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

  // Returns the role as saved, with its key, or null if main turned it down.
  async function saveRole(role) {
    const saved = await window.api.roles.save(role)
    if (!saved) return null
    setCustomRoles((current) =>
      current.some((r) => r.key === saved.key)
        ? current.map((r) => (r.key === saved.key ? saved : r))
        : [...current, saved]
    )
    return saved
  }

  async function removeRole(key) {
    if (await window.api.roles.remove(key)) {
      setCustomRoles((current) => current.filter((r) => r.key !== key))
    }
  }

  // The pet's click: to the agent's workspace and onto the agent. Its news has been seen.
  function jumpTo({ workspaceId, nodeId, state }) {
    if (!all.some((w) => w.id === workspaceId)) return
    openWorkspace(workspaceId)
    setJump({ workspaceId, nodeId, at: Date.now() })
    if (state !== 'working') window.api.agents.seen(workspaceId, nodeId)
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
  const roles = { ...ROLES, ...Object.fromEntries(customRoles.map((role) => [role.key, role])) }
  const workspaces = all.map((w) => ({ ...w, open: open.includes(w.id) }))
  return (
    <div className="app" data-sidebar={sidebar}>
      <Sidebar
        hidden={sidebar === 'closed'}
        theme={theme}
        onTheme={changeTheme}
        onHide={toggleSidebar}
        projects={projects}
        workspaces={workspaces}
        active={overview ? null : active}
        overview={overview}
        onOverview={showOverview}
        onSelect={openWorkspace}
        onOpenProject={openProject}
        onCreateProject={createProject}
        onCreateWorkspace={createWorkspace}
        onCloseWorkspace={closeWorkspace}
        onRenameWorkspace={renameWorkspace}
        onRemoveWorkspace={removeWorkspace}
        onRenameProject={renameProject}
        onRemoveProject={removeProject}
      />
      <main className="workspaces">
        {sidebar === 'closed' && (
          <SidebarPeek
            workspace={overview ? null : all.find((w) => w.id === active)}
            projects={projects}
            onShow={toggleSidebar}
          />
        )}
        {open
          .filter((id) => loaded[id])
          .map((id) => (
            <Workspace
              key={id}
              workspaceId={id}
              saved={loaded[id]}
              active={id === active && !overview}
              folder={folders.get(id)}
              onPickFolder={() => pickFolder(id)}
              roles={roles}
              jump={jump?.workspaceId === id ? jump : null}
              onSaveRole={saveRole}
              onRemoveRole={removeRole}
            />
          ))}
        {(overview || !active) && (
          <Overview
            projects={projects}
            workspaces={workspaces}
            current={active}
            onOpen={openWorkspace}
            onOpenProject={openProject}
            onCreateWorkspace={createWorkspace}
            onCreateProject={createProject}
            onCloseWorkspace={closeWorkspace}
            onRemoveWorkspace={removeWorkspace}
            onRenameProject={renameProject}
            onRemoveProject={removeProject}
          />
        )}
      </main>
      {prefs.pet && (
        <Pet pet={prefs.pet} size={prefs.petSize} statuses={statuses} onJump={jumpTo} />
      )}
    </div>
  )
}

function recallPrefs() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS)) }
  } catch {
    return PREF_DEFAULTS
  }
}

// While the sidebar is hidden: the button that brings it back and, on a canvas, where you are:
// the workspace's name, after its project's if it has one.
function SidebarPeek({ workspace, projects, onShow }) {
  const project = workspace && projects.find((p) => p.id === workspace.project)
  return (
    <div className="sidebar-peek">
      <button
        className="icon-button"
        title={`Show sidebar (${SHORTCUTS.sidebar.keys})`}
        aria-label="Show sidebar"
        onClick={onShow}
      >
        <SidebarIcon />
      </button>
      {workspace && (
        <nav className="crumbs" aria-label="Current workspace">
          {project && (
            <>
              <ProjectBadge project={project} />
              <span className="crumb">{project.name}</span>
              <span className="crumb-separator" aria-hidden="true">
                /
              </span>
            </>
          )}
          <span className="crumb current" aria-current="page">
            {workspace.name}
          </span>
        </nav>
      )}
    </div>
  )
}
