/**
 * Turns a recorded question into text with Moonshine (asr.worker.ts). Light for use while the game
 * runs: nothing loads until the first spoken question (the 28 MB model is a content pack on
 * desktop), a question takes a fraction of a second on one CPU core, and the worker is ended 3
 * minutes after the last question to free its memory.
 */
import { isDesktop } from '../desktop/useDesktop'
import AsrWorker from './asr.worker?worker'

const UNLOAD_AFTER_MS = 3 * 60_000
/** Shorter than this is a cough or a click, not a question. */
const MIN_SECONDS = 0.3

type Reply = { type: 'ready' } | { type: 'text'; id: number; text: string } | { type: 'error'; id?: number; message: string }

let worker: Worker | null = null
let ready: Promise<void> | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>()
let unloadTimer: number | undefined

const appFile = (rel: string) => new URL(`${import.meta.env.BASE_URL}${rel}`, window.location.href).href

function start(onLoading?: (message: string) => void): Promise<void> {
  window.clearTimeout(unloadTimer)
  if (ready) return ready
  ready = (async () => {
    if (isDesktop()) {
      onLoading?.('Downloading speech recognition (28 MB, first time only)…')
      await window.desktop?.ensurePack('asr')
    }
    const w = new AsrWorker()
    worker = w
    await new Promise<void>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<Reply>) => {
        const m = e.data
        if (m.type === 'ready') return resolve()
        if (m.type === 'error' && m.id === undefined) return reject(new Error(m.message))
        const job = m.id !== undefined ? waiting.get(m.id) : undefined
        if (!job || m.id === undefined) return
        waiting.delete(m.id)
        if (m.type === 'text') job.resolve(m.text)
        else if (m.type === 'error') job.reject(new Error(m.message))
      }
      w.onerror = (e) => reject(new Error(e.message || 'speech recognition could not start'))
      const base = isDesktop() ? 'tcres://app/asr/' : appFile('asr/')
      w.postMessage({ type: 'init', base: `${base}moonshine/`, ortBase: `${base}ort/` })
    })
  })()
  ready.catch(() => unload())
  return ready
}

function unload() {
  worker?.terminate()
  worker = null
  ready = null
  for (const job of waiting.values()) job.reject(new Error('stopped'))
  waiting.clear()
}

/** Loads the recogniser ahead of the first question (the wake word does this when it starts). */
export function prepareTranscriber(onLoading?: (message: string) => void): Promise<void> {
  return start(onLoading)
}

/** Text of a recorded question (16 kHz mono); '' for nothing usable. */
export async function transcribe(samples: Float32Array, onLoading?: (message: string) => void): Promise<string> {
  if (samples.length < 16_000 * MIN_SECONDS) return ''
  await start(onLoading)
  const id = nextId++
  try {
    return await new Promise<string>((resolve, reject) => {
      waiting.set(id, { resolve, reject })
      worker?.postMessage({ type: 'transcribe', id, samples }, [samples.buffer])
    })
  } finally {
    window.clearTimeout(unloadTimer)
    unloadTimer = window.setTimeout(unload, UNLOAD_AFTER_MS)
  }
}

/** Recent microphone audio: what was said since `start`, plus a little before it. */
export class Recording {
  private chunks: Float32Array[] = []
  private length = 0
  /** Kept before speech is noticed, so the first word is not cut off. */
  private readonly preRollSamples = 16_000 * 0.6

  push(samples: Float32Array, keepAll: boolean) {
    this.chunks.push(samples.slice())
    this.length += samples.length
    if (keepAll) return
    while (this.chunks.length > 1 && this.length - this.chunks[0].length >= this.preRollSamples) this.length -= this.chunks.shift()!.length
  }

  take(): Float32Array {
    const out = new Float32Array(this.length)
    let at = 0
    for (const c of this.chunks) {
      out.set(c, at)
      at += c.length
    }
    this.clear()
    return out
  }

  clear() {
    this.chunks = []
    this.length = 0
  }
}
