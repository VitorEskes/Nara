import { BrowserWindow, app, globalShortcut, ipcMain, screen, utilityProcess } from 'electron'
import { execFile } from 'child_process'
import { rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { readJson, writeAtomic } from './files'

// The voice bar: a small window over every app, summoned with a global shortcut, that records
// what the user says, turns it into text and sends it to an agent. It loads the renderer with
// #voice (VoiceBar.jsx), like the HUD does with #hud.
//
// The audio arrives here as a 16 kHz WAV and becomes text on this computer, never leaving it:
// with Whisper built in (whisper.js, in a utility process, the model downloaded once), or with
// whisper.cpp if the user has it. The settings live in voice.json.
export const VOICE_SHORTCUT = 'CommandOrControl+Alt+V'
const SIZE = { width: 600, height: 248 }
const MARGIN = 72

const DEFAULTS = {
  engine: 'builtin',
  model: 'base',
  // The system's language: Whisper can't tell it by itself here.
  language: '',
  whisperBin: 'whisper-cli',
  whisperModel: ''
}

export function registerVoice(main) {
  let bar = null
  let enabled = false
  let settings = load()
  let worker = null
  let nextJob = 1
  const jobs = new Map()

  // The built-in engine, started the first time it's needed and kept for the next ones.
  function whisper() {
    if (worker) return worker
    worker = utilityProcess.fork(join(__dirname, 'whisper.js'), [], { serviceName: 'Nara voice' })
    worker.on('message', (message) => {
      if (message.progress != null) {
        bar?.webContents.send('voice:progress', message.progress)
        return
      }
      const job = jobs.get(message.id)
      if (!job) return
      jobs.delete(message.id)
      if (message.error) job.reject(new Error(message.error))
      else job.resolve(message.text)
    })
    worker.on('exit', () => {
      worker = null
      for (const job of jobs.values()) job.reject(new Error('The voice engine stopped'))
      jobs.clear()
    })
    return worker
  }

  function builtin(audio) {
    return new Promise((resolve, reject) => {
      const id = nextJob++
      jobs.set(id, { resolve, reject })
      whisper().postMessage({
        id,
        audio: pcm(audio),
        model: settings.model,
        language: settings.language || systemLanguage(),
        cacheDir: join(app.getPath('userData'), 'models')
      })
    })
  }
  // An opening the bar's page wasn't ready for yet: it takes it once it is (voice:take).
  let pending = null
  let ready = false

  function create() {
    bar = new BrowserWindow({
      ...SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    bar.setAlwaysOnTop(true, 'floating')
    bar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    bar.on('closed', () => {
      bar = null
      ready = false
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      bar.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#voice`)
    } else {
      bar.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'voice' })
    }
  }

  // Opens near the top of the screen the pointer is on, centered, and starts listening. `target`
  // is the agent to send to first, when the bar was opened from one.
  function show(target = null) {
    if (!bar) create()
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    bar.setPosition(
      Math.round(workArea.x + (workArea.width - SIZE.width) / 2),
      Math.round(workArea.y + MARGIN)
    )
    bar.show()
    bar.focus()
    if (ready) bar.webContents.send('voice:opened', target)
    else pending = { target }
  }

  function toggle() {
    if (bar?.isVisible()) bar.hide()
    else show()
  }

  ipcMain.handle('voice:enable', (_ev, on) => {
    if (on && !enabled) enabled = globalShortcut.register(VOICE_SHORTCUT, toggle)
    else if (!on && enabled) {
      globalShortcut.unregister(VOICE_SHORTCUT)
      enabled = false
    }
    return enabled
  })
  ipcMain.on('voice:open', (_ev, target) => show(target))
  ipcMain.on('voice:hide', () => bar?.hide())
  // The page is listening: it gets the opening it missed, if any.
  ipcMain.handle('voice:take', () => {
    ready = true
    const opening = pending
    pending = null
    return opening
  })

  ipcMain.handle('voice:settings', () => ({ ...settings, systemLanguage: systemLanguage() }))
  ipcMain.handle('voice:save', (_ev, patch = {}) => {
    const next = { ...settings }
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof patch[key] === 'string') next[key] = patch[key].trim()
    }
    settings = next
    save(settings)
    return { ...settings, systemLanguage: systemLanguage() }
  })

  ipcMain.handle('voice:transcribe', async (_ev, wav) => {
    try {
      const audio = Buffer.from(wav)
      const text =
        settings.engine === 'whispercpp' ? await whisperCpp(audio, settings) : await builtin(audio)
      return { text: text.trim() }
    } catch (error) {
      return { error: error.message }
    }
  })

  main.on('closed', () => {
    if (enabled) globalShortcut.unregister(VOICE_SHORTCUT)
    enabled = false
    bar?.destroy()
    worker?.kill()
    for (const name of ['voice:open', 'voice:hide']) ipcMain.removeAllListeners(name)
    for (const name of [
      'voice:enable',
      'voice:take',
      'voice:settings',
      'voice:save',
      'voice:transcribe'
    ]) {
      ipcMain.removeHandler(name)
    }
  })
}

// whisper.cpp's command line, with the model the user downloaded. -nt drops the timestamps and -np
// everything but the text.
function whisperCpp(audio, { whisperBin, whisperModel, language }) {
  if (!whisperModel)
    return Promise.reject(new Error('Pick a whisper.cpp model in Settings › Voice'))
  const file = join(tmpdir(), `nara-voice-${process.pid}-${Date.now()}.wav`)
  writeFileSync(file, audio)
  return new Promise((resolve, reject) => {
    execFile(
      whisperBin || DEFAULTS.whisperBin,
      ['-m', whisperModel, '-f', file, '-nt', '-np', '-l', language || systemLanguage()],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        rmSync(file, { force: true })
        if (error) {
          const missing = error.code === 'ENOENT'
          reject(
            new Error(
              missing
                ? `Couldn't find ${whisperBin}: install whisper.cpp or set its path in Settings › Voice`
                : String(stderr || error.message)
                    .trim()
                    .split('\n')
                    .pop()
            )
          )
        } else resolve(stdout.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' '))
      }
    )
  })
}

// The WAV's samples as floats: 16-bit PCM after a 44-byte header (recorder.js writes it so).
function pcm(wav) {
  const samples = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1)
  return Float32Array.from(samples, (s) => s / 32768)
}

// The system's language as Whisper takes it: "pt" from "pt-BR".
function systemLanguage() {
  return (app.getLocale() || 'en').split('-')[0].toLowerCase()
}

function load() {
  const saved = readJson(settingsPath()) ?? {}
  // Settings from when the voice bar could use a transcription API: that engine is gone.
  const engine = saved.engine ?? (saved.provider === 'local' ? 'whispercpp' : 'builtin')
  const model = ['tiny', 'base', 'small'].includes(saved.model) ? saved.model : DEFAULTS.model
  return {
    ...DEFAULTS,
    language: saved.language ?? '',
    whisperBin: saved.whisperBin ?? DEFAULTS.whisperBin,
    whisperModel: saved.whisperModel ?? '',
    engine,
    model
  }
}

function save(settings) {
  try {
    writeAtomic(settingsPath(), JSON.stringify(settings, null, 2))
  } catch (error) {
    console.error(`nara: could not save the voice settings: ${error.message}`)
  }
}

function settingsPath() {
  return join(app.getPath('userData'), 'voice.json')
}
