import type { ElementType, ReactNode } from 'react'
import { isRenameKey, useRename } from '../rename'

// A heading that renames on double-click, or on F2 when focused.
export default function Name({
  name,
  onRename,
  as: Tag = 'span',
  className
}: {
  name: string
  onRename: (name: string) => void
  as?: ElementType
  className?: string
}): ReactNode {
  const { editing, start, field } = useRename(name, onRename)
  if (editing) return field
  return (
    <Tag
      className={className}
      tabIndex={0}
      title="Double-click or F2 to rename"
      onDoubleClick={start}
      onKeyDown={(e: React.KeyboardEvent) => isRenameKey(e) && start()}
    >
      {name}
    </Tag>
  )
}
