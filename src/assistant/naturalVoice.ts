/**
 * Plays answers with the natural voice (Kitten TTS, see tts.worker.ts). Light for use while the
 * game runs: nothing loads until the first answer is spoken (the 57 MB voice is a content pack on
 * desktop), each sentence is generated on one CPU core about three times faster than it is
 * spoken, the next sentence is made while the current one plays, and the worker is ended 3
 * minutes after the last answer to free its memory.
 */
import { isDesktop } from '../desktop/useDesktop'
import TtsWorker from './tts.worker?worker'

export const NATURAL_VOICES = {
  female: ['Bella', 'Luna', 'Rosie', 'Kiki'],
  male: ['Jasper', 'Bruno', 'Hugo', 'Leo'],
} as const

const UNLOAD_AFTER_MS = 3 * 60_000

type Reply = { type: 'ready' } | { type: 'audio'; id: number; samples: Float32Array; rate: number } | { type: 'error'; id?: number; message: string }

let worker: Worker | null = null
let ready: Promise<void> | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (r: { samples: Float32Array; rate: number }) => void; reject: (e: Error) => void }>()
let unloadTimer: number | undefined
let audio: AudioContext | null = null
let playing: AudioBufferSourceNode[] = []
/** Bumped by every new answer and by Stop: older work is dropped. */
let generation = 0

const appFile = (rel: string) => new URL(`${import.meta.env.BASE_URL}${rel}`, window.location.href).href

function start(onLoading?: (message: string) => void): Promise<void> {
  window.clearTimeout(unloadTimer)
  if (ready) return ready
  ready = (async () => {
    if (isDesktop()) {
      onLoading?.('Downloading the natural voice (57 MB, first time only)…')
      await window.desktop?.ensurePack('tts')
    }
    onLoading?.('Starting the natural voice…')
    const w = new TtsWorker()
    worker = w
    await new Promise<void>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<Reply>) => {
        const m = e.data
        if (m.type === 'ready') return resolve()
        if (m.type === 'error' && m.id === undefined) return reject(new Error(m.message))
        const job = m.id !== undefined ? waiting.get(m.id) : undefined
        if (!job || m.id === undefined) return
        waiting.delete(m.id)
        if (m.type === 'audio') job.resolve({ samples: m.samples, rate: m.rate })
        else if (m.type === 'error') job.reject(new Error(m.message))
      }
      w.onerror = (e) => reject(new Error(e.message || 'the voice could not start'))
      w.postMessage({ type: 'init', base: isDesktop() ? 'tcres://app/tts/' : appFile('tts/') })
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

function scheduleUnload() {
  window.clearTimeout(unloadTimer)
  unloadTimer = window.setTimeout(unload, UNLOAD_AFTER_MS)
}

function generate(text: string, voice: string, speed: number): Promise<{ samples: Float32Array; rate: number }> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    worker?.postMessage({ type: 'speak', id, text, voice, speed })
  })
}

/** Sentences, so the first can play while the next is made. */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean)
}

/** Resolves the playing answer's promise when it is stopped. */
let finishPlaying: (() => void) | null = null

export function stopNatural(): void {
  generation++
  finishPlaying?.()
  finishPlaying = null
  for (const s of playing) {
    try {
      s.stop()
    } catch {
      // already ended
    }
  }
  playing = []
}

/** Speaks `text`; resolves when it has finished playing (or was stopped). Throws when the voice cannot load. */
export async function speakNatural(text: string, opts: { voice: string; volume: number; rate: number; onLoading?: (message: string) => void }): Promise<void> {
  stopNatural()
  const mine = generation
  await start(opts.onLoading)
  audio ??= new AudioContext()
  const ctx = audio
  if (ctx.state === 'suspended') await ctx.resume()
  const gain = ctx.createGain()
  gain.gain.value = opts.volume
  gain.connect(ctx.destination)
  let at = ctx.currentTime
  let last: AudioBufferSourceNode | null = null
  try {
    for (const part of sentences(text)) {
      const { samples, rate } = await generate(part, opts.voice, opts.rate)
      if (mine !== generation) return
      const buffer = ctx.createBuffer(1, samples.length, rate)
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      at = Math.max(at, ctx.currentTime + 0.02)
      src.start(at)
      at += buffer.duration
      playing.push(src)
      last = src
      src.onended = () => {
        playing = playing.filter((p) => p !== src)
      }
    }
  } finally {
    scheduleUnload()
  }
  const end = last
  if (!end || mine !== generation) return
  await new Promise<void>((resolve) => {
    finishPlaying = resolve
    end.addEventListener('ended', () => resolve(), { once: true })
  })
}
