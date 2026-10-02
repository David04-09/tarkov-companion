import { AlertTriangle, RefreshCw } from 'lucide-react'
import { describeError } from '../lib/errors'

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-surface-2 px-6 py-16 text-ink-muted">
      <RefreshCw className="h-6 w-6 animate-spin text-accent" aria-hidden />
      <p className="text-sm">Loading {label} from tarkov.dev…</p>
    </div>
  )
}

export function ErrorPanel({
  error,
  onRetry,
  retrying,
}: {
  error: unknown
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 px-5 py-5"
    >
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden />
        <h2 className="font-semibold">Could not load data</h2>
      </div>
      <p className="text-sm text-ink">{describeError(error)}</p>
      <p className="text-xs text-ink-muted">
        The app retries automatically every minute while the tarkov.dev API is unavailable.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-2 rounded border border-line bg-surface-3 px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden />
        Try again
      </button>
    </div>
  )
}

/** Shown when cached data is on screen but the latest background refresh failed. */
export function RefreshErrorBanner({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-ink"
    >
      <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
      <span>
        Showing cached data. The latest refresh failed: {describeError(error)}
      </span>
      <button type="button" onClick={onRetry} className="underline hover:text-accent">
        Retry now
      </button>
    </div>
  )
}
