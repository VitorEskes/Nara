import { useSyncExternalStore } from 'react'
import { monaco } from './monaco'

// The files open in the code view, one buffer per file however many workspaces have it open: a
// Monaco model, the version that was last saved and the file's mtime then. Agents edit the same
// files, so each buffer also keeps up with the disk:
// - the file changed and the buffer has no edits of the user's: it takes the new text;
// - it has some: the buffer is in 'conflict' and the editor asks what to keep;
// - the file is gone: the buffer is 'missing' until it's saved again.
// A save checks the file didn't change since it was read, and never writes over an agent's work
// without asking.
const buffers = new Map()
const listeners = new Set()
let version = 0

function emit() {
  version++
  for (const fn of listeners) fn()
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Re-renders when any buffer changes state: dirty, conflict, missing.
export function useBuffers() {
  return useSyncExternalStore(subscribe, () => version)
}

export function bufferOf(path) {
  return buffers.get(path)
}

export function isDirty(buffer) {
  return Boolean(buffer) && buffer.model.getAlternativeVersionId() !== buffer.saved
}

// Opens `path` for the workspace, reading it the first time. Returns the buffer or { error }.
// `owner` is who holds it open, the workspace's code view unless given (its review view holds
// its own): the buffer lives until every owner closes it.
export async function openBuffer(workspaceId, path, owner = workspaceId) {
  const open = buffers.get(path)
  if (open) {
    open.owners.set(owner, workspaceId)
    return open
  }
  const read = await window.api.code.read(workspaceId, path)
  if (read.error) return read
  // Two opens of the same file may have raced while reading.
  if (buffers.has(path)) return openBuffer(workspaceId, path, owner)
  const model = monaco.editor.createModel(read.text, undefined, monaco.Uri.file(path))
  const buffer = {
    path,
    model,
    mtime: read.mtime,
    saved: model.getAlternativeVersionId(),
    state: 'ok',
    disk: null,
    // owner -> the workspace it's in, which main checks every read and write against.
    owners: new Map([[owner, workspaceId]])
  }
  let wasDirty = false
  model.onDidChangeContent(() => {
    const dirty = isDirty(buffer)
    if (dirty !== wasDirty) {
      wasDirty = dirty
      emit()
    }
  })
  buffers.set(path, buffer)
  watchAll()
  emit()
  return buffer
}

export function closeBuffer(owner, path) {
  const buffer = buffers.get(path)
  if (!buffer) return
  buffer.owners.delete(owner)
  if (buffer.owners.size) return
  buffer.model.dispose()
  buffers.delete(path)
  watchAll()
  emit()
}

// Saves the buffer. Returns 'saved', 'conflict' (the file changed on disk: nothing written,
// unless `force`) or an error message.
export async function saveBuffer(workspaceId, path, { force = false } = {}) {
  const buffer = buffers.get(path)
  if (!buffer) return 'gone'
  const text = buffer.model.getValue()
  const at = buffer.model.getAlternativeVersionId()
  const mtime = force || buffer.state === 'missing' ? null : buffer.mtime
  const result = await window.api.code.write(workspaceId, path, text, mtime)
  if (result.conflict) {
    await takeDiskState(workspaceId, buffer)
    return 'conflict'
  }
  if (result.error) return result.error
  buffer.mtime = result.mtime
  buffer.saved = at
  buffer.state = 'ok'
  buffer.disk = null
  emit()
  return 'saved'
}

// Throws away the user's edits for what's on disk.
export async function reloadBuffer(workspaceId, path) {
  const buffer = buffers.get(path)
  if (!buffer) return
  const read = await window.api.code.read(workspaceId, path)
  if (read.error) return
  replaceText(buffer, read.text)
  buffer.mtime = read.mtime
  buffer.saved = buffer.model.getAlternativeVersionId()
  buffer.state = 'ok'
  buffer.disk = null
  emit()
}

// Keeps the user's edits: the next save writes them over what's on disk.
export function keepMine(path) {
  const buffer = buffers.get(path)
  if (!buffer?.disk) return
  buffer.mtime = buffer.disk.mtime
  buffer.state = 'ok'
  buffer.disk = null
  emit()
}

// The file was renamed or moved in the explorer: the buffer follows it to its new path, edits and
// undo included.
export function moveBuffer(from, to) {
  const buffer = buffers.get(from)
  if (!buffer) return
  const model = monaco.editor.createModel(buffer.model.getValue(), undefined, monaco.Uri.file(to))
  const moved = { ...buffer, path: to, model, saved: model.getAlternativeVersionId() }
  // Unsaved edits stay unsaved.
  if (isDirty(buffer)) moved.saved = -1
  let wasDirty = isDirty(moved)
  model.onDidChangeContent(() => {
    const dirty = isDirty(moved)
    if (dirty !== wasDirty) {
      wasDirty = dirty
      emit()
    }
  })
  buffer.model.dispose()
  buffers.delete(from)
  buffers.set(to, moved)
  watchAll()
  emit()
}

// Main says the file changed on disk.
async function diskChanged(path) {
  const buffer = buffers.get(path)
  if (!buffer) return
  await takeDiskState([...buffer.owners.values()][0], buffer)
}

async function takeDiskState(workspaceId, buffer) {
  const read = await window.api.code.read(workspaceId, buffer.path)
  if (read.error === 'missing') {
    buffer.state = 'missing'
    emit()
    return
  }
  if (read.error) return
  if (read.text === buffer.model.getValue()) {
    // Our own save, or the disk caught up with the buffer: nothing left unsaved.
    buffer.mtime = read.mtime
    buffer.saved = buffer.model.getAlternativeVersionId()
    buffer.state = 'ok'
    buffer.disk = null
    emit()
    return
  }
  if (!isDirty(buffer)) {
    replaceText(buffer, read.text)
    buffer.mtime = read.mtime
    buffer.saved = buffer.model.getAlternativeVersionId()
    buffer.state = 'ok'
    buffer.disk = null
    emit()
    return
  }
  buffer.state = 'conflict'
  buffer.disk = read
  emit()
}

// As an edit, so Ctrl+Z can bring back what was there before.
function replaceText(buffer, text) {
  const { model } = buffer
  model.pushStackElement()
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null)
  model.pushStackElement()
}

function watchAll() {
  window.api.code.watch([...buffers.keys()])
}

window.api.code.onChanged(diskChanged)
