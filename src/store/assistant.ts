import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { guarded } from './guarded'

export type VoiceGender = 'female' | 'male'

export interface AssistantState {
  /** Read answers out loud (Windows voices; off by default: answers are shown). */
  speak: boolean
  /** Listen for the wake word ("Hey Ranger") while the assistant tab is open. */
  wakeWord: boolean
  wakeName: 'ranger' | 'atlas' | 'nova' | 'echo' | 'raven'
  /** Desktop: brief the raid (card) when the game loads a map. */
  briefing: boolean
  /** Read that briefing out loud. */
  briefingVoice: boolean
  /** Desktop: show answers with details in a see-through pop-up over the game, closed by voice. */
  popup: boolean
  gender: VoiceGender
  /** A specific installed voice (its voiceURI), or null = the first one of the chosen gender. */
  voiceUri: string | null
  /** 0..1 */
  volume: number
  /** 0.5..2, 1 = normal. */
  rate: number
  set: (patch: Partial<Pick<AssistantState, 'speak' | 'wakeWord' | 'wakeName' | 'briefing' | 'briefingVoice' | 'popup' | 'gender' | 'voiceUri' | 'volume' | 'rate'>>) => void
}

const inRange = (lo: number, hi: number) => (v: unknown) => (typeof v === 'number' && v >= lo && v <= hi ? v : undefined)

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      speak: false,
      wakeWord: false,
      wakeName: 'ranger',
      briefing: true,
      briefingVoice: true,
      popup: true,
      gender: 'female',
      voiceUri: null,
      volume: 0.8,
      rate: 1,
      set: (patch) => set(patch),
    }),
    {
      name: 'tarkov-companion-assistant',
      partialize: (s) => ({ speak: s.speak, wakeWord: s.wakeWord, wakeName: s.wakeName, briefing: s.briefing, briefingVoice: s.briefingVoice, popup: s.popup, gender: s.gender, voiceUri: s.voiceUri, volume: s.volume, rate: s.rate }),
      // v1 (natural voice removed, 2026-10-23): answers are shown, not read out, unless switched on again.
      version: 1,
      ...guarded<AssistantState>({
        speak: 'boolean',
        wakeWord: 'boolean',
        wakeName: (v) => (['ranger', 'atlas', 'nova', 'echo', 'raven'].includes(v as string) ? v : undefined),
        briefing: 'boolean',
        briefingVoice: 'boolean',
        popup: 'boolean',
        gender: (v) => (v === 'female' || v === 'male' ? v : undefined),
        voiceUri: (v) => (typeof v === 'string' && v.length < 300 ? v : undefined),
        volume: inRange(0, 1),
        rate: inRange(0.5, 2),
      }),
      migrate: (persisted, version) => (version < 1 && persisted && typeof persisted === 'object' ? { ...persisted, speak: false } : persisted) as AssistantState,
    },
  ),
)
