import { create } from 'zustand'
import type { ListenState } from '../assistant/listen'
import type { AssistantAction, MapCard, Reply } from '../assistant/engine'

export interface ChatMessage {
  id: number
  from: 'you' | 'assistant'
  text: string
  reply?: Reply
  at: number
  /** Heard in a wake-word conversation but not answered: it was not for the assistant. */
  ignored?: boolean
}

/**
 * The assistant's conversation, shared by AssistantHost (in Layout, so the wake word works on
 * every tab) and the Neural network tab that shows it. Not saved: a new app start is a new chat.
 * The host registers what it can do (ask, run, listen) so the tab only draws.
 */
interface AssistantChatState {
  messages: ChatMessage[]
  card: MapCard | null
  /** Id of the answer still being worked out (route, item list). */
  pending: number | null
  listen: { state: ListenState; detail?: string }
  /** Actions already run, by `${messageId}:${index}`. */
  done: string[]
  /** A wake-word conversation is going on ("Hey Ranger" until "thanks, that's all"). */
  talking: boolean
  ask: (text: string, opts?: { conversation?: boolean }) => void
  run: (key: string, action: AssistantAction) => void
  toggleListening: () => void
  set: (patch: Partial<Omit<AssistantChatState, 'set'>>) => void
}

export const useAssistantChat = create<AssistantChatState>()((set) => ({
  messages: [],
  card: null,
  pending: null,
  listen: { state: 'idle' },
  done: [],
  talking: false,
  ask: () => {},
  run: () => {},
  toggleListening: () => {},
  set: (patch) => set(patch),
}))
