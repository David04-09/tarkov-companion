import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TASK_PALETTE } from '../maps/overlay/palette'

export type OverlayLayerId = 'extractsPmc' | 'extractsScav' | 'transits' | 'locks' | 'spawns' | 'bosses'

export const OVERLAY_LAYERS: { id: OverlayLayerId; label: string; hint?: string }[] = [
  { id: 'extractsPmc', label: 'PMC extracts', hint: 'PMC and shared extracts' },
  { id: 'extractsScav', label: 'Scav extracts' },
  { id: 'transits', label: 'Transits' },
  { id: 'locks', label: 'Locked doors & trunks', hint: 'Green = you own the key' },
  { id: 'spawns', label: 'Player spawns' },
  { id: 'bosses', label: 'Boss spawns' },
]

const DEFAULT_LAYERS: Record<OverlayLayerId, boolean> = {
  extractsPmc: true,
  extractsScav: false,
  transits: true,
  locks: false,
  spawns: false,
  bosses: false,
}

export interface MapOverlayState {
  /** Tasks shown on the map (global: survives switching maps). */
  checkedTaskIds: string[]
  /** Palette index per checked task; recycled when a task is unchecked. */
  colorIndexByTask: Record<string, number>
  layers: Record<OverlayLayerId, boolean>
  /** Loot container groups (by container name) that are switched on. */
  lootGroups: Record<string, boolean>
  panelCollapsed: boolean
  /** Set by the panel's Focus button; consumed by the map. */
  focusRequest: { taskId: string; nonce: number } | null
  setTaskChecked: (taskId: string, checked: boolean) => void
  setTasksChecked: (taskIds: string[], checked: boolean) => void
  clearChecked: () => void
  toggleLayer: (id: OverlayLayerId) => void
  setLootGroup: (name: string, on: boolean) => void
  setLootGroups: (names: string[], on: boolean) => void
  setPanelCollapsed: (collapsed: boolean) => void
  requestFocus: (taskId: string) => void
}

function assignColors(checked: string[], existing: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  const used = new Set<number>()
  for (const id of checked) {
    if (existing[id] !== undefined && !used.has(existing[id])) {
      out[id] = existing[id]
      used.add(existing[id])
    }
  }
  for (const id of checked) {
    if (out[id] !== undefined) continue
    let i = 0
    while (used.has(i) && i < TASK_PALETTE.length) i++
    if (i >= TASK_PALETTE.length) i = checked.indexOf(id) % TASK_PALETTE.length
    out[id] = i
    used.add(i)
  }
  return out
}

export const useMapOverlayStore = create<MapOverlayState>()(
  persist(
    (set) => ({
      checkedTaskIds: [],
      colorIndexByTask: {},
      layers: DEFAULT_LAYERS,
      lootGroups: {},
      panelCollapsed: false,
      focusRequest: null,
      setTaskChecked: (taskId, checked) =>
        set((s) => {
          const has = s.checkedTaskIds.includes(taskId)
          if (has === checked) return s
          const checkedTaskIds = checked ? [...s.checkedTaskIds, taskId] : s.checkedTaskIds.filter((id) => id !== taskId)
          return { checkedTaskIds, colorIndexByTask: assignColors(checkedTaskIds, s.colorIndexByTask) }
        }),
      setTasksChecked: (taskIds, checked) =>
        set((s) => {
          const set_ = new Set(s.checkedTaskIds)
          for (const id of taskIds) {
            if (checked) set_.add(id)
            else set_.delete(id)
          }
          const checkedTaskIds = [...set_]
          return { checkedTaskIds, colorIndexByTask: assignColors(checkedTaskIds, s.colorIndexByTask) }
        }),
      clearChecked: () => set({ checkedTaskIds: [], colorIndexByTask: {} }),
      toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
      setLootGroup: (name, on) => set((s) => ({ lootGroups: { ...s.lootGroups, [name]: on } })),
      setLootGroups: (names, on) =>
        set((s) => {
          const next = { ...s.lootGroups }
          for (const n of names) next[n] = on
          return { lootGroups: next }
        }),
      setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
      requestFocus: (taskId) => set({ focusRequest: { taskId, nonce: Date.now() } }),
    }),
    {
      name: 'tarkov-companion-map-overlay',
      version: 2,
      migrate: (persisted) => persisted as MapOverlayState,
      partialize: (s) => ({
        checkedTaskIds: s.checkedTaskIds,
        colorIndexByTask: s.colorIndexByTask,
        layers: s.layers,
        lootGroups: s.lootGroups,
        panelCollapsed: s.panelCollapsed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MapOverlayState> & { layers?: Record<string, boolean> }
        const layers: Record<OverlayLayerId, boolean> = { ...DEFAULT_LAYERS }
        for (const k of Object.keys(DEFAULT_LAYERS) as OverlayLayerId[]) if (typeof p.layers?.[k] === 'boolean') layers[k] = p.layers[k]
        return {
          ...current,
          checkedTaskIds: p.checkedTaskIds ?? [],
          colorIndexByTask: p.colorIndexByTask ?? {},
          lootGroups: p.lootGroups ?? {},
          panelCollapsed: p.panelCollapsed ?? false,
          layers,
          focusRequest: null,
        }
      },
    },
  ),
)

export const taskColor = (index: number | undefined) => TASK_PALETTE[(index ?? 0) % TASK_PALETTE.length]
