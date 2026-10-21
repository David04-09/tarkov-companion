/**
 * Voice input for the assistant: Vosk with its small English model, recognised on this PC.
 * Kept light for use while the game runs:
 * - nothing is loaded until the first time the mic is used (the recogniser is a worker file; the
 *   42 MB model is a content pack on desktop, cached in IndexedDB by the worker);
 * - the microphone is open only while listening (one question, at most 15 s);
 * - the recogniser may only pick words the app knows (command words and the names of maps,
 *   places, extracts and quests), which makes it far more accurate;
 * - the recogniser is unloaded again 3 minutes after the last question, freeing its memory.
 */
import { isDesktop } from '../desktop/useDesktop'
import { spokenToText } from './spoken'
import { VoskClient } from './voskClient'

export const VOICE_MODEL_FILE = 'vosk-model-small-en-us-0.15.tar.gz'
const MAX_LISTEN_MS = 15_000
const UNLOAD_AFTER_MS = 3 * 60_000
const SAMPLE_RATE = 16_000

export type ListenState = 'idle' | 'loading' | 'listening' | 'thinking'

export interface ListenHandlers {
  onState: (state: ListenState, detail?: string) => void
  /** What has been heard so far. */
  onPartial: (text: string) => void
  /** The finished question (empty when nothing was understood). */
  onResult: (text: string) => void
  onError: (message: string) => void
}

let modelPromise: Promise<VoskClient> | null = null
let unloadTimer: number | undefined

const appFile = (rel: string) => new URL(`${import.meta.env.BASE_URL}${rel}`, window.location.href).href

function modelUrl(): string {
  // Desktop: the downloaded content pack, served read-only by the app (electron/capture.ts).
  if (isDesktop()) return `tcres://app/voice/${VOICE_MODEL_FILE}`
  return appFile(`voice/${VOICE_MODEL_FILE}`)
}

function loadModel(onState: ListenHandlers['onState']): Promise<VoskClient> {
  window.clearTimeout(unloadTimer)
  if (!modelPromise) {
    modelPromise = (async () => {
      if (isDesktop()) {
        onState('loading', 'Downloading the speech model (42 MB, first time only)…')
        await window.desktop?.ensurePack('voice')
      }
      onState('loading', 'Starting voice input…')
      const client = new VoskClient(appFile('vosk/vosk-worker.js'), modelUrl())
      try {
        await client.ready
      } catch (e) {
        client.terminate()
        throw e
      }
      return client
    })()
    modelPromise.catch(() => {
      modelPromise = null
    })
  }
  return modelPromise
}

function scheduleUnload() {
  window.clearTimeout(unloadTimer)
  unloadTimer = window.setTimeout(() => {
    const p = modelPromise
    modelPromise = null
    void p?.then((m) => m.terminate()).catch(() => undefined)
  }, UNLOAD_AFTER_MS)
}

const clean = (text: string) => text.split('[unk]').join(' ').replace(/\s+/g, ' ').trim()

/**
 * Listens for one question. Returns a function that stops early (what was heard so far is used).
 * `vocabulary` limits what can be heard; "[unk]" catches everything else.
 */
export function listenOnce(vocabulary: string[], h: ListenHandlers): () => void {
  let stopped = false
  let finish: (() => void) | null = null
  const stop = () => {
    if (stopped) return
    stopped = true
    finish?.()
  }

  void (async () => {
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    try {
      const model = await loadModel(h.onState)
      if (stopped) return h.onState('idle')
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return h.onState('idle')
      }
      const audio = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctx = audio
      const mic = stream
      let heard = ''
      let done = false
      let timer: number | undefined
      const source = audio.createMediaStreamSource(mic)
      // ScriptProcessor: simple and still supported; it only runs while the mic is open.
      const node = audio.createScriptProcessor(4096, 1, 1)
      const close = (text: string) => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        node.disconnect()
        source.disconnect()
        mic.getTracks().forEach((t) => t.stop())
        void audio.close()
        recognizer.remove()
        scheduleUnload()
        h.onState('idle')
        h.onResult(spokenToText(clean(text)))
      }
      const recognizer = model.recognizer(audio.sampleRate, [...vocabulary, '[unk]'], {
        onPartial: (partial) => {
          if (!partial) return
          heard = partial
          h.onPartial(spokenToText(clean(partial)))
        },
        // A result comes at every pause; an empty one is just silence before speaking.
        onResult: (text) => {
          if (clean(text)) close(text)
        },
        onError: (message) => {
          close(heard)
          h.onError(`Voice input stopped (${message}).`)
        },
      })
      node.onaudioprocess = (e) => {
        if (!done) recognizer.accept(e.inputBuffer.getChannelData(0), e.inputBuffer.sampleRate)
      }
      source.connect(node)
      node.connect(audio.destination)
      timer = window.setTimeout(() => close(heard), MAX_LISTEN_MS)
      finish = () => close(heard)
      h.onState('listening')
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
      h.onState('idle')
      const name = e instanceof DOMException ? e.name : ''
      h.onError(
        name === 'NotAllowedError'
          ? 'The microphone is blocked. Allow it for this app (Windows: Settings → Privacy & security → Microphone).'
          : name === 'NotFoundError'
            ? 'No microphone was found.'
            : `Voice input could not start (${e instanceof Error ? e.message : String(e)}).`,
      )
    }
  })()

  return stop
}
