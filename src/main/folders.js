import { dialog } from 'electron'
import { homedir } from 'os'

// Where the folder picker opens when there's no better default: the last folder picked.
let lastFolder = homedir()

export async function pickFolder(win, { title, defaultPath = lastFolder }) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title,
    defaultPath,
    buttonLabel: 'Open here',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths[0]) return null
  lastFolder = filePaths[0]
  return lastFolder
}
