import { QueryClient } from '@tanstack/react-query'
import { prefs, usePrefs } from '../store/prefs'

export const ONE_MINUTE = 60 * 1000
export const FIVE_MINUTES = 5 * ONE_MINUTE
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR

/** Settings → Prices & data: how long game data counts as fresh. */
export const refreshMs = () => prefs().dataRefreshMinutes * ONE_MINUTE

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for an hour. After that it is refetched in the background
      // while the cached copy keeps being shown.
      staleTime: refreshMs(),
      // Kept as long as the offline copy (persist.ts maxAge): a shorter gcTime dropped data
      // unused for two hours (the other game mode, hideout) out of the offline cache.
      gcTime: 30 * ONE_DAY,
      refetchOnWindowFocus: prefs().refreshOnFocus,
      refetchOnReconnect: true,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
})

// Settings changes apply to queries from then on.
usePrefs.subscribe((p, prev) => {
  if (p.dataRefreshMinutes === prev.dataRefreshMinutes && p.refreshOnFocus === prev.refreshOnFocus) return
  const current = queryClient.getDefaultOptions()
  queryClient.setDefaultOptions({ ...current, queries: { ...current.queries, staleTime: refreshMs(), refetchOnWindowFocus: p.refreshOnFocus } })
})
