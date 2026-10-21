/**
 * Talks to Vosk's speech-recognition worker (vosk-browser's worker, Apache-2.0, saved as its own
 * file by scripts/fetch-voice-model.mjs). Same messages vosk-browser's Model/KaldiRecognizer send;
 * written here so the worker can be started from a file: a blob: worker would inherit the page's
 * security policy, which forbids the string-to-code calls Emscripten's bindings make.
 */

interface ResultMessage {
  event: 'result'
  recognizerId: string
  result: { text: string }
}
interface PartialMessage {
  event: 'partialresult'
  recognizerId: string
  result: { partial: string }
}
interface LoadMessage {
  event: 'load'
  result: boolean
}
interface ErrorMessage {
  event: 'error'
  recognizerId?: string
  error: string
}
type ServerMessage = ResultMessage | PartialMessage | LoadMessage | ErrorMessage

export interface VoskRecognizer {
  /** Mono samples between -1 and 1. */
  accept: (samples: Float32Array, sampleRate: number) => void
  /** Ask for the result of what was heard so far (arrives as a normal result). */
  finish: () => void
  remove: () => void
}

export interface RecognizerHandlers {
  onResult: (text: string) => void
  onPartial: (text: string) => void
  onError: (message: string) => void
}

export class VoskClient {
  private worker: Worker
  private handlers = new Map<string, RecognizerHandlers>()
  /** Resolves once the model is loaded (the first time it is downloaded and unpacked into IndexedDB). */
  readonly ready: Promise<void>

  constructor(workerUrl: string, modelUrl: string) {
    this.worker = new Worker(workerUrl)
    this.ready = new Promise((resolve, reject) => {
      this.worker.addEventListener('message', (e: MessageEvent<ServerMessage>) => {
        const m = e.data
        if (!m) return
        if (m.event === 'load') return m.result ? resolve() : reject(new Error('the speech model did not load'))
        if (m.event === 'error' && !m.recognizerId) return reject(new Error(m.error))
        const h = 'recognizerId' in m && m.recognizerId ? this.handlers.get(m.recognizerId) : undefined
        if (!h) return
        if (m.event === 'result') h.onResult(m.result.text)
        else if (m.event === 'partialresult') h.onPartial(m.result.partial)
        else if (m.event === 'error') h.onError(m.error)
      })
      this.worker.addEventListener('error', (e) => reject(new Error(e.message || 'the speech worker failed to start')))
    })
    this.worker.postMessage({ action: 'set', key: 'logLevel', value: -1 })
    this.worker.postMessage({ action: 'load', modelUrl })
  }

  /** A recogniser that may only hear the given words ("[unk]" stands for anything else). */
  recognizer(sampleRate: number, words: string[], h: RecognizerHandlers): VoskRecognizer {
    const id = crypto.randomUUID()
    this.handlers.set(id, h)
    this.worker.postMessage({ action: 'create', recognizerId: id, sampleRate, grammar: JSON.stringify(words) })
    return {
      accept: (samples, rate) => {
        // Kaldi expects 16-bit sample values.
        const data = samples.map((v) => v * 0x8000)
        this.worker.postMessage({ action: 'audioChunk', recognizerId: id, data, sampleRate: rate }, [data.buffer])
      },
      finish: () => this.worker.postMessage({ action: 'retrieveFinalResult', recognizerId: id }),
      remove: () => {
        this.handlers.delete(id)
        this.worker.postMessage({ action: 'remove', recognizerId: id })
      },
    }
  }

  /** Frees the model's memory. */
  terminate(): void {
    this.worker.postMessage({ action: 'terminate' })
    window.setTimeout(() => this.worker.terminate(), 1000)
  }
}
