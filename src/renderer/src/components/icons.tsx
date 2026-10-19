import type { JSX, ReactNode } from 'react'
import logo from '../assets/logo.png'

export interface IconProps {
  size?: number
  className?: string
}

// Any of the icons below, for the places that take one as a prop.
export type IconComponent = (props: IconProps) => JSX.Element

// Every icon shares a 16-unit grid and a 1.5 stroke with round ends, and takes the color of the
// text around it. `size` is in pixels; the stroke scales with it.
function Icon({
  size = 16,
  className,
  children
}: IconProps & { children: ReactNode }): JSX.Element {
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

export function NewIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M7.5 2.5h-4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4" />
      <path d="M12 2.2l1.8 1.8-5.6 5.6-2.4.6.6-2.4z" />
    </Icon>
  )
}

export function GridIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </Icon>
  )
}

export function FolderIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </Icon>
  )
}

export function FolderPlusIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8.5 12.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1v2.5" />
      <path d="M12 9.5v4M10 11.5h4" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  )
}

export function MinusIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.5 8h9" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Icon>
  )
}

export function ChevronIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 6.5l3 3 3-3" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.5 4.5h11M6.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5" />
      <path d="M4 4.5l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1" />
    </Icon>
  )
}

export function HandIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5.5 8.5V3.75a1 1 0 0 1 2 0V7.5M7.5 7V2.75a1 1 0 0 1 2 0V7.5M9.5 7.25V3.75a1 1 0 0 1 2 0V9.5a4.5 4.5 0 0 1-4.5 4.5h-.4a4 4 0 0 1-3-1.4L2 10.8a1 1 0 0 1 1.5-1.3l2 1.7" />
    </Icon>
  )
}

export function MapIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2 4l4-1.5 4 1.5 4-1.5v9.5l-4 1.5-4-1.5-4 1.5z" />
      <path d="M6 2.5v9.5M10 4v9.5" />
    </Icon>
  )
}

export function PointerIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.5 2.5l9 4.2-3.9 1.2-1.3 3.9z" />
    </Icon>
  )
}

export function TerminalIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M4.5 6.5l2 1.5-2 1.5M8 10h3.5" />
    </Icon>
  )
}

// A four-pointed spark: an agent, without borrowing any company's logo.
export function SparkIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 2c.4 3.2 1.4 4.6 5.5 6-4.1 1.4-5.1 2.8-5.5 6-.4-3.2-1.4-4.6-5.5-6C6.6 6.6 7.6 5.2 8 2z" />
    </Icon>
  )
}

export function HexIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" />
      <path d="M8 5.5v5M5.8 6.8l4.4 2.4M10.2 6.8L5.8 9.2" />
    </Icon>
  )
}

export function NoteIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.5 2.5h9v7l-4 4h-5z" />
      <path d="M12.5 9.5h-4v4M5.5 5.5h5M5.5 8h3" />
    </Icon>
  )
}

export function PenIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M10.5 2.8l2.7 2.7-7.4 7.4-3.4.7.7-3.4z" />
      <path d="M9 4.3l2.7 2.7" />
    </Icon>
  )
}

export function EraserIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6.3 13.5L2.6 9.8a1 1 0 0 1 0-1.4l5.8-5.8a1 1 0 0 1 1.4 0l3.6 3.6a1 1 0 0 1 0 1.4l-5.9 5.9z" />
      <path d="M5 6l5 5M6.3 13.5h7.2" />
    </Icon>
  )
}

export function FitIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.5 5.5v-2a1 1 0 0 1 1-1h2M10.5 2.5h2a1 1 0 0 1 1 1v2M13.5 10.5v2a1 1 0 0 1-1 1h-2M5.5 13.5h-2a1 1 0 0 1-1-1v-2" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
    </Icon>
  )
}

export function SidebarIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6 2.75v10.5M3.5 5.5h1M3.5 7.5h1" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Icon>
  )
}

export function SunIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8z" />
    </Icon>
  )
}

