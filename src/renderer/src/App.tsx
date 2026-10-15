import { useEffect, useRef, useState } from 'react'
import Workspace, { type Jump } from './components/Workspace'
import Sidebar from './components/Sidebar'
import Overview from './components/Overview'
import ProjectBadge from './components/ProjectBadge'
import Settings from './components/Settings'
import DialogHost from './components/DialogHost'
import { ask } from './dialogs'
import { BUILT_IN_PET } from './pets'
import { byName, type AgentSummary } from './workspaceList'
import { SidebarIcon } from './components/icons'
import { SHORTCUTS, shortcutFor, type ShortcutName } from './shortcuts'
import { ROLES } from '../../shared/roles'
import { URGENCY } from './agentStatus'
import { VOICE } from '../../shared/features'
import { tip } from './tip'
import type { Theme } from '../../preload'
import type {
  AgentReport,
  AgentStatus,
  Limits,
  NodeId,
  Project,
  RemovedReport,
  Role,
  SavedRole,
  Workspace as SavedWorkspace,
  WorkspaceSummary
} from '../../shared/types'

// Below this window width the sidebar hides itself, leaving the room to the canvas.
const NARROW = 760

// The preferences the settings change that only the renderer needs: the pet (its id, or null for
// none) and its size, whether the HUD's global shortcut is on, and the command each agent starts
// with instead of its own.
const PREFS = 'prefs'
export interface Prefs {
  pet: string | null
  petSize: string
  hud: boolean
  voice: boolean
  commands: Record<string, string>
}
const PREF_DEFAULTS: Prefs = {
  pet: BUILT_IN_PET,
  petSize: 'm',
  hud: true,
  voice: true,
  commands: {}
}

// Stands in for a workspace with no agents yet, so it keeps the same empty map between renders.
const NO_AGENTS = new Map()

