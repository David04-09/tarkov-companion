/**
 * Trader barters: GET /{gameMode}/barters (no translations needed; item and
 * trader names come from the items and traders documents).
 * Wire shape (2026-10): `data` is an array of
 *   { id, trader, taskUnlock: taskId | null, minTraderLevel, buyLimit, restockAmount,
 *     requiredItems: [{ item, count, attributes }], offeredItem: { item, count, attributes } }
 * `attributes` is {} or { minLevel } (dogtags of at least that level).
 */
import { useQuery } from '@tanstack/react-query'
import { fetchJson, type GameMode } from './client'
import { ONE_HOUR, ONE_MINUTE } from './queryClient'
import { useProgressStore } from '../store/progress'

interface RawBarterItem {
  item: string
  count?: number
  attributes?: { minLevel?: number } | null
}

interface RawBarter {
  id: string
  trader: string
  taskUnlock?: string | null
  minTraderLevel?: number
  buyLimit?: number
  requiredItems?: RawBarterItem[]
  offeredItem?: RawBarterItem | null
}

interface RawBartersDoc {
  data: RawBarter[] | Record<string, RawBarter>
}

export interface Barter {
  id: string
  traderId: string
  minTraderLevel: number
  /** Task that must be completed before the trader offers this barter. */
  taskUnlock: string | null
  /** Trades per player per restock (0 = unknown). */
  buyLimit: number
  inputs: { itemId: string; count: number; minLevel: number | null }[]
  output: { itemId: string; count: number }
}

export async function fetchBarters(gameMode: GameMode, signal?: AbortSignal): Promise<Barter[]> {
  const doc = await fetchJson<RawBartersDoc>(`/${gameMode}/barters`, signal)
  const list = Array.isArray(doc.data) ? doc.data : Object.values(doc.data ?? {})
  return list
    .filter((b) => b && b.trader && b.offeredItem?.item)
    .map((b) => ({
      id: b.id,
      traderId: b.trader,
      minTraderLevel: b.minTraderLevel ?? 1,
      taskUnlock: b.taskUnlock ?? null,
      buyLimit: typeof b.buyLimit === 'number' ? b.buyLimit : 0,
      inputs: (b.requiredItems ?? [])
        .filter((r) => r && r.item)
        .map((r) => ({
          itemId: r.item,
          count: r.count ?? 1,
          minLevel: typeof r.attributes?.minLevel === 'number' ? r.attributes.minLevel : null,
        })),
      output: { itemId: (b.offeredItem as RawBarterItem).item, count: b.offeredItem?.count ?? 1 },
    }))
}

export function useBarters() {
  const gameMode = useProgressStore((s) => s.gameMode)
  return useQuery({
    queryKey: ['barters', gameMode] as const,
    queryFn: ({ signal }) => fetchBarters(gameMode, signal),
    refetchInterval: (query) => (query.state.status === 'error' ? ONE_MINUTE : ONE_HOUR),
  })
}
