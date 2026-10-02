import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MapStyle = 'tile' | 'svg'

/** Small persisted UI preferences (not game progress). */
export interface UiState {
  /** API normalizedName of the last opened map. */
  lastMapKey: string | null
  /** Preferred imagery when a map offers both satellite tiles and the abstract SVG. */
  mapStyle: MapStyle
  /** Selected floor (layer name) per map; null/absent = ground level. */
  floorByMap: Record<string, string | null>
  setLastMapKey: (key: string) => void
  setMapStyle: (style: MapStyle) => void
  setFloor: (mapKey: string, floor: string | null) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastMapKey: null,
      mapStyle: 'tile',
      floorByMap: {},
      setLastMapKey: (lastMapKey) => set({ lastMapKey }),
      setMapStyle: (mapStyle) => set({ mapStyle }),
      setFloor: (mapKey, floor) =>
        set((s) => ({ floorByMap: { ...s.floorByMap, [mapKey]: floor } })),
    }),
    { name: 'tarkov-companion-ui', version: 1 },
  ),
)
