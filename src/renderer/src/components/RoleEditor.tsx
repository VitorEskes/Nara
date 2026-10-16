import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronIcon, PenIcon, TrashIcon } from './icons'
import { TONES } from '../nodeStyle'
import { ACCESS, MODELS, MODES, agentPrompt, roleProfile } from '../../../shared/prompt'
import type { NodeId, Role } from '../../../shared/types'

// Starting points for a new role, with the settings that suit each one.
const IDEAS: Role[] = [
  {
    label: 'Tester',
    tone: 'leaf',
    description: 'Writes and runs the tests for what changed',
    instructions: `- When a task arrives, read what changed and write tests that cover it, edge cases included. Run the whole suite, not only the new tests.
- Report what you tested, what failed and how to reproduce each failure.
- Fix the tests, not the code under test: report bugs instead of patching them.`
  },
  {
    label: 'Architect',
    tone: 'plum',
    description: 'Designs the approach before code is written',
    mode: 'plan',
    instructions: `- Before code is written, study the codebase and propose an approach: the modules involved, how data flows, the trade-offs and the risks.
- Write the plan to a linked note if there is one, and send a short summary to whoever asked.
- Don't implement it. Answer questions about the design, and check that the result follows it.`
  },
  {
    label: 'Security',
    tone: 'clay',
    description: 'Hunts for vulnerabilities, without editing',
    access: 'read-only',
    instructions: `- Review what you're sent for vulnerabilities: injection, unsafe input handling, secrets in code, missing auth checks, risky dependencies.
- Report each finding with file:line, how it could be exploited and how to fix it, the most severe first.
- Say plainly when you found nothing worth fixing.`
  },
  {
    label: 'Docs writer',
    tone: 'slate',
    description: 'Keeps the docs in step with the code',
    model: 'sonnet',
    instructions: `- Read the change you're sent and update the docs it affects: the README, guides, comments on public APIs, the changelog.
- Write for someone new to the project, with examples rather than long explanations.
- Reply with the files you changed. Don't touch code beyond doc comments.`
  }
]

