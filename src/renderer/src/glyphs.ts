import {
  BookIcon,
  BoltIcon,
  BugIcon,
  CodeIcon,
  CupIcon,
  DatabaseIcon,
  EyeIcon,
  FlaskIcon,
  GlobeIcon,
  HexIcon,
  LeafIcon,
  NodesIcon,
  SparkIcon,
  TerminalIcon,
  type IconComponent
} from './components/icons'

// The icons a terminal can wear on its bar, picked in its look. The first three are the programs'
// own.
export const GLYPHS: Record<string, { label: string; Icon: IconComponent }> = {
  terminal: { label: 'Terminal', Icon: TerminalIcon },
  spark: { label: 'Spark', Icon: SparkIcon },
  hex: { label: 'Hex', Icon: HexIcon },
  code: { label: 'Code', Icon: CodeIcon },
  bolt: { label: 'Bolt', Icon: BoltIcon },
  bug: { label: 'Bug', Icon: BugIcon },
  flask: { label: 'Flask', Icon: FlaskIcon },
  database: { label: 'Database', Icon: DatabaseIcon },
  globe: { label: 'Globe', Icon: GlobeIcon },
  book: { label: 'Book', Icon: BookIcon },
  eye: { label: 'Eye', Icon: EyeIcon },
  nodes: { label: 'Nodes', Icon: NodesIcon },
  leaf: { label: 'Leaf', Icon: LeafIcon },
  cup: { label: 'Cup', Icon: CupIcon }
}

// The icon a program shows when the node hasn't picked one.
const PROGRAM_ICONS: Record<string, string> = { claude: 'spark', codex: 'hex' }

export function programIcon(agent: string | null | undefined): string {
  return (agent && PROGRAM_ICONS[agent]) || 'terminal'
}
