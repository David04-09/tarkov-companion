/**
 * Speaking answers with the voices built into Windows (speechSynthesis). The operating system
 * does the work: no download, no model, next to no memory or CPU, and nothing leaves the PC
 * for the standard Windows voices.
 */
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

export function speak(text: string, opts: { gender: VoiceGender; voiceUri: string | null; volume: number; rate: number }): void {
  if (!speechAvailable() || !text.trim()) return
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
  synth.speak(u)
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel()
}
