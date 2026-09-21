import * as pty from 'node-pty';


const [cmd = 'bash', ...args] = process.argv.slice(2);

const term = pty.spawn(cmd, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
})

term.onData((dados) => process.stdout.write(dados));
term.onExit(({ exitCode}) => {
    process.stdin.setRawMode(false);
    console.log(`\n[fim] code=${exitCode}`);
    process.exit(exitCode);
})

process.stdout.on('resize', () => term.resize(process.stdout.columns, process.stdout.rows));

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (buf) => {
    if (buf.length === 1 && buf[0] === 0x11) return encerrar();
    term.write(buf.toString('utf8'));
})

function encerrar() {
    process.stdin.setRawMode(false);
    term.kill();
    process.exit(0);
}