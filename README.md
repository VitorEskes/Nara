<div align="center">

<img src="resources/icon.png" alt="Nara logo" width="120" />

# Nara

**The canvas for teams of coding agents.**

Run Claude Code, Codex, Antigravity and any CLI agent side by side.<br/>
Give each one a role, link the ones that should work together, and review every change, all in one desktop app.

<p>
  <img src="https://img.shields.io/badge/license-MIT-2f6f4f?style=flat-square" alt="License: MIT" />
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-3f8462?style=flat-square" alt="Platforms: Linux, macOS and Windows" />
  <img src="https://img.shields.io/badge/Electron-39-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 39" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript, strict" />
  <img src="https://img.shields.io/badge/local--first-no%20account-1f2a24?style=flat-square" alt="Local-first, no account" />
</p>

<p>
  <a href="#install"><strong>Install</strong></a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#supported-agents">Agents</a> &nbsp;·&nbsp;
  <a href="#the-nara-command">The <code>nara</code> command</a> &nbsp;·&nbsp;
  <a href="#contributing">Contributing</a>
</p>

<br/>

<img src="docs/assets/hero.jpg" alt="A Nara workspace: an orchestrator, two workers and a reviewer linked on the canvas, with the plan in a note, the app in a browser and its dev server" width="100%" />

<sub>A real session: four Claude Code agents shipping a release of a small app, coordinated on one canvas.</sub>

</div>

<br/>

## Features

<table>
  <tr>
    <td width="56%"><img src="docs/assets/agents.jpg" alt="The Lead agent linked to a Plan note whose checklist is ticked, and a worker reporting back with nara send" /></td>
    <td width="44%" valign="middle">
      <h3>An infinite canvas for agents</h3>
      <p>Terminals, agents, Markdown notes and web pages are nodes you arrange freely. Pull a rope between two of them and they're linked.</p>
      <ul>
        <li>Agents message each other with <code>nara send</code></li>
        <li>Plans and status live in shared notes, ticked as work lands</li>
        <li>A whiteboard for shapes, arrows and sketches around it all</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="44%" valign="middle">
      <h3>Roles, not just prompts</h3>
      <p>Every agent opens with a role that says who it is on the team, and Nara holds it there for the whole session.</p>
      <ul>
        <li>Orchestrator, Worker, Reviewer and Planner built in</li>
        <li>Write your own: instructions, model, permission mode, access and a first task</li>
        <li>Read-only roles lose their editing tools, not just a promise</li>
      </ul>
    </td>
    <td width="56%"><img src="docs/assets/roles.jpg" alt="The Role tab of the new terminal dialog, with the Reviewer role and its instructions" /></td>
  </tr>
  <tr>
    <td width="56%"><img src="docs/assets/launcher.jpg" alt="The new terminal dialog with Claude Code selected and the option to open it in its own worktree" /></td>
    <td width="44%" valign="middle">
      <h3>A worktree per agent</h3>
      <p>Open an agent in a checkout of its own, on a new branch. Agents running in parallel never edit the same files.</p>
      <ul>
        <li>One switch in the new terminal dialog</li>
        <li>Each agent is told its branch and to commit there</li>
        <li>Review and merge each branch from the app</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="44%" valign="middle">
      <h3>Review, built in</h3>
      <p>What every agent changed, file by file, in a Monaco diff, split or inline, against where its work began.</p>
      <ul>
        <li>Comment on lines and send the feedback in one message</li>
        <li>Mark files as viewed, commit, discard</li>
        <li>Merge into the base branch; conflicts are reported, not left behind</li>
      </ul>
    </td>
    <td width="56%"><img src="docs/assets/review.jpg" alt="The review view: a split diff of style.css on the dark mode branch, with its commit, files and a Merge button" /></td>
  </tr>
  <tr>
    <td width="56%"><img src="docs/assets/code.jpg" alt="The code view with app.js open in the editor and the explorer on the right" /></td>
    <td width="44%" valign="middle">
      <h3>A code view when you need it</h3>
      <p>Step in at any time: the workspace's files in tabs over a Monaco editor, with an explorer and quick open.</p>
      <ul>
        <li><code>Ctrl+P</code> to open any file</li>
        <li>Files reload as agents edit them</li>
        <li>Unsaved edits are never overwritten silently</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="44%" valign="middle">
      <h3>Know what they're doing</h3>
      <p>Select an agent to see its activity, its tasks and what it has spent, next to your Claude and Codex plan limits.</p>
      <ul>
        <li>Tokens, context and estimated cost per agent</li>
        <li>Every command, edit and message, as it happens</li>
        <li>5-hour and weekly usage in the top bar</li>
      </ul>
    </td>
    <td width="56%"><img src="docs/assets/inspector.jpg" alt="An agent selected: its spend in the sidebar and its recent activity in the inspector" /></td>
  </tr>
  <tr>
    <td width="56%" align="center"><img src="docs/assets/hud.jpg" alt="The HUD: the reviewer needs you, with Yes and No, and the other agents done" /></td>
    <td width="44%" valign="middle">
      <h3>Answer from anywhere</h3>
      <p>Shika, a pixel-art deer, lives on your desktop over every app and tells you when an agent needs you.</p>
      <ul>
        <li>The HUD lists every agent, the most urgent first</li>
        <li>Answer <strong>yes</strong>, <strong>no</strong> or a line of text in place</li>
        <li><code>Ctrl+Alt+Space</code> from any app; Codex pets work too</li>
      </ul>
    </td>
  </tr>
