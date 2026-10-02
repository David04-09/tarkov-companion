import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Small persisted UI preferences (not game progress). */
export interface UiState {
  /** API normalizedName of the last opened map. */
  lastMapKey: string | null
  /**
   * Base layer (image) the user explicitly chose, per map. Maps without an
   * entry use the config's defaultBaseLayerId.
   */
  baseLayerByMap: Record<string, string>
  /** Selected floor (layer name) per map; null/absent = ground level. */
  floorByMap: Record<string, string | null>
  setLastMapKey: (key: string) => void
  setBaseLayer: (mapKey: string, layerId: string) => void
  setFloor: (mapKey: string, floor: string | null) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastMapKey: null,
      baseLayerByMap: {},
      floorByMap: {},
      setLastMapKey: (lastMapKey) => set({ lastMapKey }),
      setBaseLayer: (mapKey, layerId) =>
        set((s) => ({ baseLayerByMap: { ...s.baseLayerByMap, [mapKey]: layerId } })),
      setFloor: (mapKey, floor) =>
        set((s) => ({ floorByMap: { ...s.floorByMap, [mapKey]: floor } })),
    }),
    {
      name: 'tarkov-companion-ui',
      version: 3,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<UiState> & { styleByMap?: Record<string, 'tile' | 'svg'> }
        // v2 stored a tile/svg style per map; map it onto the tarkov.dev layer ids.
        const fromStyle: Record<string, string> = {}
        if (version < 3 && p.styleByMap) {
          for (const [k, v] of Object.entries(p.styleByMap)) {
            fromStyle[k] = v === 'svg' ? 'tarkovdev-drawing' : 'tarkovdev-photo'
          }
        }
        return {
          lastMapKey: p.lastMapKey ?? null,
          baseLayerByMap: p.baseLayerByMap ?? fromStyle,
          floorByMap: p.floorByMap ?? {},
        } as UiState
      },
    },
  ),
)
