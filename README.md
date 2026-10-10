# Nara

Runs AI coding agents (Claude Code, Codex) with an infinite canvas as the
interface.

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
- `src/main/agents.js` — the command that opens each agent; Claude Code gets a session id so a restored node resumes its conversation, and a prompt that explains Nara and the node's role
- `src/shared/agents.js` — the agents a node can open with (Claude Code, Codex), used by main and the renderer
- `src/shared/roles.js` — the roles an agent can open with (orchestrator, worker, reviewer) and the instructions each one adds to the prompt
- `src/preload/index.js` — exposes `window.api.pty`, `window.api.workspace` and `window.api.project` to the renderer
- `src/renderer/src/components/Sidebar.jsx` — the sidebar with the app's actions, the projects, their workspaces and the loose workspaces
- `src/renderer/src/shortcuts.js` — the app-wide shortcuts (Ctrl+Shift+N new workspace, Ctrl+Shift+W all workspaces, Ctrl+Shift+O add project)
- `src/renderer/src/components/Overview.jsx` — the page with every workspace as a card, grouped by project, shown in place of the canvas
- `src/renderer/src/components/Terminal.jsx` — an xterm.js terminal connected to a PTY
- `src/renderer/src/components/AgentButton.jsx` — the toolbar button that opens an agent, with the role menu
- `src/renderer/src/components/Note.jsx` — a note, whose text and text style are saved with the workspace
- `src/renderer/src/components/NotePanel.jsx` + `src/renderer/src/noteStyle.js` — the side panel that styles the selected note (font, size, colors, alignment), and the options it offers
- `src/renderer/src/components/Links.jsx` — links drawn as a string pinned between two nodes
- `src/renderer/src/assets/main.css` — all the styles; the palette and fonts are variables at the top
- `src/renderer/src/components/Drawings.jsx` + `src/renderer/src/drawing.js` — freehand strokes drawn over the canvas, and the geometry behind them
