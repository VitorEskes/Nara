# anbu

Roda agentes de IA de programação (Claude Code, Codex) com canvas infinito
como interface.

App desktop em Electron + React: cada nó do canvas é um terminal de verdade
(`node-pty` no processo main, `xterm.js` no renderer, ligados por IPC).

## Rodando

```bash
npm install   # o postinstall recompila o node-pty para o ABI do Electron
npm run dev
```

## Estrutura

- `src/main/pty.js` — cria e gerencia os PTYs (`pty:criar`, `pty:escrever`, `pty:redimensionar`, `pty:matar`)
- `src/preload/index.js` — expõe `window.api.pty` para o renderer
- `src/renderer/src/components/Terminal.jsx` — um terminal xterm.js ligado a um PTY
