import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FleaSortKey = 'name' | 'flea' | 'low' | 'high' | 'change24' | 'change7d' | 'perSlot' | 'traderSell' | 'flip'

export interface FleaFilters {
  search: string
  type: string
  minPrice: string
  maxPrice: string
  minPerSlot: string
  neededOnly: boolean
  risingOnly: boolean
  /** 24h change threshold (percent) for "rising fast". */
  risingPct: number
  flipOnly: boolean
  /** 'all' | 'allowed' | 'banned' */
  fleaBan: 'all' | 'allowed' | 'banned'
  sort: { key: FleaSortKey; dir: 'asc' | 'desc' }
}

export const DEFAULT_FLEA_FILTERS: FleaFilters = {
  search: '',
  type: 'all',
  minPrice: '',
  maxPrice: '',
  minPerSlot: '',
  neededOnly: false,
  risingOnly: false,
  risingPct: 10,
  flipOnly: false,
  fleaBan: 'all',
  sort: { key: 'flea', dir: 'desc' },
}

export interface FleaState {
  filters: FleaFilters
  /** Trader ids to notify about 2 minutes before restock. */
  notifyTraderIds: string[]
  tradersCollapsed: boolean
  setFilters: (patch: Partial<FleaFilters>) => void
  resetFilters: () => void
  setNotifyTrader: (traderId: string, on: boolean) => void
  setTradersCollapsed: (collapsed: boolean) => void
}

/** Remembered Flea Market filters and trader notification choices. */
export const useFleaStore = create<FleaState>()(
  persist(
    (set) => ({
      filters: DEFAULT_FLEA_FILTERS,
      notifyTraderIds: [],
      tradersCollapsed: false,
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: DEFAULT_FLEA_FILTERS }),
      setNotifyTrader: (traderId, on) =>
        set((s) => ({ notifyTraderIds: on ? [...new Set([...s.notifyTraderIds, traderId])] : s.notifyTraderIds.filter((id) => id !== traderId) })),
      setTradersCollapsed: (tradersCollapsed) => set({ tradersCollapsed }),
    }),
    {
      name: 'tarkov-companion-flea',
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FleaState>
        return { ...current, ...p, filters: { ...DEFAULT_FLEA_FILTERS, ...(p.filters ?? {}) } }
      },
    },
  ),
)
