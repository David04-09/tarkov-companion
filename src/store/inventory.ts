import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameMode } from '../api/client'
import { useProgressStore } from './progress'

/** Per-game-mode inventory bookkeeping (the game keeps PvP and PvE stashes apart). */
export interface ModeInventory {
  /** Items collected towards quests/hideout/crafts, by item id. */
  collected: Record<string, number>
  /** Key item ids the player owns. */
  ownedKeyIds: string[]
  /** Current built level per hideout station id (0 = not built). */
  stationLevels: Record<string, number>
  /** Current loyalty level per trader id (1 = default). */
  traderLevels: Record<string, number>
}

export interface InventoryState {
  byMode: Record<GameMode, ModeInventory>
  /** Crafts the player wants to keep inputs for (shared across modes). */
  favoriteCraftIds: string[]
  setCollected: (mode: GameMode, itemId: string, count: number) => void
  setKeyOwned: (mode: GameMode, keyId: string, owned: boolean) => void
  setStationLevel: (mode: GameMode, stationId: string, level: number) => void
  setTraderLevel: (mode: GameMode, traderId: string, level: number) => void
  toggleFavoriteCraft: (craftId: string) => void
}

const empty = (): ModeInventory => ({ collected: {}, ownedKeyIds: [], stationLevels: {}, traderLevels: {} })

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => {
      const update = (mode: GameMode, fn: (inv: ModeInventory) => ModeInventory) =>
        set((s) => ({ byMode: { ...s.byMode, [mode]: fn(s.byMode[mode]) } }))
      return {
        byMode: { regular: empty(), pve: empty() },
        favoriteCraftIds: [],
        setCollected: (mode, itemId, count) =>
          update(mode, (inv) => {
            const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
            const collected = { ...inv.collected }
            if (n === 0) delete collected[itemId]
            else collected[itemId] = n
            return { ...inv, collected }
          }),
        setKeyOwned: (mode, keyId, owned) =>
          update(mode, (inv) => {
            const has = inv.ownedKeyIds.includes(keyId)
            if (has === owned) return inv
            return { ...inv, ownedKeyIds: owned ? [...inv.ownedKeyIds, keyId] : inv.ownedKeyIds.filter((k) => k !== keyId) }
          }),
        setStationLevel: (mode, stationId, level) =>
          update(mode, (inv) => ({ ...inv, stationLevels: { ...inv.stationLevels, [stationId]: Math.max(0, level) } })),
        setTraderLevel: (mode, traderId, level) =>
          update(mode, (inv) => ({ ...inv, traderLevels: { ...inv.traderLevels, [traderId]: Math.max(1, Math.min(4, level)) } })),
        toggleFavoriteCraft: (craftId) =>
          set((s) => ({
            favoriteCraftIds: s.favoriteCraftIds.includes(craftId)
              ? s.favoriteCraftIds.filter((c) => c !== craftId)
              : [...s.favoriteCraftIds, craftId],
          })),
      }
    },
    {
      name: 'tarkov-companion-inventory',
      version: 2,
      migrate: (persisted) => persisted as InventoryState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<InventoryState>
        return {
          ...current,
          favoriteCraftIds: p.favoriteCraftIds ?? [],
          byMode: {
            regular: { ...empty(), ...(p.byMode?.regular ?? {}) },
            pve: { ...empty(), ...(p.byMode?.pve ?? {}) },
          },
        }
      },
    },
  ),
)

/** Inventory for the active game mode. */
export function useModeInventory(): ModeInventory {
  const mode = useProgressStore((s) => s.gameMode)
  return useInventoryStore((s) => s.byMode[mode])
}
