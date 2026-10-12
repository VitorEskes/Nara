import { BrowserWindow, app, ipcMain } from 'electron'
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { readJson, writeAtomic } from './files'

// How much of their plan's limits the agents have used: the share of the 5-hour window and of
// the week, and when each resets. Claude Code hands its own to the status line command, which
// Nara sets for the agents it opens (`nara statusline`, see agents.js); Codex writes its own into
// its rollouts. The latest of each is kept in usage.json, so the top bar has them from the start;
// a window whose reset has passed is dropped.
//
// A provider's report is { fiveHour: { used, resetsAt }, sevenDay: { used, resetsAt }, updated },
// `used` from 0 to 100 and times in ms.
const CODEX_EVERY = 60000

let limits = {}

export function registerUsage(main) {
  limits = readJson(usagePath()) ?? {}
  ipcMain.handle('usage:get', () => current())
  readCodex()
  const timer = setInterval(readCodex, CODEX_EVERY)
  main.on('closed', () => {
    clearInterval(timer)
    ipcMain.removeHandler('usage:get')
  })
}

// From Claude Code's status line input: rate_limits.five_hour / seven_day, with used_percentage
// and resets_at in epoch seconds.
export function reportClaude(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') return
  const window = (w) =>
    w && Number.isFinite(w.used_percentage)
      ? { used: w.used_percentage, resetsAt: (w.resets_at ?? 0) * 1000 }
      : null
  update('claude', {
    fiveHour: window(rateLimits.five_hour),
    sevenDay: window(rateLimits.seven_day)
  })
}

// From a Codex rollout's token_count event: rate_limits.primary (the 5-hour window) and
// secondary (the week), with used_percent and either resets_at or resets_in_seconds.
export function reportCodex(rateLimits, at = Date.now()) {
  if (!rateLimits || typeof rateLimits !== 'object') return
  const window = (w) => {
    if (!w || !Number.isFinite(w.used_percent)) return null
    const resetsAt = Number.isFinite(w.resets_at)
      ? w.resets_at * 1000
      : Number.isFinite(w.resets_in_seconds)
        ? at + w.resets_in_seconds * 1000
        : 0
    return { used: w.used_percent, resetsAt, minutes: w.window_minutes }
  }
  update('codex', { fiveHour: window(rateLimits.primary), sevenDay: window(rateLimits.secondary) })
}

function update(provider, { fiveHour, sevenDay }) {
  if (!fiveHour && !sevenDay) return
  const previous = limits[provider]
  const next = {
    fiveHour: fiveHour ?? previous?.fiveHour ?? null,
    sevenDay: sevenDay ?? previous?.sevenDay ?? null
  }
  // The status line runs after every message: only a change is saved and sent.
  const same =
    JSON.stringify(next) ===
    JSON.stringify({ fiveHour: previous?.fiveHour ?? null, sevenDay: previous?.sevenDay ?? null })
  limits[provider] = { ...next, updated: Date.now() }
  if (same) return
  try {
    writeAtomic(usagePath(), JSON.stringify(limits, null, 2))
  } catch (error) {
    console.error(`nara: could not save the usage: ${error.message}`)
  }
  for (const other of BrowserWindow.getAllWindows()) {
    if (!other.isDestroyed()) other.webContents.send('usage:update', current())
  }
}

// The limits still in force: a window past its reset is over, and its share starts again at 0.
function current() {
  const now = Date.now()
  const live = (w) => (w && (!w.resetsAt || w.resetsAt > now) ? w : null)
  return Object.fromEntries(
    Object.entries(limits).map(([provider, report]) => [
      provider,
      { ...report, fiveHour: live(report.fiveHour), sevenDay: live(report.sevenDay) }
    ])
  )
}

// Codex's latest limits, from the end of its newest rollout, whether or not Nara opened it.
function readCodex() {
  try {
    const root = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
    const file = newest(root, 3)
    if (!file) return
    const { size, mtimeMs } = statSync(file)
    const length = Math.min(size, 256 * 1024)
    const buffer = Buffer.alloc(length)
    const fd = openSync(file, 'r')
    readSync(fd, buffer, 0, length, size - length)
    closeSync(fd)
    const lines = buffer.toString('utf8').split('\n').reverse()
    for (const line of lines) {
      if (!line.includes('rate_limits')) continue
      try {
        const entry = JSON.parse(line)
        const payload = entry.payload ?? entry
        const at = Date.parse(entry.timestamp) || mtimeMs
        if (payload.rate_limits) return reportCodex(payload.rate_limits, at)
      } catch {
        // A cut line at the start of the read.
      }
    }
  } catch {
    // No Codex here.
  }
}

// The newest file down a tree of YYYY/MM/DD folders, `depth` levels deep.
function newest(dir, depth) {
  if (!existsSync(dir)) return null
  const entries = readdirSync(dir).sort().reverse()
  if (depth === 0) {
    const files = entries.filter((name) => name.endsWith('.jsonl'))
    let best = null
    for (const name of files) {
      const time = statSync(join(dir, name)).mtimeMs
      if (!best || time > best.time) best = { file: join(dir, name), time }
    }
    return best?.file ?? null
  }
  for (const name of entries) {
    const found = newest(join(dir, name), depth - 1)
    if (found) return found
  }
  return null
}

function usagePath() {
  return join(app.getPath('userData'), 'usage.json')
}