export default function App() {
  // Every project as { id, name, folder }, and every saved workspace as { id, name, project,
  // folder, terminals, notes }; `open` holds the ids of the open workspaces, in the order they
  // were opened.
  const [projects, setProjects] = useState<Project[]>([])
  const [all, setAll] = useState<WorkspaceSummary[]>([])
  const [open, setOpen] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  // The page with every workspace, in place of the canvas. The active workspace stays mounted
  // under it, hidden like any other, and comes back when it closes.
  const [overview, setOverview] = useState(false)
  // Saved state of each open workspace mounted so far. A workspace mounts the first time it's
  // shown and stays mounted while open, hidden when inactive, so its terminals keep running in
  // the background.
  const [loaded, setLoaded] = useState<Record<string, SavedWorkspace | null>>({})
  // The roles the user made, offered on every canvas after the built-in ones.
  const [customRoles, setCustomRoles] = useState<SavedRole[]>([])
  const [prefs, setPrefs] = useState(recallPrefs)
  // The section the settings are open on, or false while they're closed.
  const [settings, setSettings] = useState<string | false>(false)
  // What every agent is doing, for the pet (main's status.js).
  const [statuses, setStatuses] = useState<AgentStatus[]>([])
  // What every agent has spent and is working on (main's telemetry.js): workspace id -> node id
  // -> its report.
  const [telemetry, setTelemetry] = useState(new Map<string, Map<NodeId, AgentReport>>())
  // How much of their plans the agents have used (main's usage.js).
  const [limits, setLimits] = useState<Limits>({})
  // The node the pet sent the user to: the workspace it's in glides there once it's on screen.
  const [jump, setJump] = useState<Jump | null>(null)
  // Whether the HUD's shortcut is bound: the desktop may refuse it.
  const [hudBound, setHudBound] = useState<boolean | null>(null)
  // The side panel on the right, open or not, the same on every workspace.
  const [inspector, setInspector] = useState(() => localStorage.getItem('inspector') !== 'closed')
  // Where in the sidebar the workspace on screen puts its views and agents (WorkspaceNav.jsx).
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    localStorage.setItem('inspector', inspector ? 'open' : 'closed')
  }, [inspector])
  // What main's jumps read, always the latest.
  const latest = useRef<{ jumpTo?: (status: AgentStatus) => void }>({})
  useEffect(() => {
    latest.current = { jumpTo }
  })

  useEffect(() => {
    localStorage.setItem(PREFS, JSON.stringify(prefs))
  }, [prefs])

  useEffect(() => {
    window.api.hud.enable(prefs.hud).then(setHudBound)
  }, [prefs.hud])

  // The pet lives on the desktop, outside this window, over every app (main/pet.js).
  useEffect(() => {
    window.api.pet.configure({ pet: prefs.pet, size: prefs.petSize })
  }, [prefs.pet, prefs.petSize])

  // Whether the voice bar's shortcut is bound.
  const [voiceBound, setVoiceBound] = useState<boolean | null>(null)
  useEffect(() => {
    if (VOICE) window.api.voice.enable(prefs.voice).then(setVoiceBound)
  }, [prefs.voice])

  useEffect(() => {
    window.api.agents.status().then(setStatuses)
    const offStatus = window.api.agents.onStatus(setStatuses)
    // Each update carries only the agents that changed; the maps are copied so React sees them.
    const mergeTelemetry = (reports: (AgentReport | RemovedReport)[]) =>
      setTelemetry((current) => {
        const next = new Map(current)
        for (const report of reports) {
          const nodes = new Map(next.get(report.workspaceId))
          if ('removed' in report) nodes.delete(report.nodeId)
          else nodes.set(report.nodeId, report)
          next.set(report.workspaceId, nodes)
        }
        return next
      })
    window.api.telemetry.list().then(mergeTelemetry)
    window.api.usage.get().then(setLimits)
    const offUsage = window.api.usage.onUpdate(setLimits)
    const offTelemetry = window.api.telemetry.onUpdate(mergeTelemetry)
    // The HUD sent the user to an agent.
    const offJump = window.api.agents.onJump((status) => latest.current.jumpTo?.(status))
    return () => {
      offStatus()
      offTelemetry()
      offUsage()
      offJump()
    }
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
    const onChange = (e: MediaQueryListEvent) => e.matches && setSidebar('closed')
    narrow.addEventListener('change', onChange)
    return () => narrow.removeEventListener('change', onChange)
  }, [])

  // 'light', 'dark' or 'system'; main applies it (see main/theme.js) and the CSS follows.
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    window.api.theme.get().then(setTheme)
  }, [])

  // The switch crossfades the window: the browser snapshots the old colors, waits for the new
  // ones and fades between them. The new colors arrive once main has changed the theme, which
  // the media query reports; when they don't change (say, from dark to a system that's dark too)
  // there's no report, and the timeout ends the wait.
  function changeTheme(next: Theme) {
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
    const actions: Record<ShortcutName, () => void> = {
      newWorkspace: () => createWorkspace(),
      overview: showOverview,
      newProject: createProject,
      sidebar: toggleSidebar,
      theme: toggleTheme,
      settings: () => setSettings('appearance')
    }
    function onKeyDown(e: KeyboardEvent) {
      const name = shortcutFor(e)
      if (!name) return
      e.preventDefault()
      e.stopPropagation()
      actions[name]()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  // A browser node's page doesn't let keys out; main hands the app's shortcuts back, and they're
  // pressed again here, where the app and the workspace on screen hear them.
  useEffect(
    () =>
      window.api.browser.onKey(({ code, key, shift }) =>
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code, key, ctrlKey: true, shiftKey: shift })
        )
      ),
    []
  )

  function openWorkspace(id: string) {
    setOpen((current) => (current.includes(id) ? current : [...current, id]))
    setActive(id)
    setOverview(false)
  }

  // Opens the project's workspace opened last, or its first one if none is open. A project with
  // no workspaces gets a new one.
  function openProject(id: string) {
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
  async function createWorkspace(projectId?: string) {
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

  async function closeWorkspace(id: string) {
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

  function renameWorkspace(id: string, name: string) {
    setAll((current) => current.map((w) => (w.id === id ? { ...w, name } : w)))
    window.api.workspace.rename(id, name)
  }

  async function removeWorkspace(id: string) {
    const name = all.find((w) => w.id === id)?.name
    const sure = await ask({
      title: `Delete workspace “${name}”?`,
      message:
        'Its terminals, notes, positions and links are gone for good. Its folder isn’t touched.',
      confirm: 'Delete',
      danger: true
    })
    if (sure && (await window.api.workspace.remove(id))) {
      setAll((current) => current.filter((w) => w.id !== id))
    }
  }

  // A workspace from before folders existed picks one the first time an agent opens in it.
  async function pickFolder(id: string) {
    const folder = await window.api.workspace.pickFolder(id)
    if (folder) setAll((current) => current.map((w) => (w.id === id ? { ...w, folder } : w)))
    return folder
  }

  // Returns the role as saved, with its key, or null if main turned it down.
  async function saveRole(role: Role) {
    const saved = await window.api.roles.save(role)
    if (!saved) return null
    setCustomRoles((current) =>
      current.some((r) => r.key === saved.key)
        ? current.map((r) => (r.key === saved.key ? saved : r))
        : [...current, saved]
    )
    return saved
  }

  async function removeRole(key: string) {
    if (await window.api.roles.remove(key)) {
      setCustomRoles((current) => current.filter((r) => r.key !== key))
    }
  }

  // The pet's click: to the agent's workspace and onto the agent. Its news has been seen.
  function jumpTo({ workspaceId, nodeId, state }: AgentStatus) {
    if (!all.some((w) => w.id === workspaceId)) return
    openWorkspace(workspaceId)
    setJump({ workspaceId, nodeId, at: Date.now() })
    if (state !== 'working') window.api.agents.seen(workspaceId, nodeId)
  }

  function renameProject(id: string, name: string) {
    setProjects((current) => current.map((p) => (p.id === id ? { ...p, name } : p)))
    window.api.project.rename(id, name)
  }

  async function removeProject(id: string) {
    const project = projects.find((p) => p.id === id)
    const count = all.filter((w) => w.project === id).length
    const sure = await ask({
      title: `Delete project “${project?.name}”?`,
      message: `Its ${count === 1 ? 'workspace is' : `${count} workspaces are`} deleted with it. The folder ${project?.folder} isn’t touched.`,
      confirm: 'Delete',
      danger: true
    })
    if (sure && (await window.api.project.remove(id))) {
      setProjects((current) => current.filter((p) => p.id !== id))
      setAll((current) => current.filter((w) => w.project !== id))
    }
  }

  if (!started) return null

  const folders = new Map(all.map((w) => [w.id, w.folder]))
  const metas = new Map(all.map((w) => [w.id, w]))
  // Each workspace's agents by node id.
  const byWorkspace = new Map<string, Map<NodeId, AgentStatus>>()
  for (const status of statuses) {
    if (!byWorkspace.has(status.workspaceId)) byWorkspace.set(status.workspaceId, new Map())
    byWorkspace.get(status.workspaceId)!.set(status.nodeId, status)
  }
  // How each open workspace's agents are doing, for its row in the sidebar: the most urgent state
  // among them, and how many there are.
  const summaries = new Map<string, AgentSummary>()
  for (const [id, agents] of byWorkspace) {
    const states = [...agents.values()].map((a) => a.state)
    const state = states.sort((a, b) => URGENCY[b] - URGENCY[a])[0]
    summaries.set(id, { state, count: states.length })
  }
  const roles = { ...ROLES, ...Object.fromEntries(customRoles.map((role) => [role.key, role])) }
  const workspaces = all.map((w) => ({ ...w, open: open.includes(w.id) }))
  return (
    <div className="app" data-sidebar={sidebar}>
      <Sidebar
        hidden={sidebar === 'closed'}
        onHide={toggleSidebar}
        projects={projects}
        workspaces={workspaces}
        active={overview ? null : active}
        summaries={summaries}
        onSlot={setNavSlot}
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
        onSettings={() => setSettings('appearance')}
      />
      <main className="workspaces">
        {sidebar === 'closed' && (overview || !active) && (
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
              saved={loaded[id]!}
              active={id === active && !overview}
              folder={folders.get(id)}
              meta={metas.get(id)}
              project={projects.find((p) => p.id === metas.get(id)?.project)}
              statuses={byWorkspace.get(id) ?? NO_AGENTS}
              telemetry={telemetry.get(id) ?? NO_AGENTS}
              limits={limits}
              inspector={inspector}
              navSlot={id === active && !overview && sidebar !== 'closed' ? navSlot : null}
              // With a boolean it opens or minimizes; without one it switches.
              onInspector={(force) =>
                setInspector((open) => (typeof force === 'boolean' ? force : !open))
              }
              sidebarHidden={sidebar === 'closed'}
              onShowSidebar={toggleSidebar}
              onPickFolder={() => pickFolder(id)}
              roles={roles}
              commands={prefs.commands}
              jump={jump?.workspaceId === id ? jump : null}
              onSaveRole={saveRole}
              onRemoveRole={removeRole}
              onShortcuts={() => setSettings('keyboard')}
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
      <DialogHost />
      {settings && (
        <Settings
          theme={theme}
          onTheme={changeTheme}
          prefs={prefs}
          hudBound={hudBound}
          voiceBound={voiceBound}
          onPrefs={(change) => setPrefs((current) => ({ ...current, ...change }))}
          roles={roles}
          onSaveRole={saveRole}
          onRemoveRole={removeRole}
          initial={settings}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  )
}

function recallPrefs(): Prefs {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }
  } catch {
    return PREF_DEFAULTS
  }
}

// While the sidebar is hidden: the button that brings it back and, on a canvas, where you are:
// the workspace's name, after its project's if it has one.
function SidebarPeek({
  workspace,
  projects,
  onShow
}: {
  workspace?: WorkspaceSummary | null
  projects: Project[]
  onShow: () => void
}) {
  const project = workspace && projects.find((p) => p.id === workspace.project)
  return (
    <div className="sidebar-peek">
      <button
        className="icon-button"
        {...tip('Show sidebar', SHORTCUTS.sidebar.keys, 'bottom')}
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
