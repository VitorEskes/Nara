<p align="center">
  <img src="docs/assets/shika.png" alt="Shika, Nara's pixel-art deer" width="76" />
</p>

<h1 align="center">Nara</h1>

<p align="center">
  <strong>A canvas for a team of coding agents.</strong><br/>
  Put Claude Code, Codex and any CLI agent side by side, give each one a role,<br/>
  link the ones that should talk, and review what they did — in one window.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-2f6f4f?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Linux%20%7C%20macOS%20%7C%20Windows-3f8462?style=flat" alt="Platforms: Linux, macOS and Windows" />
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat&logo=electron&logoColor=white" alt="Electron 39" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <a href="#one-release-four-agents">The tour</a> ·
  <a href="#agents">Agents</a> ·
  <a href="#the-nara-command">The <code>nara</code> command</a> ·
  <a href="#install">Install</a> ·
  <a href="#developing">Developing</a>
</p>

<br/>

<p align="center">
  <img src="docs/assets/hero.jpg" alt="A Nara workspace: an orchestrator, two workers and a reviewer linked on the canvas, with the plan in a note, the app in a browser and its dev server" width="100%" />
</p>

<p align="center">
  <sub>Every screenshot here comes from one real session: four Claude Code agents shipping a small release of a focus timer.</sub>
</p>

<br/>

## One release, four agents

Most agent tools give you a list of chats. Nara gives you a room: every agent is a terminal on an infinite canvas, next to the notes, pages and other agents it works with. Here's how the release in the picture above went.

<br/>

### `01` &nbsp;Put the team together

Open an agent from the dock — Claude Code, Codex, Gemini or a plain terminal for any other CLI — and give it a **role**: an Orchestrator that splits the work, Workers that build, a Reviewer that only reads, a Planner that designs first, or one you write yourself. A role is more than a prompt: its model, permission mode and read-only access become flags the agent itself enforces. Agents that might step on each other get **a git worktree of their own**, on a new branch.

<table>
  <tr>
    <td width="50%"><img src="docs/assets/launcher.jpg" alt="The new terminal dialog with Claude Code selected and the option to open it in its own worktree" /></td>
    <td width="50%"><img src="docs/assets/roles.jpg" alt="The Role tab of the new terminal dialog, with the Reviewer role and its instructions" /></td>
  </tr>
</table>

<br/>

### `02` &nbsp;Let them talk it through

Pull a rope between two nodes and they can reach each other. The Lead kept the plan as a checklist in a linked note, sent each worker its task with `nara send`, and ticked items off as the reports came back — no copy and paste, no babysitting. Every agent knows how Nara works from the moment it starts.

<p align="center">
  <img src="docs/assets/agents.jpg" alt="The Lead agent linked to a Plan note whose checklist is ticked, and a worker reporting back with nara send" width="100%" />
</p>

<br/>

### `03` &nbsp;Review, then merge

Each agent's changes show up in the review, file by file, in a Monaco diff — here, the dark mode branch from its own worktree. Leave comments on lines and send them back to the agent in one message, mark files as viewed, and merge the branch when it's ready.

<p align="center">
  <img src="docs/assets/review.jpg" alt="The review view: a split diff of style.css on the dark mode branch, with its commit, files and a Merge button" width="100%" />
</p>

<br/>

### `04` &nbsp;Step in whenever you like

The code view puts the workspace's files in tabs over a Monaco editor, with an explorer and `Ctrl+P` to open anything. Files stay in step with the disk while the agents edit them.

<p align="center">
  <img src="docs/assets/code.jpg" alt="The code view with app.js open in the editor and the explorer on the right" width="100%" />
</p>

<br/>

### `05` &nbsp;Know what they're doing — from anywhere

Select an agent to see what it did, what it's working on and what it has spent: tokens, context and cost, next to your Claude and Codex plans. When one needs you, Shika — a pixel-art deer that lives on your desktop — says so, and the HUD lets you answer **yes**, **no** or a line of text without leaving the app you're in.

<p align="center">
  <img src="docs/assets/inspector.jpg" alt="An agent selected: its spend in the sidebar and its recent activity in the inspector" width="100%" />
</p>

<p align="center">
  <img src="docs/assets/hud.jpg" alt="The HUD: the reviewer needs you, with Yes and No, and the other agents done" width="440" />
</p>

<br/>

### Also on the canvas

