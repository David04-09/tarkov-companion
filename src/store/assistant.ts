import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { guarded } from './guarded'

export type VoiceGender = 'female' | 'male'
/** natural = Kitten TTS (neural, offline, a 57 MB download); windows = the voices built into Windows. */
export type VoiceEngine = 'natural' | 'windows'

export interface AssistantState {
  /** Read answers out loud. */
  speak: boolean
  engine: VoiceEngine
  /** Natural voice name (Bella, Jasper, …), or null = the first one of the chosen gender. */
  naturalVoice: string | null
  gender: VoiceGender
  /** A specific installed voice (its voiceURI), or null = the first one of the chosen gender. */
  voiceUri: string | null
  /** 0..1 */
  volume: number
  /** 0.5..2, 1 = normal. */
  rate: number
  set: (patch: Partial<Pick<AssistantState, 'speak' | 'engine' | 'naturalVoice' | 'gender' | 'voiceUri' | 'volume' | 'rate'>>) => void
}

const inRange = (lo: number, hi: number) => (v: unknown) => (typeof v === 'number' && v >= lo && v <= hi ? v : undefined)

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      speak: true,
      engine: 'natural',
      naturalVoice: null,
      gender: 'female',
      voiceUri: null,
      volume: 0.8,
      rate: 1,
      set: (patch) => set(patch),
    }),
    {
      name: 'tarkov-companion-assistant',
      partialize: (s) => ({ speak: s.speak, engine: s.engine, naturalVoice: s.naturalVoice, gender: s.gender, voiceUri: s.voiceUri, volume: s.volume, rate: s.rate }),
      ...guarded<AssistantState>({
        speak: 'boolean',
        engine: (v) => (v === 'natural' || v === 'windows' ? v : undefined),
        naturalVoice: (v) => (typeof v === 'string' && v.length < 40 ? v : undefined),
        gender: (v) => (v === 'female' || v === 'male' ? v : undefined),
        voiceUri: (v) => (typeof v === 'string' && v.length < 300 ? v : undefined),
        volume: inRange(0, 1),
        rate: inRange(0.5, 2),
      }),
    },
  ),
)
