import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MapStyle = 'tile' | 'svg'

/** Small persisted UI preferences (not game progress). */
export interface UiState {
  /** API normalizedName of the last opened map. */
  lastMapKey: string | null
  /**
   * Imagery style the user explicitly chose, per map. Maps without an entry
   * fall back to the config's preferredStyle (then "tile").
   */
  styleByMap: Record<string, MapStyle>
  /** Selected floor (layer name) per map; null/absent = ground level. */
  floorByMap: Record<string, string | null>
  setLastMapKey: (key: string) => void
  setMapStyle: (mapKey: string, style: MapStyle) => void
  setFloor: (mapKey: string, floor: string | null) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastMapKey: null,
      styleByMap: {},
      floorByMap: {},
      setLastMapKey: (lastMapKey) => set({ lastMapKey }),
      setMapStyle: (mapKey, style) =>
        set((s) => ({ styleByMap: { ...s.styleByMap, [mapKey]: style } })),
      setFloor: (mapKey, floor) =>
        set((s) => ({ floorByMap: { ...s.floorByMap, [mapKey]: floor } })),
    }),
    {
      name: 'tarkov-companion-ui',
      version: 2,
      // v1 stored one global mapStyle; drop it so per-map defaults apply.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<UiState> & { mapStyle?: unknown }
        return {
          lastMapKey: p.lastMapKey ?? null,
          styleByMap: p.styleByMap ?? {},
          floorByMap: p.floorByMap ?? {},
        } as UiState
      },
    },
  ),
)
