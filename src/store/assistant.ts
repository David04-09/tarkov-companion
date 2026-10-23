import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { guarded } from './guarded'

/** The assistant only listens and shows; it never talks (owner, 2026-10-23). */
export interface AssistantState {
  /** Keep the microphone open while the app runs: the wake word ("Hey Ranger") and voice commands. */
  wakeWord: boolean
  wakeName: 'ranger' | 'atlas' | 'nova' | 'echo' | 'raven'
  /** While listening: tab names and "show quest …" work without saying the name first. */
  commands: boolean
  /** Desktop: brief the raid (card) when the game loads a map. */
  briefing: boolean
  /** Desktop: show answers with details in a see-through pop-up over the game, closed by voice. */
  popup: boolean
  /** The pop-up hides by itself after this many seconds (0 = only when you say "close"). */
  popupSeconds: number
  set: (patch: Partial<Pick<AssistantState, 'wakeWord' | 'wakeName' | 'commands' | 'briefing' | 'popup' | 'popupSeconds'>>) => void
}

export const POPUP_SECONDS_MAX = 60

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      wakeWord: false,
      wakeName: 'ranger',
      commands: true,
      briefing: true,
      popup: true,
      popupSeconds: 15,
      set: (patch) => set(patch),
    }),
    {
      name: 'tarkov-companion-assistant',
      partialize: (s) => ({ wakeWord: s.wakeWord, wakeName: s.wakeName, commands: s.commands, briefing: s.briefing, popup: s.popup, popupSeconds: s.popupSeconds }),
      // v2 (every voice removed, 2026-10-23): the old voice fields are simply not read any more.
      version: 2,
      ...guarded<AssistantState>({
        wakeWord: 'boolean',
        wakeName: (v) => (['ranger', 'atlas', 'nova', 'echo', 'raven'].includes(v as string) ? v : undefined),
        commands: 'boolean',
        briefing: 'boolean',
        popup: 'boolean',
        popupSeconds: (v) => (typeof v === 'number' && v >= 0 && v <= POPUP_SECONDS_MAX ? Math.round(v) : undefined),
      }),
    },
  ),
)