export function MonitorIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.5 13.75h5M8 11v2.75" />
    </Icon>
  )
}

export function LocateIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="4.25" />
      <path d="M8 1.75v2M8 12.25v2M1.75 8h2M12.25 8h2" />
    </Icon>
  )
}

// Two pins and the string between them: a link on the canvas.
export function LinkIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4.5 11.5Q5 4.5 11.5 4.5" />
      <circle cx="4.5" cy="11.5" r="2" fill="currentColor" />
      <circle cx="11.5" cy="4.5" r="2" fill="currentColor" />
    </Icon>
  )
}

export function UnlinkIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6.5 4.5l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1M9.5 11.5l-1 1a2.6 2.6 0 0 1-3.7-3.7l1-1" />
      <path d="M2.5 2.5l1.5 1.5M12 12l1.5 1.5" />
    </Icon>
  )
}

export function CodeIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" />
    </Icon>
  )
}

export function BoltIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 1.75L3.5 9h4l-1 5.25L12.5 7h-4z" />
    </Icon>
  )
}

export function BugIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="5" y="4.5" width="6" height="9" rx="3" />
      <path d="M8 8v5.5M5 8.5H2.5M13.5 8.5H11M5 11.5H3M13 11.5h-2M6.2 5L5 2.75M9.8 5L11 2.75" />
    </Icon>
  )
}

export function FlaskIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 2.25h4M6.75 2.25v4.25L3 12.6a.8.8 0 0 0 .7 1.15h8.6a.8.8 0 0 0 .7-1.15L9.25 6.5V2.25" />
      <path d="M4.6 10h6.8" />
    </Icon>
  )
}

export function DatabaseIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <ellipse cx="8" cy="4" rx="5" ry="1.75" />
      <path d="M3 4v8c0 1 2.2 1.75 5 1.75S13 13 13 12V4M3 8c0 1 2.2 1.75 5 1.75S13 9 13 8" />
    </Icon>
  )
}

export function GlobeIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.25 8h11.5M8 2.25c1.6 1.6 2.4 3.5 2.4 5.75S9.6 12.15 8 13.75C6.4 12.15 5.6 10.25 5.6 8S6.4 3.85 8 2.25z" />
    </Icon>
  )
}

export function BookIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 4.25C6.5 3.2 4.5 2.9 2.5 3.2v9.3c2-.3 4 0 5.5 1 1.5-1 3.5-1.3 5.5-1V3.2c-2-.3-4 0-5.5 1.05zM8 4.25v9.25" />
    </Icon>
  )
}

export function EyeIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  )
}

// A leaf from the Nara forest.
export function LeafIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.25 12.75C3 7 6.5 3.3 13 3c.1 6.6-3.6 10-9.75 9.75z" />
      <path d="M3.25 12.75L9 7" />
    </Icon>
  )
}

// Three nodes and the strings between them.
export function NodesIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="3.5" r="1.75" />
      <circle cx="3.5" cy="12" r="1.75" />
      <circle cx="12.5" cy="12" r="1.75" />
      <path d="M7.1 5L4.4 10.5M8.9 5l2.7 5.5M5.25 12h5.5" />
    </Icon>
  )
}

export function CupIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 6h8.5v3.5A3.5 3.5 0 0 1 8 13H6.5A3.5 3.5 0 0 1 3 9.5z" />
      <path d="M11.5 7h.75a1.75 1.75 0 0 1 0 3.5H11M6 2.5v1.5M8.5 2.5v1.5" />
    </Icon>
  )
}

export function BranchIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="4.5" cy="3.75" r="1.5" />
      <circle cx="4.5" cy="12.25" r="1.5" />
      <circle cx="11.5" cy="5.25" r="1.5" />
      <path d="M4.5 5.25v5.5M11.5 6.75c0 2.5-2 3.25-7 4" />
    </Icon>
  )
}

export function GearIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
      <circle cx="8" cy="8" r="4.5" />
    </Icon>
  )
}

