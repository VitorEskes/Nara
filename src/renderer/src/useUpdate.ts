import { useEffect, useState } from 'react'
import type { UpdateState } from '../../shared/types'

// Where the app's own update is (main/updates.ts), kept current.
export function useUpdate(): UpdateState | null {
  const [update, setUpdate] = useState<UpdateState | null>(null)
  useEffect(() => {
    let live = true
    window.api.update.get().then((state) => live && setUpdate(state))
    const off = window.api.update.onState(setUpdate)
    return () => {
      live = false
      off()
    }
  }, [])
  return update
}
