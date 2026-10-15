import { useEffect, useState } from 'react'

// How often the branch is read again: agents switch branches while they work.
const BRANCH_EVERY = 10000

// The git branch checked out in the folder, read again now and then and when the window comes back.
export function useBranch(folder: string | undefined): string | null {
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    const read = (): void => {
      window.api.folder.info(folder).then((info) => {
        if (current) setBranch(info?.branch ?? null)
      })
    }
    read()
    const timer = setInterval(read, BRANCH_EVERY)
    window.addEventListener('focus', read)
    return () => {
      current = false
      clearInterval(timer)
      window.removeEventListener('focus', read)
    }
  }, [folder])
  return branch
}
