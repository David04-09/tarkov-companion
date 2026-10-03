import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Coordinates are game coordinates as Leaflet sees them: [z, x] (lat, lng). */
export type LatLngTuple = [number, number]

export type DrawingShape =
  | { type: 'marker'; latlng: LatLngTuple }
  | { type: 'text'; latlng: LatLngTuple; text: string }
  | { type: 'polyline'; latlngs: LatLngTuple[] }
  | { type: 'polygon'; latlngs: LatLngTuple[] }
  | { type: 'rectangle'; latlngs: LatLngTuple[] }
  | { type: 'circle'; latlng: LatLngTuple; radius: number }

export interface Drawing {
  id: string
  shape: DrawingShape
  color: string
  weight: number
}

export type DrawingsByKey = Record<string, Drawing[]>

export interface DrawingsState {
  /** Keyed by "<gameMode>:<map normalizedName>". */
  byKey: DrawingsByKey
  setDrawings: (key: string, drawings: Drawing[]) => void
  clearDrawings: (key: string) => void
  /** Replaces everything (import). */
  importAll: (byKey: DrawingsByKey) => void
}

export const drawingsKey = (gameMode: string, mapKey: string) => `${gameMode}:${mapKey}`

export const useDrawingsStore = create<DrawingsState>()(
  persist(
    (set) => ({
      byKey: {},
      setDrawings: (key, drawings) => set((s) => ({ byKey: { ...s.byKey, [key]: drawings } })),
      clearDrawings: (key) =>
        set((s) => {
          const next = { ...s.byKey }
          delete next[key]
          return { byKey: next }
        }),
      importAll: (byKey) => set({ byKey }),
    }),
    { name: 'tarkov-companion-drawings', version: 1 },
  ),
)

/** Loose validation for imported drawings. */
export function parseDrawings(raw: unknown): DrawingsByKey | null {
  if (typeof raw !== 'object' || raw === null) return null
  const out: DrawingsByKey = {}
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    out[key] = list.filter(
      (d): d is Drawing =>
        typeof d === 'object' && d !== null && typeof (d as Drawing).id === 'string' && typeof (d as Drawing).shape === 'object',
    )
  }
  return out
}
