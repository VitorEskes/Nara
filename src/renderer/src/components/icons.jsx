import logo from '../assets/logo.png'

// Every icon shares a 16-unit grid and a 1.5 stroke with round ends, and takes the color of the
// text around it. `size` is in pixels; the stroke scales with it.
function Icon({ size = 16, className, children }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function NewIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7.5 2.5h-4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4" />
      <path d="M12 2.2l1.8 1.8-5.6 5.6-2.4.6.6-2.4z" />
    </Icon>
  )
}

export function GridIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </Icon>
  )
}

export function FolderIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </Icon>
  )
}

export function FolderPlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8.5 12.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1v2.5" />
      <path d="M12 9.5v4M10 11.5h4" />
    </Icon>
  )
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  )
}

export function MinusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 8h9" />
    </Icon>
  )
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Icon>
  )
}

export function ChevronIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 6.5l3 3 3-3" />
    </Icon>
  )
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 4.5h11M6.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5" />
      <path d="M4 4.5l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1" />
    </Icon>
  )
}

export function HandIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5.5 8.5V3.75a1 1 0 0 1 2 0V7.5M7.5 7V2.75a1 1 0 0 1 2 0V7.5M9.5 7.25V3.75a1 1 0 0 1 2 0V9.5a4.5 4.5 0 0 1-4.5 4.5h-.4a4 4 0 0 1-3-1.4L2 10.8a1 1 0 0 1 1.5-1.3l2 1.7" />
    </Icon>
  )
}

export function MapIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2 4l4-1.5 4 1.5 4-1.5v9.5l-4 1.5-4-1.5-4 1.5z" />
      <path d="M6 2.5v9.5M10 4v9.5" />
    </Icon>
  )
}

export function PointerIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 2.5l9 4.2-3.9 1.2-1.3 3.9z" />
    </Icon>
  )
}

export function TerminalIcon(props) {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M4.5 6.5l2 1.5-2 1.5M8 10h3.5" />
    </Icon>
  )
}

// A four-pointed spark: an agent, without borrowing any company's logo.
export function SparkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 2c.4 3.2 1.4 4.6 5.5 6-4.1 1.4-5.1 2.8-5.5 6-.4-3.2-1.4-4.6-5.5-6C6.6 6.6 7.6 5.2 8 2z" />
    </Icon>
  )
}

export function HexIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" />
      <path d="M8 5.5v5M5.8 6.8l4.4 2.4M10.2 6.8L5.8 9.2" />
    </Icon>
  )
}

export function NoteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 2.5h9v7l-4 4h-5z" />
      <path d="M12.5 9.5h-4v4M5.5 5.5h5M5.5 8h3" />
    </Icon>
  )
}

export function PenIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10.5 2.8l2.7 2.7-7.4 7.4-3.4.7.7-3.4z" />
      <path d="M9 4.3l2.7 2.7" />
    </Icon>
  )
}

export function EraserIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6.3 13.5L2.6 9.8a1 1 0 0 1 0-1.4l5.8-5.8a1 1 0 0 1 1.4 0l3.6 3.6a1 1 0 0 1 0 1.4l-5.9 5.9z" />
      <path d="M5 6l5 5M6.3 13.5h7.2" />
    </Icon>
  )
}

export function FitIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 5.5v-2a1 1 0 0 1 1-1h2M10.5 2.5h2a1 1 0 0 1 1 1v2M13.5 10.5v2a1 1 0 0 1-1 1h-2M5.5 13.5h-2a1 1 0 0 1-1-1v-2" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
    </Icon>
  )
}

export function SidebarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6 2.75v10.5M3.5 5.5h1M3.5 7.5h1" />
    </Icon>
  )
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Icon>
  )
}

export function SunIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
    </Icon>
  )
}

export function MoonIcon(props) {
  return (
    <Icon {...props}>
      <path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8z" />
    </Icon>
  )
}

export function MonitorIcon(props) {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.5 13.75h5M8 11v2.75" />
    </Icon>
  )
}

export function LocateIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="4.25" />
      <path d="M8 1.75v2M8 12.25v2M1.75 8h2M12.25 8h2" />
    </Icon>
  )
}

// Two pins and the string between them: a link on the canvas.
export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 11.5Q5 4.5 11.5 4.5" />
      <circle cx="4.5" cy="11.5" r="2" fill="currentColor" />
      <circle cx="11.5" cy="4.5" r="2" fill="currentColor" />
    </Icon>
  )
}

export function UnlinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6.5 4.5l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1M9.5 11.5l-1 1a2.6 2.6 0 0 1-3.7-3.7l1-1" />
      <path d="M2.5 2.5l1.5 1.5M12 12l1.5 1.5" />
    </Icon>
  )
}

// What a node is: a note, a plain terminal, or the agent it opened with.
const AGENT_ICONS = { claude: SparkIcon, codex: HexIcon }

export function NodeIcon({ type, agent, size = 14 }) {
  const Glyph = type === 'note' ? NoteIcon : (AGENT_ICONS[agent] ?? TerminalIcon)
  return <Glyph size={size} />
}

// The mark: the Nara deer, a nod to the clan that tends the deer of the Nara forest. Decorative
// next to the name, so it has no alt text of its own.
export function BrandMark() {
  return <img className="brand-mark" src={logo} alt="" width="28" height="28" />
}