export function PaletteIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 1.75a6.25 6.25 0 1 0 0 12.5c.9 0 1.4-.7 1.1-1.5-.4-1 .3-1.9 1.3-1.9h1.4a2.45 2.45 0 0 0 2.45-2.45C14.25 4.6 11.45 1.75 8 1.75z" />
      <circle cx="5" cy="7" r=".75" fill="currentColor" />
      <circle cx="7.5" cy="4.75" r=".75" fill="currentColor" />
      <circle cx="10.5" cy="5.5" r=".75" fill="currentColor" />
    </Icon>
  )
}

export function PawIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 8.5c-2 0-3.75 2.1-3.75 3.6 0 1.1.9 1.65 1.9 1.65.8 0 1.2-.4 1.85-.4s1.05.4 1.85.4c1 0 1.9-.55 1.9-1.65C11.75 10.6 10 8.5 8 8.5z" />
      <ellipse cx="3.25" cy="6.75" rx="1.1" ry="1.4" />
      <ellipse cx="6.1" cy="3.9" rx="1.1" ry="1.5" />
      <ellipse cx="9.9" cy="3.9" rx="1.1" ry="1.5" />
      <ellipse cx="12.75" cy="6.75" rx="1.1" ry="1.4" />
    </Icon>
  )
}

export function KeyboardIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M12 6.5h.01M4.5 9.5h7" />
    </Icon>
  )
}

export function InfoIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.75M8 5h.01" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25l3.25 3.25" />
    </Icon>
  )
}

export function UsersIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13c.3-2.2 1.9-3.5 4-3.5s3.7 1.3 4 3.5" />
      <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4.25M11.75 9.75c1.2.4 2 1.5 2.25 3.25" />
    </Icon>
  )
}

// Asleep: the pet slot left empty.
export function SleepIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12.2 9.6A5 5 0 0 1 6.4 3.8a5 5 0 1 0 5.8 5.8z" />
      <path d="M10 2.25h3l-3 3h3" />
    </Icon>
  )
}

export function ArrowUpRightIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 11l6-6M6 5h5v5" />
    </Icon>
  )
}

export function RefreshIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M13.25 8A5.25 5.25 0 1 1 11.6 4.2" />
      <path d="M12 1.75v2.75H9.25" />
    </Icon>
  )
}

export function ChatIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.75 4.25a1.5 1.5 0 0 1 1.5-1.5h7.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5v-2.5h.25a1.5 1.5 0 0 1-1.5-1.5z" />
    </Icon>
  )
}

export function PanelRightIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.75" />
      <path d="M10 2.75v10.5" />
    </Icon>
  )
}

export function SquareIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1.5" />
    </Icon>
  )
}

export function CircleIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.5" />
    </Icon>
  )
}

export function TriangleIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 2.75l5.75 10H2.25z" />
    </Icon>
  )
}

export function DiamondIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 2l6 6-6 6-6-6z" />
    </Icon>
  )
}

export function LineIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 13L13 3" />
    </Icon>
  )
}

export function ArrowIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 13L13 3M7 3h6v6" />
    </Icon>
  )
}

export function TextIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 4.5V3h10v1.5M8 3v10M6 13h4" />
    </Icon>
  )
}

export function CopyIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </Icon>
  )
}

export function BringFrontIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
      <path d="M11.5 6.5h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-1" />
    </Icon>
  )
}

export function SendBackIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="6.5" y="6.5" width="7" height="7" rx="1" />
      <path d="M4.5 9.5h-1a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v1" />
    </Icon>
  )
}

export function SendIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 13V3.5M3.75 7.5L8 3.25l4.25 4.25" />
    </Icon>
  )
}

export function ListChecksIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.5 4l1.25 1.25L6 3M2.5 10l1.25 1.25L6 9M8.5 4.25h5M8.5 10.25h5" />
    </Icon>
  )
}

export function DiffIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4.5 2.5v6M1.5 5.5h6M8.5 12.5h6" />
      <rect x="9.5" y="2.5" width="4" height="6" rx="1" />
    </Icon>
  )
}

