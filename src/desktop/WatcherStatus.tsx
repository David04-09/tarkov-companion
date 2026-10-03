import { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { formatTimeAgo } from '../lib/format'
import { isDesktop, useDesktopStore } from './useDesktop'

/** Sidebar footer light: green watching, amber paused, red folder missing. */
export function WatcherStatus({ compact, onClick }: { compact: boolean; onClick: () => void }) {
  const state = useDesktopStore((s) => s.state)
  const [, tick] = useState(0)
  // Re-render every 30 s so "last event: X minutes ago" stays current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!isDesktop()) return null

  const status = state?.status ?? 'no-folder'
  const color =
    status === 'watching' ? 'bg-success' : status === 'paused' ? 'bg-accent' : 'bg-danger'
  const label =
    status === 'watching'
      ? 'Watching game logs'
      : status === 'paused'
        ? 'Log watching paused'
        : status === 'error'
          ? (state?.message ?? 'Log watcher error')
          : 'Logs folder not found'
  const detail =
    status === 'watching'
      ? state?.lastEventAt
        ? `last event ${formatTimeAgo(state.lastEventAt)}`
        : 'no events yet'
      : status === 'no-folder'
        ? 'set it in Settings'
        : ''

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}${detail ? ` · ${detail}` : ''}`}
      className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <Radio className="h-4 w-4" aria-hidden />
        <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${color}`} aria-hidden />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {detail && <span className="block truncate text-[10px] text-ink-dim">{detail}</span>}
        </span>
      )}
    </button>
  )
}
