// Helpers shared by the sidebar and the overview, which list the same projects and workspaces.

// Each project with its workspaces, then the loose workspaces, all sorted by name. A workspace
// whose project is gone counts as a loose one.
export function groupByProject(projects, workspaces) {
  const ids = new Set(projects.map((p) => p.id))
  return {
    groups: byName(projects).map((project) => ({
      project,
      members: byName(workspaces.filter((w) => w.project === project.id))
    })),
    loose: byName(workspaces.filter((w) => !ids.has(w.project)))
  }
}

export function byName(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

const UNITS = [
  ['y', 365 * 24 * 3600],
  ['mo', 30 * 24 * 3600],
  ['w', 7 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60]
]

// How long ago a time in ms was, in the largest unit that fits: "3d", "1w", "now".
export function ago(time, now = Date.now()) {
  if (!time) return ''
  const seconds = (now - time) / 1000
  const [unit, size] = UNITS.find(([, size]) => seconds >= size) ?? []
  return unit ? `${Math.floor(seconds / size)}${unit}` : 'now'
}
