# anbu

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
- `src/main/workspaces.js` — keeps each open workspace in memory and saves it to `workspaces/<id>.json` in the app's data folder; `state.json` remembers the open tabs
- `src/main/messages.js` — socket that takes requests from the `anbu` command, delivers messages between linked terminals and reads or writes linked notes
- `src/main/cli.js` + `resources/bin/anbu` — the `anbu` command (`peers`, `send`, `note`) available inside every terminal
- `src/main/agents.js` — the command that opens each agent; Claude Code gets a session id so a restored node resumes its conversation, and a prompt that explains anbu and the node's role
- `src/shared/agents.js` — the agents a node can open with (Claude Code, Codex), used by main and the renderer
- `src/shared/roles.js` — the roles an agent can open with (orchestrator, worker, reviewer) and the instructions each one adds to the prompt
- `src/preload/index.js` — exposes `window.api.pty` and `window.api.workspace` to the renderer
- `src/renderer/src/components/Terminal.jsx` — an xterm.js terminal connected to a PTY
- `src/renderer/src/components/AgentButton.jsx` — the toolbar button that opens an agent, with the role menu
- `src/renderer/src/components/Note.jsx` — a sticky note, whose text is saved with the workspace
- `src/renderer/src/components/Drawings.jsx` + `src/renderer/src/drawing.js` — freehand strokes drawn over the canvas, and the geometry behind them
