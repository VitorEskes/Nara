// Speech to text on this computer, for the voice bar: Whisper, run by transformers.js on ONNX
// Runtime, in a utility process of its own so a transcription never holds up the app (voice.js
// starts it). No account, no key, no audio leaving the machine: the model is downloaded once, from
// Hugging Face, into Nara's data folder.
//
// Messages in: { id, audio (Float32Array, 16 kHz mono), model, language, cacheDir }.
// Messages out: { id, text } or { id, error }, and { progress: 0..1 } while a model downloads.
const MODELS: Record<string, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small'
}

type Transformers = typeof import('@huggingface/transformers')
type Pipe = (audio: Float32Array, options: object) => Promise<{ text?: string }>

let transformers: Transformers | null = null
// The model in memory, and its name.
let loaded: { name: string | null; pipe: Pipe | null } = { name: null, pipe: null }

process.parentPort.on('message', async ({ data }) => {
  const { id, audio, model = 'base', language, cacheDir } = data
  try {
    const pipe = await load(model, cacheDir)
    const result = await pipe(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      // Whisper can't tell the language by itself here: without one it takes English.
      ...(language && { language })
    })
    process.parentPort.postMessage({ id, text: (result.text ?? '').trim() })
  } catch (error) {
    process.parentPort.postMessage({ id, error: (error as Error).message })
  }
})

async function load(model: string, cacheDir: string): Promise<Pipe> {
  const name = MODELS[model] ?? MODELS.base
  if (loaded.name === name && loaded.pipe) return loaded.pipe
  transformers ??= await import('@huggingface/transformers')
  transformers.env.cacheDir = cacheDir
  transformers.env.allowLocalModels = false
  // Every file's bytes so far, summed, for one figure across the model's files.
  const files = new Map<string, { loaded: number; total: number }>()
  const pipe = (await transformers.pipeline('automatic-speech-recognition', name, {
    dtype: 'q8',
    progress_callback: (event) => {
      if (event.status !== 'progress' || !event.total) return
      files.set(event.file, { loaded: event.loaded, total: event.total })
      const all = [...files.values()]
      const total = all.reduce((sum, f) => sum + f.total, 0)
      const done = all.reduce((sum, f) => sum + f.loaded, 0)
      process.parentPort.postMessage({ progress: total ? done / total : 0 })
    }
  })) as unknown as Pipe
  loaded = { name, pipe }
  return pipe
}
