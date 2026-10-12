import { BrowserWindow, app, globalShortcut, ipcMain, safeStorage, screen } from 'electron'
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
// The audio arrives here as a 16 kHz WAV and goes to one of two engines, picked in the settings:
// an OpenAI-style transcription API (OpenAI, Groq and most others speak it), or whisper.cpp on
// this computer, for audio that never leaves it. The settings live in voice.json; the API key is
// encrypted with the system's keyring when it has one.
export const VOICE_SHORTCUT = 'CommandOrControl+Alt+V'
const SIZE = { width: 600, height: 248 }
const MARGIN = 72

const DEFAULTS = {
  provider: 'api',
  baseUrl: 'https://api.openai.com/v1',
  model: 'whisper-1',
  language: '',
  whisperBin: 'whisper-cli',
  whisperModel: ''
}

export function registerVoice(main) {
  let bar = null
  let enabled = false
  let settings = load()
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

  // The settings without the key itself: only whether there is one.
  ipcMain.handle('voice:settings', () => publicSettings(settings))
  ipcMain.handle('voice:save', (_ev, patch = {}) => {
    const next = { ...settings }
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof patch[key] === 'string') next[key] = patch[key].trim()
    }
    if (typeof patch.key === 'string') next.key = seal(patch.key.trim())
    settings = next
    save(settings)
    return publicSettings(settings)
  })

  ipcMain.handle('voice:transcribe', async (_ev, wav) => {
    try {
      const audio = Buffer.from(wav)
      const text =
        settings.provider === 'local'
          ? await whisperCpp(audio, settings)
          : await transcriptionApi(audio, settings)
      return { text: text.trim() }
    } catch (error) {
      return { error: error.message }
    }
  })

  main.on('closed', () => {
    if (enabled) globalShortcut.unregister(VOICE_SHORTCUT)
    enabled = false
    bar?.destroy()
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

// POST /audio/transcriptions, the shape OpenAI made and most others follow.
async function transcriptionApi(audio, { baseUrl, model, language, key }) {
  const secret = unseal(key)
  if (!secret) throw new Error('Add an API key in Settings › Voice')
  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'speech.wav')
  form.append('model', model || DEFAULTS.model)
  if (language) form.append('language', language)
  const response = await fetch(
    `${(baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, '')}/audio/transcriptions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      body: form,
      signal: AbortSignal.timeout(60000)
    }
  )
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240)
    throw new Error(`The transcription service answered ${response.status}: ${detail}`)
  }
  const { text = '' } = await response.json()
  return text
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
      ['-m', whisperModel, '-f', file, '-nt', '-np', '-l', language || 'auto'],
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

function publicSettings({ key, ...rest }) {
  return { ...DEFAULTS, ...rest, hasKey: Boolean(unseal(key)) }
}

// The key, encrypted when the system can: { sealed } or, without a keyring, { plain }.
function seal(text) {
  if (!text) return null
  if (safeStorage.isEncryptionAvailable()) {
    return { sealed: safeStorage.encryptString(text).toString('base64') }
  }
  return { plain: text }
}

function unseal(key) {
  if (!key) return ''
  try {
    if (key.sealed) return safeStorage.decryptString(Buffer.from(key.sealed, 'base64'))
    return key.plain ?? ''
  } catch {
    return ''
  }
}

function load() {
  return { ...DEFAULTS, ...readJson(settingsPath()) }
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
