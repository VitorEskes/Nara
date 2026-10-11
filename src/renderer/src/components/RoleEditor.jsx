import { useEffect, useRef, useState } from 'react'
import { CheckIcon, PenIcon, TrashIcon } from './icons'
import { TONES } from '../nodeStyle'

// Starting points for a new role. Main puts "Your role is <name>." before the instructions, so
// they pick up from there.
const IDEAS = [
  {
    label: 'Tester',
    tone: 'leaf',
    instructions: `- When a task arrives, read what changed and write tests that cover it, edge cases included. Run the whole suite, not only the new tests.
- Reply to the sender with what you tested, what failed and how to reproduce each failure.
- Fix the tests, not the code under test: report bugs instead of patching them.`
  },
  {
    label: 'Architect',
    tone: 'plum',
    instructions: `- Before code is written, study the codebase and propose an approach: the modules involved, how data flows, the trade-offs and the risks.
- Write the plan to a linked note if there is one, and send a short summary to whoever asked.
- Don't implement it. Answer questions about the design, and check that the result follows it.`
  },
  {
    label: 'Security',
    tone: 'clay',
    instructions: `- Review what you're sent for vulnerabilities: injection, unsafe input handling, secrets in code, missing auth checks, risky dependencies.
- Don't edit files. Report each finding with file:line, how it could be exploited and how to fix it, the most severe first.
- Say plainly when you found nothing worth fixing.`
  },
  {
    label: 'Docs writer',
    tone: 'slate',
    instructions: `- Read the change you're sent and update the docs it affects: the README, guides, comments on public APIs, the changelog.
- Write for someone new to the project, with examples rather than long explanations.
- Reply with the files you changed. Don't touch code beyond doc comments.`
  }
]

// Writing a role: its name, its tone and the instructions it adds to the prompt. A new, empty
// role offers a few to start from. `draft` is the role as written so far; onChange gets the
// fields that changed. The new terminal dialog and the side panel both use it.
export default function RoleEditor({ draft, onChange, onSave, onCancel }) {
  const first = useRef(null)

  useEffect(() => {
    first.current.focus()
  }, [])

  // Enter in the name saves, instead of submitting the whole dialog.
  function onEnter(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.stopPropagation()
    if (draft.label.trim()) onSave()
  }

  return (
    <div className="role-editor" data-tone={draft.tone}>
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
      <textarea
        className="text-input role-instructions"
        value={draft.instructions}
        placeholder="How it should work with the other agents"
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
              onClick={() => onChange(idea)}
            >
              <span className="role-dot" />
              {idea.label}
            </button>
          ))}
        </div>
      )}
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

// What the chosen role tells the agent. Built-in roles can only be read; custom ones can be
// edited and deleted, the deletion after a second click.
export function RoleDetail({ role, custom, onEdit, onRemove }) {
  const [confirming, setConfirming] = useState(false)
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
      {role.instructions && <Instructions text={role.instructions} />}
    </div>
  )
}

// Instructions as they read best: lines starting with "- " as a list, the rest as paragraphs.
function Instructions({ text }) {
  const blocks = []
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
