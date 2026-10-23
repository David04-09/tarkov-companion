/**
 * Loads the small paraphrase model (nlu.worker.ts) only when a question was not understood, keeps
 * the example sentences' meanings once worked out, and ends the worker 3 minutes after last use.
 */
import { isDesktop } from '../desktop/useDesktop'
import NluWorker from './nlu.worker?worker'
import { EXAMPLES, pickTemplate } from './understand'
import type { Slot } from './engine'

const UNLOAD_AFTER_MS = 3 * 60_000

type Reply = { type: 'ready' } | { type: 'vectors'; id: number; vectors: Float32Array[] } | { type: 'error'; id?: number; message: string }

let worker: Worker | null = null
let ready: Promise<void> | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>()
let unloadTimer: number | undefined
/** The example sentences' meanings (worked out once per app start, ~1 s). */
let examples: Promise<Float32Array[]> | null = null

const appFile = (rel: string) => new URL(`${import.meta.env.BASE_URL}${rel}`, window.location.href).href

function start(onLoading?: (message: string) => void): Promise<void> {
  window.clearTimeout(unloadTimer)
  if (ready) return ready
  ready = (async () => {
    if (isDesktop()) {
      onLoading?.('Downloading the language helper (29 MB, first time only)…')
      await window.desktop?.ensurePack('nlu')
    }
    const w = new NluWorker()
    worker = w
    await new Promise<void>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<Reply>) => {
        const m = e.data
        if (m.type === 'ready') return resolve()
        if (m.type === 'error' && m.id === undefined) return reject(new Error(m.message))
        const job = m.id !== undefined ? waiting.get(m.id) : undefined
        if (!job || m.id === undefined) return
        waiting.delete(m.id)
        if (m.type === 'vectors') job.resolve(m.vectors)
        else if (m.type === 'error') job.reject(new Error(m.message))
      }
      w.onerror = (e) => reject(new Error(e.message || 'the language helper could not start'))
      const base = isDesktop() ? 'tcres://app/nlu/' : appFile('nlu/')
      w.postMessage({ type: 'init', base: `${base}model/`, ortBase: `${base}ort/` })
    })
  })()
  ready.catch(() => unload())
  return ready
}

function unload() {
  worker?.terminate()
  worker = null
  ready = null
  examples = null
  for (const job of waiting.values()) job.reject(new Error('stopped'))
  waiting.clear()
}

async function embed(texts: string[], onLoading?: (message: string) => void): Promise<Float32Array[]> {
  await start(onLoading)
  const id = nextId++
  try {
    return await new Promise<Float32Array[]>((resolve, reject) => {
      waiting.set(id, { resolve, reject })
      worker?.postMessage({ type: 'embed', id, texts })
    })
  } finally {
    window.clearTimeout(unloadTimer)
    unloadTimer = window.setTimeout(unload, UNLOAD_AFTER_MS)
  }
}

/** Loads the helper and its examples ahead of time (the wake word does this). */
export function warmNlu(): void {
  examples ??= embed(EXAMPLES.map((e) => e.text))
  examples.catch(() => undefined)
}

/** True once the model is loaded (asking it then costs about a millisecond). */
export const nluLoaded = () => !!worker

/** The known question a sentence means, with its names put in; null when nothing is close enough. */
export async function understandQuestion(masked: string, slots: Partial<Record<Slot, string>>, said: string, onLoading?: (message: string) => void, need?: number): Promise<{ ask: string; score: number; slots: number } | null> {
  examples ??= embed(EXAMPLES.map((e) => e.text), onLoading)
  const [vectors, [q]] = await Promise.all([examples, embed([masked], onLoading)])
  return pickTemplate(q, vectors, slots, said, need)
}
