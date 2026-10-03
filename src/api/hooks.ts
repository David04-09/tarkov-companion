import { useQuery } from '@tanstack/react-query'
import { catalogKeys, fetchEndpointCatalog } from './catalog'
import type { GameMode } from './client'
import { fetchCrafts, fetchGameData, fetchHideout, fetchItems, fetchPriceHistory, fetchServerStatus } from './queries'
import { FIVE_MINUTES, ONE_HOUR, ONE_MINUTE } from './queryClient'
import { useProgressStore } from '../store/progress'

/** While a query is in error, poll again every minute instead of waiting an hour. */
const hourlyOrRetry = (status: 'pending' | 'error' | 'success') =>
  status === 'error' ? ONE_MINUTE : ONE_HOUR

export const gameDataKeys = {
  all: ['gameData'] as const,
  mode: (gameMode: GameMode) => ['gameData', gameMode] as const,
}
export const itemKeys = {
  all: ['items'] as const,
  mode: (gameMode: GameMode) => ['items', gameMode] as const,
}
export const priceKeys = {
  item: (gameMode: GameMode, itemId: string) => ['prices', gameMode, itemId] as const,
}

export function useEndpointCatalog() {
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: ({ signal }) => fetchEndpointCatalog(signal),
  })
}

/** Tasks, traders and maps for the game mode selected in the store. */
export function useGameData() {
  const gameMode = useProgressStore((s) => s.gameMode)
  return useQuery({
    queryKey: gameDataKeys.mode(gameMode),
    queryFn: ({ signal }) => fetchGameData(gameMode, signal),
    refetchInterval: (query) => hourlyOrRetry(query.state.status),
  })
}

/** Item catalogue (large download); pass enabled=false to defer loading. */
export function useItems(enabled = true) {
  const gameMode = useProgressStore((s) => s.gameMode)
  return useQuery({
    queryKey: itemKeys.mode(gameMode),
    queryFn: ({ signal }) => fetchItems(gameMode, signal),
    enabled,
    refetchInterval: (query) => hourlyOrRetry(query.state.status),
  })
}

export function useHideout() {
  const gameMode = useProgressStore((s) => s.gameMode)
  return useQuery({
    queryKey: ['hideout', gameMode] as const,
    queryFn: ({ signal }) => fetchHideout(gameMode, signal),
    refetchInterval: (query) => hourlyOrRetry(query.state.status),
  })
}

export function useCrafts() {
  const gameMode = useProgressStore((s) => s.gameMode)
  return useQuery({
    queryKey: ['crafts', gameMode] as const,
    queryFn: ({ signal }) => fetchCrafts(gameMode, signal),
    refetchInterval: (query) => hourlyOrRetry(query.state.status),
  })
}

export function usePriceHistory(itemId: string | null) {
  const gameMode = useProgressStore((s) => s.gameMode)
  return useQuery({
    queryKey: priceKeys.item(gameMode, itemId ?? ''),
    queryFn: ({ signal }) => fetchPriceHistory(gameMode, itemId as string, signal),
    enabled: Boolean(itemId),
    staleTime: FIVE_MINUTES,
    gcTime: 15 * ONE_MINUTE,
  })
}

export function useServerStatus() {
  return useQuery({
    queryKey: ['status'] as const,
    queryFn: ({ signal }) => fetchServerStatus(signal),
    staleTime: FIVE_MINUTES,
  })
}
