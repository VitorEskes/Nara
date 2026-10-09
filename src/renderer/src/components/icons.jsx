export function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}

// The icons below share a 16-unit grid, a 1.3 stroke and the size of the sidebar's text.
function Icon({ children }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function NewIcon() {
  return (
    <Icon>
      <path d="M7.5 2.5h-4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4" />
      <path d="M12 2.2l1.8 1.8-5.6 5.6-2.4.6.6-2.4z" />
    </Icon>
  )
}

export function FolderIcon() {
  return (
    <Icon>
      <path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </Icon>
  )
}

export function FolderPlusIcon() {
  return (
    <Icon>
      <path d="M8.5 12.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1v2.5" />
      <path d="M12 9.5v4M10 11.5h4" />
    </Icon>
  )
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  )
}