</table>

**Also included:** browser nodes your agents can load, read and screenshot · Markdown notes edited as blocks · projects, an overview of every workspace and sessions that survive a restart · light and dark themes, with a look for every terminal.

<br/>

## Supported agents

Works with **any CLI agent**: if it runs in a terminal, it runs in Nara.

<p>
  <a href="https://docs.anthropic.com/en/docs/claude-code"><kbd><img src="https://www.google.com/s2/favicons?domain=anthropic.com&sz=64" alt="" width="16" valign="middle" /> Claude Code</kbd></a> &nbsp;
  <a href="https://github.com/openai/codex"><kbd><img src="https://www.google.com/s2/favicons?domain=openai.com&sz=64" alt="" width="16" valign="middle" /> Codex</kbd></a> &nbsp;
  <a href="https://antigravity.google/docs/cli/install"><kbd><img src="https://www.google.com/s2/favicons?domain=antigravity.google&sz=64" alt="" width="16" valign="middle" /> Antigravity CLI</kbd></a> &nbsp;
  <a href="https://opencode.ai/docs/cli/"><kbd><img src="https://www.google.com/s2/favicons?domain=opencode.ai&sz=64" alt="" width="16" valign="middle" /> OpenCode</kbd></a> &nbsp;
  <a href="https://github.com/QwenLM/qwen-code"><kbd><img src="https://www.google.com/s2/favicons?domain=qwenlm.github.io&sz=64" alt="" width="16" valign="middle" /> Qwen Code</kbd></a> &nbsp;
  <a href="https://cursor.com/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=cursor.com&sz=64" alt="" width="16" valign="middle" /> Cursor Agent</kbd></a> &nbsp;
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=github.com&sz=64" alt="" width="16" valign="middle" /> Copilot CLI</kbd></a> &nbsp;
  <a href="https://aider.chat"><kbd><img src="https://www.google.com/s2/favicons?domain=aider.chat&sz=64" alt="" width="16" valign="middle" /> Aider</kbd></a> &nbsp;
  <a href="https://ampcode.com/manual#install"><kbd><img src="https://www.google.com/s2/favicons?domain=ampcode.com&sz=64" alt="" width="16" valign="middle" /> Amp</kbd></a> &nbsp;
  <kbd>+ any CLI agent</kbd>
</p>

Every agent starts knowing what Nara is, who it's linked to and the role it plays, and gets the role's first task. How each one takes it, and how much of the role it enforces on itself.

<br/>

## The `nara` command

Every terminal on the canvas has a `nara` command on its `PATH`, and every agent is taught to use it. It reaches only the nodes linked to its terminal.

| Command                             | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `nara peers`                        | The terminals, notes and browsers linked to this one, with their roles |
| `nara send <terminal> <text>`       | Send a message to a linked terminal, as if typed there                 |
| `nara note read <note>`             | Print a linked note                                                    |
| `nara note write <note> <text>`     | Replace the note's text                                                |
| `nara note append <note> <text>`    | Add a line to the end of the note                                      |
| `nara browser open <browser> <url>` | Load a page in a linked browser                                        |
| `nara browser read <browser>`       | Print the page's address, title and text                               |
| `nara browser shot <browser>`       | Save a screenshot of the page and print its path                       |
| `nara run <cli> [args]`             | Start any agent CLI with Nara's context and the terminal's role        |

Without `<text>`, `send`, `write` and `append` read it from stdin.

<br/>

## Privacy

Nara has no account, no server and no analytics. Workspaces, roles and settings are saved in its data folder: `~/.config/nara` on Linux, `~/Library/Application Support/nara` on macOS, `%APPDATA%\nara` on Windows. Spend and activity are read from the agents' own files on your machine. The only request that Nara makes on its own is related to its CLI.

<br/>

## Contributing

Issues and pull requests are welcome. To run Nara from source you need Node.js 22 or newer:

```bash
git clone https://github.com/VitorEskes/Nara.git
cd Nara
npm install
npm run dev
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the checks a pull request needs, how the code is laid out and how releases are made.

<br/>

---

<div align="center">

<img src="resources/icon.png" alt="" width="40" />

<sub>Nara is free and open source under the <a href="LICENSE">MIT License</a>.</sub>

</div>
