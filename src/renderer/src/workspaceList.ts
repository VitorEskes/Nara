import type { AgentState, Project, WorkspaceSummary } from '../../shared/types'

// A workspace in the lists, and whether it's open.
export type ListedWorkspace = WorkspaceSummary & { open?: boolean }

// How an open workspace's agents are doing: the most urgent state, and how many there are.
export interface AgentSummary {
  state: AgentState
  count: number
}

// Helpers shared by the sidebar and the overview, which list the same projects and workspaces.

// Each project with its workspaces, then the loose workspaces, all sorted by name. A workspace
// whose project is gone counts as a loose one.
export function groupByProject<W extends WorkspaceSummary>(
  projects: Project[],
  workspaces: W[]
): {
  groups: { project: Project; members: W[] }[]
  loose: W[]
} {
  const ids = new Set(projects.map((p) => p.id))
  return {
    groups: byName(projects).map((project) => ({
      project,
      members: byName(workspaces.filter((w) => w.project === project.id))
    })),
    loose: byName(workspaces.filter((w) => !w.project || !ids.has(w.project)))
  }
}

export function byName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

const UNITS: [string, number][] = [
  ['y', 365 * 24 * 3600],
  ['mo', 30 * 24 * 3600],
  ['w', 7 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60]
]

// How long ago a time in ms was, in the largest unit that fits: "3d", "1w", "now".
export function ago(time: number | null | undefined, now = Date.now()): string {
  if (!time) return ''
  const seconds = (now - time) / 1000
  const found = UNITS.find(([, size]) => seconds >= size)
  return found ? `${Math.floor(seconds / found[1])}${found[0]}` : 'now'
}
