# Nara

An agentic development environment: AI coding agents (Claude Code, Codex) on an
infinite canvas, with roles that hold them to a job, a whiteboard and Markdown notes
around them, what each one spends and does in an inspector, git worktrees of their
own, and a voice bar to talk to them from anywhere.

Desktop app built with Electron + React: each canvas node is a real terminal
(`node-pty` in the main process, `xterm.js` in the renderer, connected over IPC).

## Running

```bash
npm install   # postinstall rebuilds node-pty for Electron's ABI
npm run dev
```

## Structure

- `src/main/pty.js` — creates and manages the PTYs (`pty:create`, `pty:write`, `pty:resize`, `pty:kill`)
- `src/main/workspaces.js` — keeps each open workspace in memory and saves it to `workspaces/<id>.json` in the app's data folder; `projects.json` holds the projects (a name and a default folder for their workspaces) and `state.json` remembers the open workspaces
- `src/main/messages.js` — socket that takes requests from the `nara` command, delivers messages between linked terminals and reads or writes linked notes
- `src/main/cli.js` + `resources/bin/nara` — the `nara` command (`peers`, `send`, `note`) available inside every terminal
- `src/main/agents.js` — the command that opens each agent: Claude Code gets a session id so a restored node resumes its conversation; both agents get the prompt and the flags their role asks for (read-only access, permission mode, model, a first message), and Claude Code the hooks that report its state. Also the wrapper that runs a plain terminal's start command
- `src/shared/prompt.js` — what an agent is told (its role first, then how Nara works, then its worktree) and the settings a role can hold it to
- `src/main/roles.js` — the roles the user made, saved in `roles.json` and offered on every canvas
- `src/main/status.js` — what each agent is doing (working, waiting on the user, done, failed), from Claude Code's hooks (`nara hook`) and its terminal's output
- `src/main/telemetry.js` — what each agent spends and does, read from Claude Code's transcripts and Codex's rollouts: tokens, context, estimated cost, task list and activity
- `src/main/git.js` — worktrees of their own for agents, and the changes and diffs in a node's folder, with merging and removing a worktree
- `src/main/voice.js` — the voice bar's window and shortcut (Ctrl+Alt+V), its settings, and transcription through an OpenAI-style API or whisper.cpp
- `src/main/pets.js` — the pets in Nara's pets folder and in Codex's (a folder with `pet.json` and a sprite sheet, Codex's format), and adding one from its `pet.json` or a `.zip`
- `src/main/hud.js` — the floating HUD: a window over every app with the pet's command center, toggled with a global shortcut (Ctrl+Alt+Space)
- `src/main/folders.js` — the folder picker, and the short path and git branch the new terminal dialog shows
- `src/shared/agents.js` — the agents a node can open with (Claude Code, Codex), used by main and the renderer
- `src/shared/roles.js` — the built-in roles an agent can open with (orchestrator, worker, reviewer) and the instructions each one adds to the prompt
- `src/preload/index.js` — exposes `window.api.pty`, `window.api.workspace` and `window.api.project` to the renderer
- `src/renderer/src/components/Sidebar.jsx` — the sidebar with the app's actions, the projects, their workspaces and the loose workspaces
- `src/renderer/src/shortcuts.js` — the app-wide shortcuts (Ctrl+Shift+N new workspace, Ctrl+Shift+W all workspaces, Ctrl+Shift+O add project)
- `src/renderer/src/components/Overview.jsx` — the page with every workspace as a card, grouped by project, shown in place of the canvas
- `src/renderer/src/components/Terminal.jsx` — an xterm.js terminal connected to a PTY
- `src/renderer/src/components/Launcher.jsx` — the new terminal dialog behind the dock's Terminal button, in three tabs: General (program, name, start command, folder), Style (the look, with a preview) and Role (pick one and read its instructions, or write a new one)
- `src/renderer/src/components/Settings.jsx` — the settings dialog (Ctrl+,): appearance, agents' commands, roles, pets, keyboard, about
- `src/renderer/src/components/Pet.jsx` + `Shika.jsx` + `src/renderer/src/pets.js` — the pet in the corner of the window that follows the agents, Shika the built-in deer, and the sprite sheets of the others
- `src/renderer/src/components/CommandCenter.jsx` + `Hud.jsx` + `src/renderer/src/agentStatus.js` — every agent by workspace and urgency, answered with yes, no or a line of text, and the HUD made of it
- `src/renderer/src/components/TerminalLook.jsx` + `src/renderer/src/terminalThemes.js` — a terminal's look (color scheme, tone, icon, text size, cursor), in the dialog and the side panel, and the color schemes
- `src/renderer/src/components/Note.jsx` + `src/renderer/src/markdown.js` — a note: Markdown, edited as blocks (headings, lists, checklists, quotes, code) with `/` for a menu of them
- `src/renderer/src/components/Inspector.jsx` — the inspector on the right of the canvas: the selected node in tabs (Overview, Tasks, Activity, Changes, Role, Format) or the workspace at a glance
- `src/renderer/src/components/TopBar.jsx` — the bar over a canvas: where you are, the branch, how its agents are doing, what they've spent, the zoom
- `src/renderer/src/nodeStyle.js` — the options a note's and a terminal's look are picked from
- `src/renderer/src/components/Links.jsx` — links drawn as a string pinned between two nodes
- `src/renderer/src/assets/main.css` — all the styles; the palette (graphite, dark first) and fonts are variables at the top
- `src/renderer/src/components/Shapes.jsx` + `StyleBar.jsx` + `src/renderer/src/shapes.js` + `whiteboard.js` — the whiteboard: shapes, lines, arrows, text and freehand strokes over the canvas, selected, moved, resized and turned, with their style and undo
- `src/renderer/src/components/VoiceBar.jsx` + `src/renderer/src/recorder.js` — the voice bar and the recording it sends to be transcribed
