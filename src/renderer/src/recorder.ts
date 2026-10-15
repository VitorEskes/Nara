// Recording the user's voice for the voice bar: the microphone through a MediaRecorder, with the
// level read as it goes for the meter, and the result as a 16 kHz mono WAV, the format every
// transcription engine takes (whisper.cpp only takes that).
const RATE = 16000

// Starts listening. onLevel(0..1) is called every frame with how loud it is. Returns { stop,
// cancel }: stop() resolves to the WAV as an ArrayBuffer, cancel() throws it away.
export interface Recording {
  stop: () => Promise<ArrayBuffer>
  cancel: () => void
}

export async function record(onLevel: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  })
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  let frame = requestAnimationFrame(function measure() {
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const s of samples) sum += s * s
    // RMS, eased up so speech fills the meter.
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 6))
    frame = requestAnimationFrame(measure)
  })

  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise((resolve) => (recorder.onstop = resolve))
  recorder.start()

  function release(): void {
    cancelAnimationFrame(frame)
    for (const track of stream.getTracks()) track.stop()
  }

  return {
    async stop() {
      recorder.stop()
      await stopped
      release()
      const encoded = await new Blob(chunks).arrayBuffer()
      const audio = await context.decodeAudioData(encoded)
      context.close()
      return wav(await resample(audio))
    },
    cancel() {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
      context.close()
    }
  }
}

async function resample(audio: AudioBuffer): Promise<Float32Array> {
  const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * RATE), RATE)
  const source = offline.createBufferSource()
  source.buffer = audio
  source.connect(offline.destination)
  source.start()
  return (await offline.startRendering()).getChannelData(0)
}

// 16-bit PCM in a WAV container.
function wav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, s: string): void => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}
