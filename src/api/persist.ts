/**
 * Keeps the TanStack Query cache in IndexedDB so the app works offline once it
 * has loaded the data once: quests, items, traders, maps, hideout and crafts
 * are served from disk and refreshed in the background when the network is
 * back. Live flea prices and the server status are deliberately not persisted.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import type { QueryClient } from '@tanstack/react-query'
import { APP_VERSION } from '../lib/app-info'

const ONE_DAY = 24 * 60 * 60 * 1000
/** Bump whenever an adapter in queries.ts changes the shape of cached data. */
const CACHE_SCHEMA = 3
/** Query key roots that are live data and must not be served from disk. */
const LIVE_ROOTS = new Set(['prices', 'status', 'logStats'])

export const persister = createAsyncStoragePersister({
  key: 'tarkov-companion-query-cache',
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  // Writes are debounced; the items document is ~17 MB of JSON.
  throttleTime: 2000,
})

export function persistOptions(client: QueryClient): Omit<PersistQueryClientOptions, 'queryClient'> & { queryClient: QueryClient } {
  return {
    queryClient: client,
    persister,
    maxAge: 30 * ONE_DAY,
    // A new app version may change the adapted shapes: start with a fresh cache.
    buster: `${APP_VERSION}-s${CACHE_SCHEMA}`,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && !LIVE_ROOTS.has(String(q.queryKey[0])),
    },
  }
}
