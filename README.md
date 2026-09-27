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
- `src/main/workspaces.js` — keeps each canvas in memory and saves it to `workspaces/<id>.json` in the app's data folder
- `src/main/messages.js` — socket that takes requests from the `anbu` command and delivers messages between linked terminals
- `src/main/cli.js` + `resources/bin/anbu` — the `anbu` command (`peers`, `send`) available inside every terminal
- `src/preload/index.js` — exposes `window.api.pty` and `window.api.workspace` to the renderer
- `src/renderer/src/components/Terminal.jsx` — an xterm.js terminal connected to a PTY
