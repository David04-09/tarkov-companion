/**
 * Voice input for the assistant: Vosk with its small English model, recognised on this PC.
 * Kept light for use while the game runs:
 * - nothing is loaded until the first time the mic is used (the recogniser is a worker file; the
 *   42 MB model is a content pack on desktop, cached in IndexedDB by the worker);
 * - the microphone is open only while listening (one question: it ends 1.8 s after you stop
 *   talking, or at 25 s);
 * - the recogniser may only pick words the app knows (command words and the names of maps,
 *   places, extracts and quests), which makes it far more accurate;
 * - the recogniser is unloaded again 3 minutes after the last question, freeing its memory.
 */
import { isDesktop } from '../desktop/useDesktop'
import { spokenToText } from './spoken'
import { VoskClient } from './voskClient'

export const VOICE_MODEL_FILE = 'vosk-model-small-en-us-0.15.tar.gz'
/** Longest question. */
const MAX_LISTEN_MS = 25_000
/** Time to start talking after the mic opens. */
const WAIT_FOR_SPEECH_MS = 8_000
/** Silence after speech that ends the question. */
const END_AFTER_QUIET_MS = 1_800
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
      // Finished sentences so far, and the one being spoken right now.
      const said: string[] = []
      let partial = ''
      let lastPartial = ''
      let done = false
      let maxTimer: number | undefined
      let quietTimer: number | undefined
      const source = audio.createMediaStreamSource(mic)
      // ScriptProcessor: simple and still supported; it only runs while the mic is open.
      const node = audio.createScriptProcessor(4096, 1, 1)
      const heard = () => clean([...said, partial].join(' '))
      const close = () => {
        if (done) return
        done = true
        window.clearTimeout(maxTimer)
        window.clearTimeout(quietTimer)
        node.disconnect()
        source.disconnect()
        mic.getTracks().forEach((t) => t.stop())
        void audio.close()
        recognizer.remove()
        scheduleUnload()
        h.onState('idle')
        h.onResult(spokenToText(heard()))
      }
      // Done once the player has said something and then stayed quiet for a moment (a pause in
      // the middle of a question is shorter); nothing said at all ends the wait sooner.
      const waitForQuiet = (ms: number) => {
        window.clearTimeout(quietTimer)
        quietTimer = window.setTimeout(close, ms)
      }
      const recognizer = model.recognizer(audio.sampleRate, [...vocabulary, '[unk]'], {
        onPartial: (p) => {
          const text = clean(p)
          if (!text || text === lastPartial) return
          // Still talking: keep listening.
          lastPartial = text
          partial = text
          window.clearTimeout(quietTimer)
          h.onPartial(spokenToText(heard()))
        },
        // A result comes at every pause: keep it and wait to see whether more is coming.
        onResult: (text) => {
          const t = clean(text)
          partial = ''
          lastPartial = ''
          if (t) said.push(t)
          if (said.length) {
            h.onPartial(spokenToText(heard()))
            waitForQuiet(END_AFTER_QUIET_MS)
          }
        },
        onError: (message) => {
          close()
          h.onError(`Voice input stopped (${message}).`)
        },
      })
      node.onaudioprocess = (e) => {
        if (!done) recognizer.accept(e.inputBuffer.getChannelData(0), e.inputBuffer.sampleRate)
      }
      source.connect(node)
      node.connect(audio.destination)
      maxTimer = window.setTimeout(close, MAX_LISTEN_MS)
      waitForQuiet(WAIT_FOR_SPEECH_MS)
      finish = close
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
