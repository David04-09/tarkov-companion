import { QueryClient } from '@tanstack/react-query'

export const ONE_MINUTE = 60 * 1000
export const FIVE_MINUTES = 5 * ONE_MINUTE
export const ONE_HOUR = 60 * ONE_MINUTE

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for an hour. After that it is refetched in the background
      // while the cached copy keeps being shown.
      staleTime: ONE_HOUR,
      gcTime: 2 * ONE_HOUR,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
})
