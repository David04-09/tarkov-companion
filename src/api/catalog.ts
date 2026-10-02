import { fetchJson, TarkovApiError, type GameMode } from './client'
import { ONE_HOUR, queryClient } from './queryClient'
import type { EndpointCatalog } from './types'

export const catalogKeys = { all: ['endpoints'] as const }

/** Endpoints the app relies on today. Later: hideout, crafts, barters, prices, status. */
export const REQUIRED_ENDPOINTS = ['tasks', 'items', 'traders', 'maps'] as const

export function fetchEndpointCatalog(signal?: AbortSignal): Promise<EndpointCatalog> {
  return fetchJson<EndpointCatalog>('/endpoints', signal)
}

/** Shared, cached (1h) copy of the catalog so every data loader reads it first. */
export function getEndpointCatalog(): Promise<EndpointCatalog> {
  return queryClient.fetchQuery({
    queryKey: catalogKeys.all,
    queryFn: ({ signal }) => fetchEndpointCatalog(signal),
    staleTime: ONE_HOUR,
  })
}

/** Throws a descriptive error if the API no longer offers what we rely on. */
export function assertCatalogSupports(catalog: EndpointCatalog, gameMode: GameMode): void {
  const names = new Set(catalog.data.endpoints.map((e) => e.name))
  const missing = REQUIRED_ENDPOINTS.filter((n) => !names.has(n))
  if (missing.length > 0) {
    throw new TarkovApiError(
      `The tarkov.dev API catalog no longer lists: ${missing.join(', ')}.`,
      200,
      '/endpoints',
    )
  }
  if (!catalog.data.gameModes.includes(gameMode)) {
    throw new TarkovApiError(
      `Game mode "${gameMode}" is not offered by the API (available: ${catalog.data.gameModes.join(', ')}).`,
      200,
      '/endpoints',
    )
  }
  if (!catalog.data.languages.includes('en')) {
    throw new TarkovApiError('The API no longer offers English translations.', 200, '/endpoints')
  }
}
