import { create } from 'zustand'

export interface RoutePoint {
  id: string
  label: string
  x: number
  z: number
}

export interface RoutePlanState {
  /** Map (normalizedName) the plan belongs to; cleared when the map changes. */
  mapKey: string | null
  points: RoutePoint[]
  setPlan: (mapKey: string, points: RoutePoint[]) => void
  movePoint: (id: string, x: number, z: number) => void
  reorder: (from: number, to: number) => void
  removePoint: (id: string) => void
  clear: () => void
}

/** In-memory only: a route plan is a per-session scratch pad until saved as a drawing. */
export const useRoutePlanStore = create<RoutePlanState>()((set) => ({
  mapKey: null,
  points: [],
  setPlan: (mapKey, points) => set({ mapKey, points }),
  movePoint: (id, x, z) => set((s) => ({ points: s.points.map((p) => (p.id === id ? { ...p, x, z } : p)) })),
  reorder: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.points.length || to >= s.points.length) return s
      const next = [...s.points]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { points: next }
    }),
  removePoint: (id) => set((s) => ({ points: s.points.filter((p) => p.id !== id) })),
  clear: () => set({ mapKey: null, points: [] }),
}))