export function RestartIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M13 8a5 5 0 1 1-1.6-3.65" />
      <path d="M13 2.75v3h-3" />
    </Icon>
  )
}

export function ImageIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.75" />
      <circle cx="6" cy="6.5" r="1.25" />
      <path d="M13.5 10.5l-3-3-6.5 5.75" />
    </Icon>
  )
}

export function QuoteIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 4.5v7M6.5 5h7M6.5 8h7M6.5 11h4.5" />
    </Icon>
  )
}

export function ListIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="3.5" cy="4.5" r=".75" fill="currentColor" />
      <circle cx="3.5" cy="8" r=".75" fill="currentColor" />
      <circle cx="3.5" cy="11.5" r=".75" fill="currentColor" />
      <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" />
    </Icon>
  )
}

export function NumberListIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.75 3.5h1v3M2.5 9.5h1.5l-1.5 2.5h1.75M6.5 4.5h7M6.5 8h7M6.5 11.5h7" />
    </Icon>
  )
}

export function CodeBlockIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" />
    </Icon>
  )
}

export function DividerIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.5 8h11M4.5 4.5h7M4.5 11.5h7" strokeOpacity=".45" />
      <path d="M2.5 8h11" />
    </Icon>
  )
}

export function FileIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.5z" />
      <path d="M9 2v3.5h3.5" />
    </Icon>
  )
}

export function FilePlusIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 14H4.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1H9l3.5 3.5V8" />
      <path d="M9 2v3.5h3.5M12 10v4M10 12h4" />
    </Icon>
  )
}

// Folders folding up: two chevrons pointing at each other.
export function CollapseIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 2.5L8 5.5l3-3M5 13.5L8 10.5l3 3" />
    </Icon>
  )
}

export function MarkdownIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" />
      <path d="M4.25 10.25v-4.5l1.75 2 1.75-2v4.5M10.75 5.75v4.5M9.25 8.75l1.5 1.5 1.5-1.5" />
    </Icon>
  )
}

// The mark: the Nara deer, a nod to the clan that tends the deer of the Nara forest. Decorative
// next to the name, so it has no alt text of its own.
export function ArrowLeftIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M13 8H3.5M7.5 4L3.5 8l4 4" />
    </Icon>
  )
}

export function ArrowRightIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 8h9.5M8.5 4l4 4-4 4" />
    </Icon>
  )
}

// Out to the corners: fill the screen.
export function ExpandIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" />
    </Icon>
  )
}

// In from the corners: back to its size.
export function ShrinkIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5L14 2M6.5 9.5L2 14" />
    </Icon>
  )
}

// Four corners out: take the whole screen.
export function FullScreenIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.5 6V3.5a1 1 0 011-1H6M10 2.5h2.5a1 1 0 011 1V6M13.5 10v2.5a1 1 0 01-1 1H10M6 13.5H3.5a1 1 0 01-1-1V10" />
    </Icon>
  )
}

// Four corners in: leave the whole screen.
export function ExitFullScreenIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 2.5V5a1 1 0 01-1 1H2.5M13.5 6H11a1 1 0 01-1-1V2.5M10 13.5V11a1 1 0 011-1h2.5M2.5 10H5a1 1 0 011 1v2.5" />
    </Icon>
  )
}

// A commit on its line, as in every git client.
export function CommitIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M1.5 8h3.75M10.75 8h3.75" />
    </Icon>
  )
}

// Down into the tray: a new version of the app.
export function DownloadIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 2.25v8M4.75 7.25L8 10.5l3.25-3.25M2.75 11.5v1.25a1 1 0 001 1h8.5a1 1 0 001-1V11.5" />
    </Icon>
  )
}

// A crosshair: point at a part of the page.
export function CrosshairIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M8 1.25v3M8 11.75v3M1.25 8h3M11.75 8h3" />
    </Icon>
  )
}

export function BrandMark(): JSX.Element {
  return <img className="brand-mark" src={logo} alt="" width="28" height="28" />
}
