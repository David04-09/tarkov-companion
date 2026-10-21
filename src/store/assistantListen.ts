import { create } from 'zustand'

/** "Start listening" requests from the desktop hotkey, picked up by the assistant tab (in memory only). */
export const useAssistantListenStore = create<{ request: number; ask: () => void }>()((set) => ({
  request: 0,
  ask: () => set({ request: Date.now() }),
}))
