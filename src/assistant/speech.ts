/**
 * Speaking answers with the voices built into Windows (speechSynthesis). The operating system
 * does the work: no download, no model, next to no memory or CPU, and nothing leaves the PC
 * for the standard Windows voices.
 */
import { forSpeech } from './speakable'
import type { VoiceGender } from '../store/assistant'

/** First names of common Windows, macOS and browser voices; speechSynthesis does not say which voices are male or female. */
const FEMALE = /\b(zira|hazel|susan|aria|jenny|michelle|sonia|libby|catherine|natasha|heera|linda|eva|helen|samantha|karen|moira|tessa|fiona|victoria|ana|emma|ava|clara|elsa|hedda|katja|julie|hortense|paulina|irina|maria|sabina|zoe|female|woman)\b/i
const MALE = /\b(david|mark|george|guy|ryan|thomas|james|ravi|sean|daniel|alex|fred|richard|christopher|eric|brian|andrew|roger|steffan|william|stefan|paul|pablo|raul|claude|pavel|male|man)\b/i

export function voiceGender(v: SpeechSynthesisVoice): VoiceGender | null {
  if (FEMALE.test(v.name)) return 'female'
  if (MALE.test(v.name)) return 'male'
  return null
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Installed voices, English first. They load asynchronously: call again after 'voiceschanged'. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return []
  return window.speechSynthesis
    .getVoices()
    .slice()
    .sort((a, b) => Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')) || Number(b.localService) - Number(a.localService))
}

/** The voice to use: the one picked, else the first English voice of the chosen gender, else any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], gender: VoiceGender, uri: string | null): SpeechSynthesisVoice | null {
  const picked = uri ? voices.find((v) => v.voiceURI === uri) : undefined
  if (picked) return picked
  const english = voices.filter((v) => v.lang.startsWith('en'))
  return english.find((v) => voiceGender(v) === gender) ?? voices.find((v) => voiceGender(v) === gender) ?? english[0] ?? voices[0] ?? null
}

export interface SpeakOptions {
  gender: VoiceGender
  voiceUri: string | null
  volume: number
  rate: number
}

/** Listeners told when the assistant starts and stops talking (the wake word ignores the mic meanwhile). */
const speakingListeners = new Set<(speaking: boolean) => void>()
let speakingToken = 0
export function onSpeakingChange(cb: (speaking: boolean) => void): () => void {
  speakingListeners.add(cb)
  return () => speakingListeners.delete(cb)
}
let talking = false
/** Answers cut off by the player (Stop, or talking over them), for the assistant's style (memory.ts). */
let cuts = 0
export const cutCount = () => cuts
function speaking(on: boolean) {
  talking = on
  for (const cb of speakingListeners) cb(on)
}

/** Says `text` with a Windows voice. Resolves when it has finished talking. */
export function speak(said: string, opts: SpeakOptions): Promise<void> {
  if (!said.trim()) return Promise.resolve()
  // Room and key numbers digit by digit, codes letter by letter (speakable.ts).
  const text = forSpeech(said)
  const token = ++speakingToken
  speaking(true)
  const done = () => {
    if (token === speakingToken) speaking(false)
  }
  return speakWindows(text, opts).finally(done)
}

function stopWindows() {
  if (speechAvailable()) window.speechSynthesis.cancel()
}

function speakWindows(text: string, opts: SpeakOptions): Promise<void> {
  if (!speechAvailable()) return Promise.resolve()
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(listVoices(), opts.gender, opts.voiceUri)
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  }
  u.volume = opts.volume
  u.rate = opts.rate
  return new Promise((resolve) => {
    u.onend = () => resolve()
    u.onerror = () => resolve()
    synth.speak(u)
  })
}

/** Stops talking because the player wanted it to (Stop button, wake word over an answer). */
export function stopSpeaking(): void {
  if (talking) cuts++
  stopSpeakingQuietly()
}

/** Stops talking for the app's own reasons (a new briefing), not counted as the player cutting it off. */
export function stopSpeakingQuietly(): void {
  stopWindows()
  speakingToken++
  speaking(false)
}
