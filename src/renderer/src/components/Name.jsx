import { isRenameKey, useRename } from '../rename'

// A heading that renames on double-click, or on F2 when focused.
export default function Name({ name, onRename, as: Tag = 'span', className }) {
  const { editing, start, field } = useRename(name, onRename)
  if (editing) return field
  return (
    <Tag
      className={className}
      tabIndex={0}
      title="Double-click or F2 to rename"
      onDoubleClick={start}
      onKeyDown={(e) => isRenameKey(e) && start()}
    >
      {name}
    </Tag>
  )
}
