import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** One (game position -> image pixel) correspondence placed in the align tool. */
export interface AlignPair {
  id: string
  /** Reference point id (extract id, transit id, or objective id + index). */
  refId: string
  label: string
  /** Game coordinates. */
  x: number
  z: number
  /** Image position in zoom-0 pixels of the layer being aligned. */
  px: number
  py: number
}

export interface AlignState {
  /** Keyed by "<map normalizedName>:<base layer id>". */
  pairsByLayer: Record<string, AlignPair[]>
  upsertPair: (layerKey: string, pair: AlignPair) => void
  removePair: (layerKey: string, pairId: string) => void
  clearPairs: (layerKey: string) => void
}

export const alignLayerKey = (mapKey: string, layerId: string) => `${mapKey}:${layerId}`

export const useAlignStore = create<AlignState>()(
  persist(
    (set) => ({
      pairsByLayer: {},
      upsertPair: (layerKey, pair) =>
        set((s) => {
          const list = s.pairsByLayer[layerKey] ?? []
          const idx = list.findIndex((p) => p.refId === pair.refId)
          const next = idx === -1 ? [...list, pair] : list.map((p, i) => (i === idx ? { ...pair, id: p.id } : p))
          return { pairsByLayer: { ...s.pairsByLayer, [layerKey]: next } }
        }),
      removePair: (layerKey, pairId) =>
        set((s) => ({
          pairsByLayer: {
            ...s.pairsByLayer,
            [layerKey]: (s.pairsByLayer[layerKey] ?? []).filter((p) => p.id !== pairId),
          },
        })),
      clearPairs: (layerKey) =>
        set((s) => {
          const next = { ...s.pairsByLayer }
          delete next[layerKey]
          return { pairsByLayer: next }
        }),
    }),
    { name: 'tarkov-companion-align', version: 1 },
  ),
)
