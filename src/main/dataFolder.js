import { app } from 'electron'
import { cpSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// The app keeps its data in <appData>/nara. The folder is set by hand because Electron would name
// it after productName once packaged ("Nara") and after package.json's name in dev ("nara").
//
// The app used to be called anbu. On the first run as Nara, the workspaces, projects and session
// saved under the old name are copied over; the old folder is left as it was, as a backup.
const OLD_NAMES = ['anbu']
const FILES = ['workspaces', 'projects.json', 'state.json']

// Must run before the app is ready: Electron only takes a new userData path until then.
export function setUpDataFolder() {
  const appData = app.getPath('appData')
  const folder = join(appData, 'nara')
  app.setPath('userData', folder)

  const hasData = (dir) => FILES.some((file) => existsSync(join(dir, file)))
  if (hasData(folder)) return
  const old = OLD_NAMES.map((name) => join(appData, name)).find(hasData)
  if (!old) return

  mkdirSync(folder, { recursive: true })
  for (const file of FILES) {
    const from = join(old, file)
    if (existsSync(from)) cpSync(from, join(folder, file), { recursive: true })
  }
  console.log(`nara: copied the data saved as ${old} to ${folder}`)
}
