// A project's initial on a small square, in one of a few tones. The tone comes from the id, so
// it stays the same when the project is renamed.
const TONES = 5

export default function ProjectBadge({ project }) {
  const tone = [...project.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES
  return (
    <span className="badge" data-tone={tone} aria-hidden="true">
      {project.name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
