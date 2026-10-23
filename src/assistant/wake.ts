/**
 * Wake word for the assistant: "Hey Ranger" (or just "Ranger"), it answers, and then every
 * question is heard without saying the name again, until "thanks, that's all".
 *
 * Light while waiting: the recogniser may only pick the name (plus "[unk]" for everything else),
 * which costs little CPU; nothing is recorded or sent anywhere. While the assistant talks, the
 * microphone is ignored so it does not hear itself. All waiting is measured in microphone audio
 * time, not with timers: a background window gets its timers slowed down, the audio keeps flowing.
 */
import { holdModel, loadModel, questionText, type ListenState } from './listen'
import { spokenToText } from './spoken'
import { prepareTranscriber, Recording } from './transcribe'
import { words } from './text'
import type { VoskRecognizer } from './voskClient'

const SAMPLE_RATE = 16_000
/** Silence after speech that ends a question. */
const END_AFTER_QUIET_S = 1.3
/** Longest single question. */
const MAX_QUESTION_S = 25
/** Back to waiting for the name after this long without speech in a conversation. */
const CONVERSATION_IDLE_S = 45

export const WAKE_NAMES = ['ranger', 'atlas', 'nova', 'echo', 'raven'] as const
export type WakeName = (typeof WAKE_NAMES)[number]

export interface WakeHandlers {
  onState: (state: ListenState | 'waiting', detail?: string) => void
  /** The name was said: answer ("Yes sir?"). */
  onWake: () => void
  /** A finished question in a conversation. */
  /** `alt`: what the small Vosk model heard, as a second opinion. */
  onQuestion: (text: string, alt?: string) => void
  /** "Thanks, that's all" (or nothing said for a while: `idle`). */
  onEnd: (idle: boolean) => void
  onPartial: (text: string) => void
  onError: (message: string) => void
}

export interface WakeListener {
  stop: () => void
  /** Ignore the microphone (while the assistant is talking). */
  pause: (paused: boolean) => void
  /** Start a conversation without the name (mic button / hotkey). */
  wake: () => void
}

const clean = (text: string) => text.split('[unk]').join(' ').replace(/\s+/g, ' ').trim()

/** "Thanks, that's all", "that's all", "stop listening", "goodbye", "never mind" … ends a conversation. */
const THANKS_FILLER = new Set(['thanks', 'thank', 'you', 'very', 'much', 'a', 'lot', 'so', 'mate', 'man', 'buddy', 'bro', 'sir', 'ok', 'okay'])

export function isEndPhrase(text: string): boolean {
  // "all" can come out as "awl" (an item in the game) or "al".
  const list = words(text).map((w) => (w === 'awl' || w === 'al' ? 'all' : w))
  const w = ` ${list.join(' ')} `
  if (/\b(thats all|that is all|thats it|that is it|stop listening|goodbye|good bye|bye|never mind|nevermind|dismissed|over and out|nothing else)\b/.test(w)) return true
  // A short thanks on its own ("thanks", "thank you", "thanks mate") ends it; "thanks, where is…" does not.
  return (list[0] === 'thanks' || (list[0] === 'thank' && list[1] === 'you')) && list.every((x) => THANKS_FILLER.has(x))
}

/** Did the recogniser hear the name? (Its only words are the name, "hey" and "[unk]".) */
export function heardName(text: string, name: string): boolean {
  return words(clean(text)).includes(name)
}

