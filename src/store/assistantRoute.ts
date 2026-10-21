import { create } from 'zustand'
import type { Position } from '../api/types'

export interface AssistantRouteState {
  /** Map (normalizedName) the route belongs to. */
  mapKey: string | null
  path: Position[]
  fromLabel: string
  toLabel: string
  /** When the route was sent (the map zooms to a new route once). */
  at: number
  set: (route: { mapKey: string; path: Position[]; fromLabel: string; toLabel: string }) => void
  clear: () => void
}

/** The assistant's last walking route, drawn on the Maps tab until cleared (in memory only). */
export const useAssistantRouteStore = create<AssistantRouteState>()((set) => ({
  mapKey: null,
  path: [],
  fromLabel: '',
  toLabel: '',
  at: 0,
  set: (route) => set({ ...route, at: Date.now() }),
  clear: () => set({ mapKey: null, path: [], fromLabel: '', toLabel: '', at: 0 }),
}))
