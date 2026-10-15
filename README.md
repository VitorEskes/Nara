<h1 align="center">
  <img src="resources/icon.png" alt="Nara" width="64" valign="middle" /> Nara
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-2f6f4f?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Linux%20%7C%20macOS%20%7C%20Windows-3f8462?style=flat-square" alt="Platforms: Linux, macOS and Windows" />
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat&logo=electron&logoColor=white" alt="Electron 39" />
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <strong>AI coding agents on an infinite canvas.</strong><br/>
  Run Claude Code, Codex, Gemini and any other CLI agent side by side — link them, give them roles,<br/>
  let them talk to each other, and review what they did, all in one place.
</p>

<!--
  Hero: drop a screenshot of a workspace at docs/assets/hero.png and uncomment.
<p align="center">
  <img src="docs/assets/hero.png" alt="A Nara workspace: agents, notes and a browser linked on the canvas" width="960" />
</p>
-->

## Features

<table>
<tr>
<td width="50%" valign="top">

### Infinite Canvas

Terminals, agents, Markdown notes and web pages live as nodes on a canvas you pan and zoom. Sketch around them with a whiteboard: shapes, arrows, text and freehand strokes.

</td>
<td width="50%" valign="top">

### Agents That Talk

Pull a rope between two nodes and they can reach each other. Agents send messages with `nara send`, share plans in linked notes, and read the browser you're both looking at.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Roles That Hold

Open an agent as an **Orchestrator**, **Worker**, **Reviewer** or **Planner**, or write your own. A role is more than a prompt: model, permission mode and read-only access become flags the agent itself enforces.

</td>
<td width="50%" valign="top">

### A Worktree Each

Start an agent in a git worktree of its own, on a new branch. Agents side by side never edit the same files — review each branch and merge it when it's ready.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Review, Built In

Every agent's changes, file by file, in a Monaco diff. Comment on lines, mark files as viewed, send the feedback back to the agent in one message, then commit and merge.

</td>
<td width="50%" valign="top">

### Code View

The workspace's files in tabs over a Monaco editor, with an explorer and `Ctrl+P` quick open. Open files stay in step with the disk as agents edit them.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Know What They Spend

The inspector shows each agent's tokens, context, estimated cost, task list and recent activity. The top bar tracks your Claude and Codex plans — the 5-hour window and the week.

</td>
<td width="50%" valign="top">

### A Pet on Your Desktop

Shika, a pixel-art deer, sits over every app and tells you when an agent needs you. Click it to answer yes, no or a line of text without switching windows. Codex pets work too.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Browsers on the Canvas

Open your dev server right next to the agent building it. Linked agents can load a page, read its text and take screenshots to check their own work.

</td>
<td width="50%" valign="top">

### Picks Up Where You Left

Projects group their workspaces, and every workspace is saved as you go. Claude Code agents resume their conversations after a restart.

</td>
</tr>
</table>

**Also in the box:**

- **Command center & HUD** — every agent across your workspaces, the most urgent first, in a floating window over every app (`Ctrl+Alt+Space`).
- **Notes as blocks** — Markdown edited as headings, lists, checklists, quotes and code, with `/` for a menu and images pasted in.
- **Terminal looks** — color schemes, tones, icons, text sizes and cursors for each terminal, with a live preview.
- **Overview** — every workspace as a card with a miniature of its canvas, grouped by project.
- **Light and dark** — a graphite palette, dark first, following the system or your choice.

---

## Supported Agents

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

Every agent starts knowing what Nara is, who it's linked to and the role it plays — whether it opens from the new terminal dialog or is typed in a plain terminal. How deep the integration goes depends on the agent:

|                                                        | Claude Code |   Codex   |         Others         |
| ------------------------------------------------------ | :---------: | :-------: | :--------------------: |
| Nara's context and its role                            |      ✓      |     ✓     | ✓ as its first message |
| Role enforced as flags (model, permissions, read-only) |      ✓      | read-only |           —            |
| Spend, context and activity in the inspector           |      ✓      |     ✓     |           —            |
| Answer its questions from the pet or the HUD           |      ✓      |     ✓     |           —            |
| Resumes its conversation after a restart               |      ✓      |     —     |           —            |

For a CLI that isn't on the list, start it with `nara run <cli>` inside any terminal.

---

## The `nara` Command

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

Replies arrive the same way: as a new message in the agent's terminal, so agents never sleep or poll.

---

## Install

Nara isn't packaged for download yet — build it from source. You'll need **Node.js 22+**, **git**, and the agent CLIs you want to use on your `PATH`.

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

---

## Keyboard Shortcuts

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

---

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

---

## License

Nara is free and open source under the [MIT License](LICENSE).