export function startWakeListening(name: WakeName, vocabulary: string[], h: WakeHandlers): WakeListener {
  let stopped = false
  let mode: 'waiting' | 'conversation' = 'waiting'
  let paused = false
  let cleanup: (() => void) | null = null
  let switchMode: ((m: 'waiting' | 'conversation') => void) | null = null
  holdModel(true)

  void (async () => {
    let stream: MediaStream | null = null
    try {
      const model = await loadModel(h.onState)
      if (stopped) return
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const mic = stream
      const audio = new AudioContext({ sampleRate: SAMPLE_RATE })
      const source = audio.createMediaStreamSource(mic)
      // ScriptProcessor: runs on the audio clock, also while the window is in the background.
      const node = audio.createScriptProcessor(4096, 1, 1)

      // Audio-time clock (seconds of microphone audio heard while not paused).
      let now = 0
      let said: string[] = []
      let partial = ''
      let lastPartial = ''
      let questionStart = -1
      let quietSince = -1
      let lastSpeech = 0
      let recognizer: VoskRecognizer | null = null
      // The question's audio (from just before speech was noticed) for Moonshine.
      const recording = new Recording()

      const finishQuestion = () => {
        const voskText = clean([...said, partial].join(' '))
        const samples = recording.take()
        said = []
        partial = ''
        lastPartial = ''
        questionStart = -1
        quietSince = -1
        h.onState('thinking', 'Working out what you said…')
        void questionText(samples, voskText, h.onState).then(({ text, alt }) => {
          if (stopped || mode !== 'conversation') return
          if (!text) return h.onState('listening', 'I did not catch that. Ask again.')
          // Vosk knows the end phrase as well (it is in its word list): either one ends it.
          if (isEndPhrase(text) || isEndPhrase(spokenToText(voskText))) {
            switchMode?.('waiting')
            h.onEnd(false)
          } else {
            h.onState('listening', `Listening. Say "thanks, that's all" when you are done.`)
            h.onQuestion(text, alt)
          }
        })
      }

      const makeRecognizer = () => {
        recognizer?.remove()
        const grammar = mode === 'waiting' ? [`hey ${name}`, name, '[unk]'] : [...vocabulary, '[unk]']
        recognizer = model.recognizer(SAMPLE_RATE, grammar, {
          onPartial: (p) => {
            if (mode !== 'conversation' || !p.trim() || p === lastPartial) return
            // Any speech counts, also words Vosk does not know ("[unk]"): Moonshine reads them.
            lastPartial = p
            partial = clean(p)
            lastSpeech = now
            quietSince = -1
            if (questionStart < 0) questionStart = now
            h.onPartial('…')
          },
          onResult: (text) => {
            const t = clean(text)
            if (mode === 'waiting') {
              if (t && heardName(t, name)) {
                switchMode?.('conversation')
                h.onWake()
              }
              return
            }
            partial = ''
            lastPartial = ''
            if (text.trim()) {
              if (t) said.push(t)
              if (questionStart < 0) questionStart = now
              lastSpeech = now
              quietSince = now
            }
          },
          onError: (message) => h.onError(`Voice input stopped (${message}).`),
        })
      }

      switchMode = (m) => {
        mode = m
        recording.clear()
        if (m === 'conversation') void prepareTranscriber().catch(() => undefined)
        said = []
        partial = ''
        lastPartial = ''
        questionStart = -1
        quietSince = -1
        lastSpeech = now
        makeRecognizer()
        h.onState(m === 'waiting' ? 'waiting' : 'listening', m === 'waiting' ? `Say "Hey ${name[0].toUpperCase()}${name.slice(1)}" to talk to the assistant.` : undefined)
      }

      node.onaudioprocess = (e) => {
        if (stopped || paused || !recognizer) return
        const samples = e.inputBuffer.getChannelData(0)
        now += samples.length / e.inputBuffer.sampleRate
        recognizer.accept(samples, e.inputBuffer.sampleRate)
        if (mode !== 'conversation') return
        recording.push(samples, questionStart >= 0)
        // Quiet for a moment after speaking: the question is done.
        if (questionStart >= 0 && quietSince >= 0 && now - quietSince >= END_AFTER_QUIET_S) finishQuestion()
        else if (questionStart >= 0 && now - questionStart >= MAX_QUESTION_S) finishQuestion()
        else if (questionStart < 0 && now - lastSpeech >= CONVERSATION_IDLE_S) {
          switchMode?.('waiting')
          h.onEnd(true)
        }
      }
      source.connect(node)
      node.connect(audio.destination)
      switchMode('waiting')

      cleanup = () => {
        node.disconnect()
        source.disconnect()
        mic.getTracks().forEach((t) => t.stop())
        void audio.close()
        recognizer?.remove()
      }
      if (stopped) cleanup()
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop())
      const err = e instanceof DOMException ? e.name : ''
      h.onError(
        err === 'NotAllowedError'
          ? 'The microphone is blocked. Allow it for this app (Windows: Settings → Privacy & security → Microphone).'
          : err === 'NotFoundError'
            ? 'No microphone was found.'
            : `The wake word could not start (${e instanceof Error ? e.message : String(e)}).`,
      )
    }
  })()

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      cleanup?.()
      holdModel(false)
      h.onState('idle')
    },
    pause: (p) => {
      if (p === paused) return
      paused = p
      // After the assistant has spoken, start the next question fresh.
      if (!p && switchMode) switchMode(mode)
    },
    wake: () => {
      if (!switchMode) return
      switchMode('conversation')
      h.onWake()
    },
  }
}
