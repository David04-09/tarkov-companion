import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TASK_PALETTE } from '../maps/overlay/palette'

export type OverlayLayerId =
  | 'extractsPmc'
  | 'extractsScav'
  | 'transits'
  | 'locks'
  | 'spawns'
  | 'bosses'
  | 'caches'
  | 'containers'

export const OVERLAY_LAYERS: { id: OverlayLayerId; label: string; hint?: string }[] = [
  { id: 'extractsPmc', label: 'PMC extracts', hint: 'PMC and shared extracts' },
  { id: 'extractsScav', label: 'Scav extracts' },
  { id: 'transits', label: 'Transits' },
  { id: 'locks', label: 'Locked doors & trunks', hint: 'Hover for the key name' },
  { id: 'spawns', label: 'Player spawns' },
  { id: 'bosses', label: 'Boss spawns' },
  { id: 'caches', label: 'Caches & stashes' },
  { id: 'containers', label: 'Loot containers', hint: 'Can be hundreds of dots' },
]

const DEFAULT_LAYERS: Record<OverlayLayerId, boolean> = {
  extractsPmc: true,
  extractsScav: false,
  transits: true,
  locks: false,
  spawns: false,
  bosses: false,
  caches: false,
  containers: false,
}

export interface MapOverlayState {
  /** Tasks shown on the map (global: survives switching maps). */
  checkedTaskIds: string[]
  /** Palette index per checked task; recycled when a task is unchecked. */
  colorIndexByTask: Record<string, number>
  layers: Record<OverlayLayerId, boolean>
  panelCollapsed: boolean
  /** Set by the panel's Focus button; consumed by the map. */
  focusRequest: { taskId: string; nonce: number } | null
  setTaskChecked: (taskId: string, checked: boolean) => void
  setTasksChecked: (taskIds: string[], checked: boolean) => void
  clearChecked: () => void
  toggleLayer: (id: OverlayLayerId) => void
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
    // More tasks than colours: wrap around (still deterministic).
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
      setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
      requestFocus: (taskId) => set({ focusRequest: { taskId, nonce: Date.now() } }),
    }),
    {
      name: 'tarkov-companion-map-overlay',
      version: 1,
      partialize: (s) => ({
        checkedTaskIds: s.checkedTaskIds,
        colorIndexByTask: s.colorIndexByTask,
        layers: s.layers,
        panelCollapsed: s.panelCollapsed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MapOverlayState>
        return {
          ...current,
          ...p,
          layers: { ...DEFAULT_LAYERS, ...(p.layers ?? {}) },
          focusRequest: null,
        }
      },
    },
  ),
)

export const taskColor = (index: number | undefined) => TASK_PALETTE[(index ?? 0) % TASK_PALETTE.length]