- **Browsers** — open your dev server next to the agent building it. Linked agents can load the page, read it and take screenshots.
- **Notes** — Markdown edited as blocks: headings, checklists, code and pasted images, with `/` for a menu.
- **Whiteboard** — shapes, arrows, text and freehand strokes around your nodes.
- **Projects** — workspaces grouped by project, an overview of all of them, and sessions that pick up after a restart.
- **Looks** — light and dark themes, and a color scheme, tone and icon for every terminal.

<br/>

## Agents

Works with **any CLI agent** — if it runs in a terminal, it runs in Nara.

<p>
  <a href="https://docs.anthropic.com/en/docs/claude-code"><kbd><img src="https://www.google.com/s2/favicons?domain=anthropic.com&sz=64" alt="" width="16" valign="middle" /> Claude Code</kbd></a> &nbsp;
  <a href="https://github.com/openai/codex"><kbd><img src="https://www.google.com/s2/favicons?domain=openai.com&sz=64" alt="" width="16" valign="middle" /> Codex</kbd></a> &nbsp;
  <a href="https://github.com/google-gemini/gemini-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64" alt="" width="16" valign="middle" /> Gemini CLI</kbd></a> &nbsp;
  <a href="https://opencode.ai/docs/cli/"><kbd><img src="https://www.google.com/s2/favicons?domain=opencode.ai&sz=64" alt="" width="16" valign="middle" /> OpenCode</kbd></a> &nbsp;
  <a href="https://github.com/QwenLM/qwen-code"><kbd><img src="https://www.google.com/s2/favicons?domain=qwenlm.github.io&sz=64" alt="" width="16" valign="middle" /> Qwen Code</kbd></a> &nbsp;
  <a href="https://cursor.com/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=cursor.com&sz=64" alt="" width="16" valign="middle" /> Cursor Agent</kbd></a> &nbsp;
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=github.com&sz=64" alt="" width="16" valign="middle" /> Copilot CLI</kbd></a> &nbsp;
  <a href="https://aider.chat"><kbd><img src="https://www.google.com/s2/favicons?domain=aider.chat&sz=64" alt="" width="16" valign="middle" /> Aider</kbd></a> &nbsp;
  <a href="https://ampcode.com/manual#install"><kbd><img src="https://www.google.com/s2/favicons?domain=ampcode.com&sz=64" alt="" width="16" valign="middle" /> Amp</kbd></a> &nbsp;
  <kbd>+ any CLI agent</kbd>
</p>

Every agent starts knowing what Nara is, who it's linked to and the role it plays — whether it opens from the dialog or is typed in a plain terminal. How deep the rest goes depends on the agent:

|                                                        | Claude Code |   Codex   |         Others         |
| ------------------------------------------------------ | :---------: | :-------: | :--------------------: |
| Nara's context and its role                            |      ✓      |     ✓     | ✓ as its first message |
| Role enforced as flags (model, permissions, read-only) |      ✓      | read-only |           —            |
| Spend, context and activity in the inspector           |      ✓      |     ✓     |           —            |
| Answer its questions from the pet or the HUD           |      ✓      |     ✓     |           —            |
| Resumes its conversation after a restart               |      ✓      |     —     |           —            |

For a CLI that isn't on the list, start it with `nara run <cli>` in any terminal.

<br/>

## The `nara` command

Every terminal on the canvas has a `nara` command, and every agent is told how to use it. It's how agents reach the nodes linked to them:

```bash
nara peers                        # the terminals, notes and browsers linked to this one
nara send <terminal> <text>       # message a linked terminal, as if typed there
nara note read <note>             # print a linked note
nara note write <note> <text>     # replace the note's text
nara note append <note> <text>    # add a line to the note
nara browser open <browser> <url> # load a page in a linked browser
nara browser read <browser>       # its address, title and text
nara browser shot <browser>       # a screenshot of the page
nara run <cli> [args]             # start any agent CLI with Nara's context and the role
```

Replies arrive the same way, as a new message in the agent's terminal — so agents never sleep or poll while they wait.

<br/>

## Install

Nara isn't packaged for download yet — build it from source. You'll need **Node.js 22+**, **git**, and the agent CLIs you want on your `PATH`.

```bash
git clone git@github.com:VitorEskes/Nara.git
cd Nara
npm install      # also rebuilds node-pty for Electron
npm run dev      # start the app
```

To build an installer for your platform:

```bash
npm run build:linux   # AppImage and .deb
npm run build:mac     # .dmg
npm run build:win     # NSIS setup .exe
```

> [!NOTE]
> Typing an agent in a plain terminal goes through Nara with **zsh** and **bash**. Under Wayland, the desktop pet runs through XWayland so it can stay on top of every window.

