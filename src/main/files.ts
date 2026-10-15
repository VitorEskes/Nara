import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'

// Writes to a temp file and renames it over the old one. The rename is atomic, so a crash
// mid-write leaves the previous file intact instead of a truncated one.
export function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, text)
  renameSync(`${file}.tmp`, file)
}

// The file's JSON, or null if it's missing or broken. What's in it is up to the caller to check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
