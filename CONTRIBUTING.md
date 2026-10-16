# Contributing to Nara

Thanks for wanting to help. Bug reports, ideas and pull requests are all welcome; for anything
bigger than a fix, opening an issue first saves you from building something that won't fit.

## Running it

You need **Node.js 22** or newer and **git**. Installing also builds `node-pty` for your system.

```bash
git clone https://github.com/VitorEskes/Nara.git
cd Nara
npm install
npm run dev
```

| Script                | What it does                              |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | The app, with hot reload                  |
| `npm run typecheck`   | `tsc` over the main and renderer projects |
| `npm run lint`        | ESLint                                    |
| `npm run format`      | Prettier                                  |
| `npm run build`       | A production build in `out/`              |
| `npm run build:linux` | The AppImage and `.deb` in `dist/`        |
| `npm run build:mac`   | The `.dmg` for Apple silicon and Intel    |
| `npm run build:win`   | The NSIS installer                        |

## Pull requests

- `npm run typecheck` and `npm run lint` pass; CI runs both, plus a build.
- Run `npm run format` before committing.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`,
  `docs:`, `refactor:`…
- Keep a pull request to one change, and say in it how you tested it.

## How the code is laid out

Nara is an Electron app in TypeScript, built with [electron-vite](https://electron-vite.org). Each
node on the canvas is a real terminal: [`node-pty`](https://github.com/microsoft/node-pty) in the
main process and [`xterm.js`](https://xtermjs.org) in the window, talking over IPC. Inside every
terminal, a `nara` command talks to the app over a local socket.

Only the main process loads packages at runtime, so `dependencies` holds just what it needs
(`node-pty` and `@electron-toolkit/utils`). Everything the renderer uses is bundled by Vite and
lives in `devDependencies`, which keeps it out of the installers.

**Main process**: `src/main/`

| File                                 | What it does                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `index.ts`                           | Starts the app and registers everything below                                     |
| `pty.ts`                             | The terminals: creating them, starting agents, handing them their context         |
| `agents.ts`                          | The command line each agent opens with: prompt, role flags, Claude Code's session |
| `shell.ts`                           | The zsh and bash integration that routes typed agent CLIs through `nara run`      |
| `messages.ts`                        | The socket behind the `nara` command                                              |
| `cli.ts`, `resources/bin/nara`       | The `nara` command itself                                                         |
| `workspaces.ts`                      | Projects and workspaces, saved to the data folder                                 |
| `status.ts`                          | Who is working, waiting, done or failed                                           |
| `telemetry.ts`, `usage.ts`           | Tokens, cost, tasks and activity from the agents' sessions, and the plans' limits |
| `changes.ts`                         | Which terminal changed which files                                                |
| `git.ts`, `review.ts`                | Worktrees, diffs, the review queue, commits and merges                            |
| `code.ts`                            | The code view's files, confined to the workspace and its agents' worktrees        |
| `browser.ts`                         | Browser nodes and `nara browser`                                                  |
| `pet.ts`, `petProcess.ts`, `pets.ts` | The desktop pet, in a process of its own, and the pets it can be                  |
| `hud.ts`                             | The floating HUD                                                                  |

**Shared**: `src/shared/`

| File        | What it does                                                  |
| ----------- | ------------------------------------------------------------- |
| `agents.ts` | The agents Nara knows and how each gets its context           |
| `prompt.ts` | What an agent is told: its role, how Nara works, its worktree |
| `roles.ts`  | The built-in roles                                            |
| `types.ts`  | The types both processes share                                |

**Renderer**: `src/renderer/src/`

| File                                                     | What it does                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `App.tsx`                                                | Projects, workspaces and the app's state                     |
| `components/Workspace.tsx`                               | A workspace: the canvas, its nodes, links and views          |
| `components/Canvas.tsx`, `Links.tsx`, `Shapes.tsx`       | Panning and zooming, the ropes between nodes, the whiteboard |
| `components/Terminal.tsx`, `Note.tsx`, `BrowserNode.tsx` | The three kinds of node                                      |
| `components/Launcher.tsx`                                | The new terminal dialog                                      |
| `components/Inspector.tsx`                               | The side panel: activity, role, settings, changes            |
| `components/CodeView.tsx`, `Explorer.tsx`                | The code view                                                |
| `components/ReviewView.tsx`                              | The review                                                   |
| `components/Pet.tsx`, `Shika.tsx`, `CommandCenter.tsx`   | The pet, its command center and the HUD                      |
| `assets/main.css`                                        | Every style; the palette and fonts are variables at the top  |

## Releasing

1. Bump `version` in `package.json` and commit it.
2. Tag the commit and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

The [release workflow](.github/workflows/release.yml) builds the installers on macOS, Linux and
Windows, publishes them in a GitHub release with their checksums, and writes the Homebrew cask
(from `packaging/homebrew/nara.rb`) to the [`VitorEskes/homebrew-tap`](https://github.com/VitorEskes/homebrew-tap)
repository. That last step needs a `HOMEBREW_TAP_TOKEN` secret: a fine-grained token with
**Contents: read and write** on the tap repository. Without it the release still goes out, and the
cask can be written by hand with `scripts/update-cask.sh`.