<details>
<summary><strong>Keyboard shortcuts</strong></summary>

<br/>

| Shortcut         | Action                        |
| ---------------- | ----------------------------- |
| `Ctrl+Shift+N`   | New workspace                 |
| `Ctrl+Shift+O`   | Add a project                 |
| `Ctrl+Shift+W`   | All workspaces                |
| `Ctrl+Shift+E`   | Canvas ↔ code                 |
| `Ctrl+Shift+G`   | Canvas ↔ review               |
| `Ctrl+P`         | Open a file, in the code view |
| `Ctrl+Shift+B`   | Show or hide the sidebar      |
| `Ctrl+Shift+L`   | Light or dark                 |
| `Ctrl+,`         | Settings                      |
| `Ctrl+Alt+Space` | The HUD, from any app         |

</details>

<br/>

## Developing

Nara is an Electron app in TypeScript, built with [electron-vite](https://electron-vite.org). Each node on the canvas is a real terminal: [`node-pty`](https://github.com/microsoft/node-pty) in the main process, [`xterm.js`](https://xtermjs.org) in the renderer, talking over IPC.

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | The app with hot reload                   |
| `npm run typecheck` | `tsc` over the main and renderer projects |
| `npm run lint`      | ESLint                                    |
| `npm run format`    | Prettier                                  |
| `npm run build`     | A production build in `out/`              |

<details>
<summary><strong>How the code is laid out</strong></summary>

<br/>

**Main process** — `src/main/`

| File                                   | What it does                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pty.ts`                               | Creates and manages the terminals, starts agents and hands them their context                         |
| `agents.ts`                            | The command line each agent opens with: the prompt, the role's flags, Claude Code's session and hooks |
| `shell.ts`                             | The zsh and bash integration: an agent typed in a plain terminal starts through `nara run`            |
| `messages.ts`                          | The socket behind the `nara` command: messages, notes, browsers, `run`                                |
| `cli.ts` + `resources/bin/nara`        | The `nara` command itself                                                                             |
| `workspaces.ts`                        | Projects and workspaces, kept in memory and saved to the data folder                                  |
| `status.ts`                            | What each agent is doing — working, waiting, done, failed — from hooks and terminal output            |
| `telemetry.ts`                         | Tokens, context, cost, tasks and activity, read from Claude Code's transcripts and Codex's rollouts   |
| `usage.ts`                             | How much of the Claude and Codex plans is used                                                        |
| `git.ts` + `review.ts`                 | Worktrees, diffs, the review queue, commits and merges                                                |
| `code.ts`                              | The code view's files, confined to the workspace and its agents' worktrees                            |
| `browser.ts`                           | Browser nodes and `nara browser`                                                                      |
| `roles.ts`                             | The roles the user wrote                                                                              |
| `pet.ts` + `petProcess.ts` + `pets.ts` | The desktop pet, in a process of its own, and the pets it can be                                      |
| `hud.ts`                               | The floating HUD                                                                                      |

**Shared** — `src/shared/`

| File        | What it does                                                  |
| ----------- | ------------------------------------------------------------- |
| `agents.ts` | The agents Nara knows and how each gets its context           |
| `prompt.ts` | What an agent is told: its role, how Nara works, its worktree |
| `roles.ts`  | The built-in roles                                            |
| `types.ts`  | The types both processes share                                |

**Renderer** — `src/renderer/src/`

| File                                                     | What it does                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `App.tsx`                                                | Projects, workspaces and the app's state                     |
| `components/Workspace.tsx`                               | A workspace: the canvas, its nodes, links and views          |
| `components/Canvas.tsx`, `Links.tsx`, `Shapes.tsx`       | Panning and zooming, the ropes between nodes, the whiteboard |
| `components/Terminal.tsx`, `Note.tsx`, `BrowserNode.tsx` | The three kinds of node                                      |
| `components/Launcher.tsx`                                | The new terminal dialog                                      |
| `components/Inspector.tsx`                               | The side panel: activity, role, settings, changes            |
| `components/CodeView.tsx` + `Explorer.tsx`               | The code view                                                |
| `components/ReviewView.tsx`                              | The review                                                   |
| `components/Pet.tsx` + `Shika.tsx` + `CommandCenter.tsx` | The pet, its command center and the HUD                      |
| `assets/main.css`                                        | Every style; the palette and fonts are variables at the top  |

</details>

<br/>

---

<p align="center">
  <img src="docs/assets/shika.png" alt="" width="28" /><br/>
  <sub>Nara is free and open source under the <a href="LICENSE">MIT License</a>.</sub>
</p>
