import { rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Where a local server listens: a socket file in the temp folder, or a named pipe on Windows,
// where Node can't listen on a file path. The pid in the name keeps two running instances apart.
export function socketPath(name: string): string {
  const file = `${name}-${process.pid}`
  return process.platform === 'win32' ? `\\\\.\\pipe\\${file}` : join(tmpdir(), `${file}.sock`)
}

// A socket file left behind by a run that died without cleaning up would make listen fail. A
// named pipe goes away with its server.
export function clearSocket(path: string): void {
  if (process.platform !== 'win32') rmSync(path, { force: true })
}