// Writing a role: its name and tone, a line about it, the instructions, and the settings that hold
// the agent to it (shared/prompt.ts). A new, empty role offers a few to start from. `draft` is the
// role as written so far; onChange gets the fields that changed. The new terminal dialog, the side
// panel and the settings all use it.
export default function RoleEditor({
  draft,
  onChange,
  onSave,
  onCancel
}: {
  draft: Role
  onChange: (changes: Partial<Role>) => void
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  const first = useRef<HTMLInputElement>(null)
  const profile = roleProfile(draft)

  useEffect(() => {
    first.current?.focus()
  }, [])

  // Enter in the name saves, instead of submitting the whole dialog.
  function onEnter(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.stopPropagation()
    if (draft.label.trim()) onSave()
  }

  return (
    <div className="role-editor" data-tone={draft.tone}>
      <div className="role-editor-name">
        <input
          ref={first}
          className="text-input"
          value={draft.label}
          placeholder="Role name"
          maxLength={40}
          aria-label="Role name"
          onChange={(e) => onChange({ label: e.target.value })}
          onKeyDown={onEnter}
        />
        <div className="tones small">
          {Object.entries(TONES).map(([key, { label }]) => (
            <button
              key={key}
              type="button"
              className="tone-dot"
              data-tone={key}
              title={label}
              aria-label={label}
              aria-pressed={draft.tone === key}
              onClick={() => onChange({ tone: key })}
            />
          ))}
        </div>
      </div>
      <input
        className="text-input"
        value={draft.description ?? ''}
        placeholder="In one line, what it's for"
        maxLength={120}
        aria-label="Description"
        onChange={(e) => onChange({ description: e.target.value })}
        onKeyDown={onEnter}
      />
      <textarea
        className="text-input role-instructions"
        value={draft.instructions}
        placeholder="How it works: what it does, what it never does, who it reports to"
        aria-label="Instructions"
        onChange={(e) => onChange({ instructions: e.target.value })}
      />
      {!draft.key && !draft.instructions && (
        <div className="role-ideas">
          {IDEAS.map((idea) => (
            <button
              key={idea.label}
              type="button"
              className="idea"
              data-tone={idea.tone}
              onClick={() => onChange({ model: '', mode: '', access: 'full', ...idea })}
            >
              <span className="role-dot" />
              {idea.label}
            </button>
          ))}
        </div>
      )}

      <div className="role-settings">
        <RoleSetting
          label="Access"
          options={ACCESS}
          value={profile.access}
          onPick={(access) => onChange({ access })}
        />
        <RoleSetting
          label="Permissions"
          options={MODES}
          value={profile.mode}
          onPick={(mode) => onChange({ mode })}
        />
        <RoleSetting
          label="Model"
          hint="Claude Code"
          options={MODELS}
          value={profile.model}
          onPick={(model) => onChange({ model })}
        />
        <label className="role-setting column">
          <span className="role-setting-label">
            First message <small>optional</small>
          </span>
          <textarea
            className="text-input role-kickoff"
            value={draft.kickoff ?? ''}
            placeholder="Sent as the agent opens, so it starts working in its role right away"
            maxLength={2000}
            onChange={(e) => onChange({ kickoff: e.target.value })}
          />
        </label>
      </div>

      <PromptPreview role={draft.label.trim() ? draft : null} />

      <div className="role-editor-foot">
        <button type="button" className="button subtle" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="button primary small"
          disabled={!draft.label.trim()}
          onClick={onSave}
        >
          <CheckIcon size={14} />
          Save
        </button>
      </div>
    </div>
  )
}

// One of the role's settings as a row of options, the detail of the chosen one under it.
function RoleSetting({
  label,
  hint,
  options,
  value,
  onPick
}: {
  label: string
  hint?: string
  options: Record<string, { label: string; detail?: string }>
  value: string
  onPick: (key: string) => void
}): JSX.Element {
  return (
    <div className="role-setting">
      <span className="role-setting-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="panel-options">
        {Object.entries(options).map(([key, option]) => (
          <button
            key={key || 'default'}
            type="button"
            title={option.detail}
            aria-pressed={value === key}
            onClick={() => onPick(key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {options[value]?.detail && (
        <span className="role-setting-detail">{options[value].detail}</span>
      )}
    </div>
  )
}

// The whole prompt the agent gets, folded away until asked for: the proof that the role is in it.
export function PromptPreview({
  role,
  nodeId = 'N'
}: {
  role: Role | null | undefined
  nodeId?: NodeId | string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="prompt-preview" data-open={open || undefined}>
      <button type="button" className="prompt-preview-toggle" onClick={() => setOpen((o) => !o)}>
        <ChevronIcon size={12} />
        What the agent is told
      </button>
      {open && <pre className="prompt-preview-text">{agentPrompt(nodeId, role ?? undefined)}</pre>}
    </div>
  )
}

// The settings a role holds the agent to, as small badges.
export function RoleBadges({ role }: { role: Role }): JSX.Element | null {
  const { model, mode, access, kickoff } = roleProfile(role)
  const badges = [
    access === 'read-only' && ACCESS[access].label,
    mode && MODES[mode].label,
    model && MODELS[model].label,
    kickoff && 'Starts on its own'
  ].filter((badge): badge is string => Boolean(badge))
  if (!badges.length) return null
  return (
    <div className="role-badges">
      {badges.map((badge) => (
        <span key={badge} className="role-badge">
          {badge}
        </span>
      ))}
    </div>
  )
}

// What the chosen role tells the agent, and the settings it comes with. Built-in roles are
// read-only; custom ones can be edited, and deleted with a second click.
export function RoleDetail({
  role,
  custom,
  onEdit,
  onRemove
}: {
  role: Role
  custom?: boolean
  onEdit?: () => void
  onRemove?: () => void
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const { kickoff } = roleProfile(role)
  return (
    <div className="role-detail" data-tone={role.tone}>
      <div className="role-detail-head">
        <span className="role-dot" />
        <h3>{role.label}</h3>
        {custom && (
          <>
            <button
              type="button"
              className="icon-button small"
              title="Edit"
              aria-label={`Edit ${role.label}`}
              onClick={onEdit}
            >
              <PenIcon size={13} />
            </button>
            {confirming ? (
              <button type="button" className="button subtle danger confirm" onClick={onRemove}>
                Delete?
              </button>
            ) : (
              <button
                type="button"
                className="icon-button small danger"
                title="Delete"
                aria-label={`Delete ${role.label}`}
                onClick={() => setConfirming(true)}
              >
                <TrashIcon size={13} />
              </button>
            )}
          </>
        )}
      </div>
      {role.description && <p className="role-summary">{role.description}</p>}
      <RoleBadges role={role} />
      {role.instructions && <Instructions text={role.instructions} />}
      {kickoff && (
        <div className="role-kickoff-view">
          <span>First message</span>
          <p>{kickoff}</p>
        </div>
      )}
      {/* "No role" (role.none) shows what every agent gets. */}
      <PromptPreview role={role.none ? null : role} />
    </div>
  )
}

// Instructions as they read best: lines starting with "- " as a list, the rest as paragraphs.
function Instructions({ text }: { text: string }): JSX.Element {
  const blocks: (string | string[])[] = []
  for (const line of text.split('\n').filter((l) => l.trim())) {
    const item = line.match(/^\s*-\s+(.*)$/)?.[1]
    const last = blocks[blocks.length - 1]
    if (item && Array.isArray(last)) last.push(item)
    else blocks.push(item ? [item] : line)
  }
  return (
    <div className="role-instructions-view">
      {blocks.map((block, i) =>
        Array.isArray(block) ? (
          <ul key={i}>
            {block.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block}</p>
        )
      )}
    </div>
  )
}
