import { useEffect, useState } from 'react'
import Workspace from './components/Workspace'

export default function App() {
  const [workspace, setWorkspace] = useState(null)

  useEffect(() => {
    window.api.workspace.load().then(setWorkspace)
  }, [])

  // Nothing is drawn until the saved workspace arrives, so no terminal starts before its
  // position and directory are known.
  if (!workspace) return null

  const { id, ...saved } = workspace
  return <Workspace key={id} workspaceId={id} saved={saved} />
}
