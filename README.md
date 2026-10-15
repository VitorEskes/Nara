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
- `src/main/code.js` — the code view's files: a folder's tree with its git status, reading and writing a file (refusing to write over a change made on disk since it was read), creating, renaming and trashing, and watching the open files for agents' edits; every path has to be inside the workspace's folder or one of its agents' worktrees
- `src/main/review.js` — the review queue: what each agent changed, one item per repository (its own worktree, or the checkout it shares), against where its work began; a file as it was then, discarding a file's changes, committing, and merging a worktree's branch (a merge that conflicts is undone and reported)
- `src/main/browser.js` + `src/shared/url.js` — browser nodes: their pages locked down like any website's, and `nara browser` (open, read, screenshot, reload) for an agent linked to one
- `src/main/shell.js` — the shell integration of plain terminals (zsh, bash): an agent CLI typed in one starts through `nara run`, with Nara's prompt and the node's role
- `src/main/pet.js` + `petProcess.js` — the desktop pet, in a process of its own (`--nara-pet`, through XWayland under Wayland) so it stays over every app; the two talk over a socket
- `src/main/voice.js` + `whisper.js` — the voice bar's window and shortcut (Ctrl+Alt+V), its settings, and speech to text on this computer: Whisper through transformers.js in a utility process, or whisper.cpp; off for now (`src/shared/features.js`)
- `src/main/usage.js` — how much of their plans the agents have used (5-hour window and week), from Claude's usage endpoint with Claude Code's login, its status line, and Codex's rollouts
- `src/main/images.js` — images in notes, kept in the data folder and served as `nara-image:`
- `src/main/pets.js` — the pets in Nara's pets folder and in Codex's (a folder with `pet.json` and a sprite sheet, Codex's format), and adding one from its `pet.json` or a `.zip`
- `src/main/hud.js` — the floating HUD: a window over every app with the pet's command center, toggled with a global shortcut (Ctrl+Alt+Space)
- `src/main/folders.js` — the folder picker, and the short path and git branch the new terminal dialog shows
- `src/shared/agents.js` — the agents a node can open with (Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Cursor Agent, Copilot CLI, Aider, Amp) and how each gets Nara's prompt, used by main and the renderer
- `src/shared/roles.js` — the built-in roles an agent can open with (orchestrator, worker, reviewer) and the instructions each one adds to the prompt
- `src/preload/index.js` — exposes `window.api.pty`, `window.api.workspace` and `window.api.project` to the renderer
- `src/renderer/src/components/Sidebar.jsx` — the sidebar with the app's actions, the projects, their workspaces and the loose workspaces; the open workspaces show how their agents are doing, and the one on screen opens into a card
- `src/renderer/src/components/WorkspaceNav.jsx` + `StateGlyph.jsx` — the card of the workspace on screen, which the workspace renders into the sidebar: its branch and its agents, each with what it's doing; a click on one opens what it has spent and changed
- `src/renderer/src/components/ViewSwitch.jsx` + `src/renderer/src/views.js` — the workspace's views (canvas, code, review) as icons, at the top of the side panel, or in the top bar while the panel is closed
- `src/renderer/src/shortcuts.js` — the app-wide shortcuts (Ctrl+Shift+N new workspace, Ctrl+Shift+W all workspaces, Ctrl+Shift+O add project)
- `src/renderer/src/components/Overview.jsx` — the page with every workspace as a card, grouped by project, shown in place of the canvas
- `src/renderer/src/components/Terminal.jsx` — an xterm.js terminal connected to a PTY
- `src/renderer/src/components/Launcher.jsx` — the new terminal dialog behind the dock's Terminal button, in three tabs: General (program, name, start command, folder), Style (the look, with a preview) and Role (pick one and read its instructions, or write a new one)
- `src/renderer/src/components/Settings.jsx` — the settings dialog (Ctrl+,): appearance, agents' commands, roles, pets, keyboard, about
- `src/renderer/src/components/Pet.jsx` + `Shika.jsx` + `src/renderer/src/pets.js` — the pet in the corner of the window that follows the agents, Shika the built-in deer, and the sprite sheets of the others
- `src/renderer/src/components/CommandCenter.jsx` + `Hud.jsx` + `src/renderer/src/agentStatus.js` — every agent by workspace and urgency, answered with yes, no or a line of text, and the HUD made of it
- `src/renderer/src/components/TerminalLook.jsx` + `src/renderer/src/terminalThemes.js` — a terminal's look (color scheme, tone, icon, text size, cursor), in the dialog and the side panel, and the color schemes
- `src/renderer/src/components/Note.jsx` + `src/renderer/src/markdown.js` — a note: Markdown, edited as blocks (headings, lists, checklists, quotes, code) with `/` for a menu of them
- `src/renderer/src/components/Inspector.jsx` — the inspector on the right of the canvas: the selected node's sections in tabs (an agent's Activity, Role and Settings; a note's Format; a terminal's Changes), the connections in Settings
- `src/renderer/src/components/CodeView.jsx` + `Explorer.jsx` + `src/renderer/src/buffers.js` + `monaco.js` — the code view, switched to from the side panel or with Ctrl+Shift+E: the workspace's files in tabs over a Monaco editor, the explorer on the right, Ctrl+P to open a file, and the open files kept in step with the disk (an agent's edit reloads a clean file, and asks what to keep when there are unsaved edits)
- `src/renderer/src/components/ReviewView.jsx` — the review, switched to from the side panel or with Ctrl+Shift+G: the agents' changes as tabs over a Monaco diff whose right side is the file itself, comments left on lines from the gutter, files marked as viewed, the comments sent to the agent in one message, and the work merged into its branch's base (or asked of the agent when it conflicts)
- `src/renderer/src/components/TopBar.jsx` — the bar over a workspace: what its agents have spent, the dictation and the side panel's switch; while the sidebar is hidden, also where you are, and while the panel is closed, the views
- `src/renderer/src/nodeStyle.js` — the options a note's and a terminal's look are picked from
- `src/renderer/src/components/Links.jsx` — links drawn as a rope pinned between two nodes, its belly on a spring
- `src/renderer/src/components/BrowserNode.jsx` — a web page on the canvas, in a webview, that can fill the room between the panels
- `src/renderer/src/components/Modal.jsx` + `DialogHost.jsx` + `src/renderer/src/dialogs.js` — the app's own modals: the review's commit and feedback, and every confirmation in place of the system's
- `src/renderer/src/tip.js` — a button's name and tooltip, with its shortcut beside the name (`aria-keyshortcuts`) rather than in it
- `src/renderer/src/components/Pet.jsx` — the desktop pet's page, and the pet's figure the HUD and the settings draw too
- `src/renderer/src/assets/main.css` — all the styles; the palette (graphite, dark first) and fonts are variables at the top
- `src/renderer/src/components/Shapes.jsx` + `StyleBar.jsx` + `src/renderer/src/shapes.js` + `whiteboard.js` — the whiteboard: shapes, lines, arrows, text and freehand strokes over the canvas, selected, moved, resized and turned, with their style and undo
- `src/renderer/src/components/VoiceBar.jsx` + `src/renderer/src/recorder.js` — the voice bar and the recording it sends to be transcribed
