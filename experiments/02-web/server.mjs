import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';

const aqui = path.dirname(fileURLToPath(import.meta.url));

const raiz = path.resolve(aqui, '../..');

const tipos = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' };

const estaticos = {
  '/': path.join(aqui, 'public/index.html'),
  '/xterm.css': path.join(raiz, 'node_modules/@xterm/xterm/css/xterm.css'),
  '/xterm.mjs': path.join(raiz, 'node_modules/@xterm/xterm/lib/xterm.mjs'),
  '/addon-fit.mjs': path.join(raiz, 'node_modules/@xterm/addon-fit/lib/addon-fit.mjs'),
};


const servidor = http.createServer((req, res) => {
    const rota = new URL(req.url, 'http://localhost').pathname;
    const arquivo = estaticos[rota];

    if(!arquivo) return res.writeHead(404).end('Arquivo não encontrado');

    res.writeHead(200, { 'Content-Type': tipos[path.extname(arquivo)] + '; charset=utf-8' });
    fs.createReadStream(arquivo).pipe(res);
})

const wss = new WebSocketServer({ server: servidor });

wss.on('connection', (ws, req) => {
  const cmd = new URL(req.url, 'http://localhost').searchParams.get('cmd') || 'bash';
  const [prog, ...args] = cmd.split(' ');

  const term = pty.spawn(prog, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env,
    });
    
    term.onData((dados) => ws.send(dados));
    ws.on('message', (dados, ehBinario) => {
    if (ehBinario) return term.write(dados.toString('utf8'));

    const msg = JSON.parse(dados.toString());
    if (msg.t === 'resize') term.resize(msg.cols, msg.rows);
    });      
    ws.on('close', () => term.kill());
});

servidor.listen(7070, () => console.log('Servidor rodando em http://localhost:7070'));