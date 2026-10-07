import { useCallback, useEffect, useState } from 'react'
import type { PackName } from '../shared/desktop-api'

export type PackState =
  | { status: 'ready' }
  | { status: 'downloading'; percent: number; label: string; installing: boolean }
  | { status: 'error'; message: string }

/**
 * Desktop content pack (electron/packs.ts) needed by a screen: downloads it the first time,
 * with progress. Always "ready" on the web and when no pack is needed.
 */
export function usePack(name: PackName | undefined): { state: PackState; retry: () => void } {
  const needed = Boolean(name && window.desktop?.ensurePack)
  const [state, setState] = useState<PackState>(needed ? { status: 'downloading', percent: 0, label: '', installing: false } : { status: 'ready' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!needed || !name) return
    let alive = true
    const off = window.desktop!.onPackProgress((p) => {
      if (!alive || p.name !== name || p.state === 'done') return
      setState({ status: 'downloading', percent: p.total ? Math.round((100 * p.received) / p.total) : 0, label: p.label, installing: p.state === 'installing' })
    })
    window
      .desktop!.ensurePack(name)
      .then(() => alive && setState({ status: 'ready' }))
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) }))
    return () => {
      alive = false
      off()
    }
  }, [name, needed, attempt])

  const retry = useCallback(() => {
    setState({ status: 'downloading', percent: 0, label: '', installing: false })
    setAttempt((a) => a + 1)
  }, [])
  return { state, retry }
}
