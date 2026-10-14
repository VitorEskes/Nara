import { AGENTS } from './agents'

// What an agent is told when it opens in a node, and the flags that hold it to its role. Main
// builds the command line from this (main/agents.js) and the renderer shows the same text in the
// role's preview, so what the user reads is exactly what the agent gets.
//
// A role is { label, description, instructions, model, mode, access, kickoff }: the words go into
// the prompt, the rest becomes flags. Instructions alone are a request the agent may weigh against
// everything else it was told; the flags are enforced by the agent itself, so a read-only reviewer
// can't edit a file however the conversation goes.

// The models a role can pin, as Claude Code's aliases. Codex names its models differently, so
// there the role's model is left out.
export const MODELS = {
  '': { label: 'Default' },
  opus: { label: 'Opus' },
  sonnet: { label: 'Sonnet' },
  haiku: { label: 'Haiku' }
}

// How much the agent asks before acting. Claude Code's permission modes; plan keeps it from
// changing anything until the user approves a plan.
export const MODES = {
  '': { label: 'Default', detail: 'Asks before edits and commands, as usual' },
  plan: { label: 'Plan first', detail: 'Studies and proposes a plan before touching anything' },
  acceptEdits: {
    label: 'Accept edits',
    detail: 'Edits files without asking; still asks for commands'
  },
  auto: { label: 'Auto', detail: 'Works on its own, asking only when something looks risky' }
}

// Whether the agent can change files. Read-only takes the editing tools away from Claude Code and
// runs Codex in a read-only sandbox.
export const ACCESS = {
  full: { label: 'Can edit', detail: 'Reads and changes files' },
  'read-only': { label: 'Read-only', detail: 'Reads and runs commands, never edits files' }
}

// Claude Code's tools that change files.
export const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit']

// A role's settings with every field filled in and checked, whatever was saved.
export function roleProfile(role = {}) {
  return {
    model: Object.hasOwn(MODELS, role.model ?? '') ? (role.model ?? '') : '',
    mode: Object.hasOwn(MODES, role.mode ?? '') ? (role.mode ?? '') : '',
    access: role.access === 'read-only' ? 'read-only' : 'full',
    kickoff: typeof role.kickoff === 'string' ? role.kickoff.trim() : ''
  }
}

// The role's part of the prompt. It comes first, before how Nara works, and says plainly that it
// holds for the whole session: appended at the end of a long prompt, a role reads as background.
export function rolePrompt(role) {
  if (!role) return ''
  const summary = role.description ? ` ${role.description.replace(/\.?$/, '.')}` : ''
  const lines = [
    `# Your role: ${role.label}`,
    '',
    `You are the ${role.label} on this team.${summary}`
  ]
  if (role.instructions?.trim()) lines.push('', role.instructions.trim())
  const { access, mode } = roleProfile(role)
  if (access === 'read-only') {
    lines.push('', 'You work read-only: Nara has taken away your tools for editing files.')
  }
  if (mode === 'plan') {
    lines.push(
      '',
      'You start in plan mode: propose a plan and wait for approval before changing anything.'
    )
  }
  lines.push(
    '',
    'This role was set by the user and holds for the whole session. Act as it says even when nobody reminds you; the user can still ask for something else directly, and that comes first.'
  )
  return lines.join('\n')
}

// How Nara works, for every agent that opens in a node.
export function naraPrompt(nodeId) {
  return `# Working inside Nara

You are running inside Nara, a desktop app where terminals and AI agents live as nodes on an infinite canvas. You are terminal ${nodeId}. The user sees your terminal on the canvas and can link it to other nodes: other terminals, usually running agents, notes, which are shared text, and browsers, web pages the user sees too.

You reach the nodes linked to you with the \`nara\` command, run from your shell:
  nara peers                        list the terminals and notes linked to you, with their roles
  nara send <terminal> <text>       send a message to a linked terminal
  nara note read <note>             print a linked note
  nara note write <note> <text>     replace the note's text
  nara note append <note> <text>    add a line to the end of the note
  nara browser open <browser> <url> load a page in a linked browser
  nara browser read <browser>       print the page's address, title and text
  nara browser shot <browser>       save a screenshot of the page (prints the PNG's path)

How it works:
- The user can add and remove links at any time. Run \`nara peers\` whenever you need to know who you can reach, instead of relying on an earlier answer.
- A message arrives in the other terminal as if someone had typed it there. Messages to you arrive the same way, as a new turn that starts with "[nara · message from terminal N · reply with: nara send N ...]". That turn comes from the agent in terminal N, not from the user. Turns without that header come from the user, who has the final word.
- Don't sleep, poll or wait for a reply: end your turn, and the reply will arrive as a new message.
- Only terminals running an agent can receive messages; \`nara peers\` marks the ones that only have a shell.
- Notes are Markdown, and the user reads them rendered: headings, lists, checklists (- [ ] and - [x]), code. Use them for what's worth keeping in view, like a plan, a status or a result, and tick checklist items as they get done. Keep messages short and point to a note or a file for anything long.
- A linked browser is where to check a web UI you're working on: open the dev server in it, read it, or take a screenshot and look at the image.
- Text with several lines or with quotes is safer through stdin: nara send 2 <<'EOF' ... EOF`
}

// Everything the agent is told: its role first, then how Nara works, then, for an agent in a
// worktree of its own ({ branch, base }), where its work goes.
export function agentPrompt(nodeId, role, worktree) {
  const parts = [rolePrompt(role), naraPrompt(nodeId), worktreePrompt(worktree)]
  return parts.filter(Boolean).join('\n\n')
}

function worktreePrompt(worktree) {
  if (!worktree?.branch) return ''
  return `# Your worktree

You work in a git worktree of your own, on the branch ${worktree.branch}, made from ${worktree.base}. Other agents may be working on ${worktree.base} or on branches of their own at the same time, so stay on this branch. Commit your work here as you finish each piece, with clear messages: the user reviews this branch in Nara and merges it into ${worktree.base} from there, and only commits get merged.`
}

// The settings the role turns into, in words, for the role's card and the inspector:
// [{ label, value }].
// Without an agent (a plain terminal, where any of them may start), every flag shows: each holds
// where the agent that starts has it. Agents that take their context as a message (shared/agents.js)
// have none of them.
export function roleFlags(agent, role) {
  if (!role) return []
  const { model, mode, access, kickoff } = roleProfile(role)
  const flagged = !agent || AGENTS[agent]?.context === 'flags'
  const claudeLike = flagged && agent !== 'codex'
  const flags = []
  if (claudeLike && model) flags.push({ label: 'Model', value: MODELS[model].label })
  if (claudeLike && mode) flags.push({ label: 'Permissions', value: MODES[mode].label })
  if (flagged && access === 'read-only')
    flags.push({ label: 'Access', value: ACCESS[access].label })
  if (kickoff) flags.push({ label: 'Starts with', value: kickoff })
  return flags
}
