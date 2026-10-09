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

// A click handler for a button inside a clickable row or card. Without stopPropagation the click
// also reaches the row and opens what the row stands for.
export function stop(fn) {
  return (e) => {
    e.stopPropagation()
    fn()
  }
}
