import { app } from 'electron'
import { join } from 'path'

// The app keeps its data in <appData>/nara. The folder is set by hand because Electron would name
// it after productName once packaged ("Nara") and after package.json's name in dev ("nara").
// Must run before the app is ready: Electron only takes a new userData path until then.
export function setUpDataFolder(): void {
  app.setPath('userData', join(app.getPath('appData'), 'nara'))
}
