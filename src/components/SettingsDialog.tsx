import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEndpointCatalog } from '../api/hooks'
import { JSON_API_BASE } from '../api/client'
import { useProgressStore } from '../store/progress'
import { DesktopSettingsSection } from '../desktop/DesktopSettings'
import { parseDrawings, useDrawingsStore } from '../store/drawings'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const exportProgress = useProgressStore((s) => s.exportProgress)
  const importProgress = useProgressStore((s) => s.importProgress)
  const resetProgress = useProgressStore((s) => s.resetProgress)
  const gameMode = useProgressStore((s) => s.gameMode)
  const queryClient = useQueryClient()
  const catalog = useEndpointCatalog()

  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleExport = () => {
    const date = new Date().toISOString().slice(0, 10)
    // Map drawings ride along with the progress file.
    downloadJson(`tarkov-companion-progress-${date}.json`, { ...exportProgress(), drawings: useDrawingsStore.getState().byKey })
    setMessage({ kind: 'ok', text: 'Progress file downloaded (including map drawings).' })
  }

  const handleImportFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      importProgress(parsed)
      const drawings = parseDrawings((parsed as { drawings?: unknown }).drawings)
      if (drawings) useDrawingsStore.getState().importAll(drawings)
      setMessage({ kind: 'ok', text: `Imported progress${drawings ? ' and map drawings' : ''} from ${file.name}.` })
    } catch (err) {
      setMessage({
        kind: 'error',
        text: `Import failed: ${err instanceof Error ? err.message : 'invalid file'}`,
      })
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    resetProgress()
    setConfirmReset(false)
    setMessage({ kind: 'ok', text: `Progress for ${gameMode === 'pve' ? 'PvE' : 'PvP'} was reset.` })
  }

  const handleRefresh = () => {
    void queryClient.invalidateQueries()
    setMessage({ kind: 'ok', text: 'Refreshing game data in the background.' })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-line bg-surface-2 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="settings-title" className="text-base font-semibold">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 space-y-6 overflow-y-auto px-5 py-4 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Progress</h3>
            <p className="text-xs text-ink-muted">
              Your level, faction and completed quests are stored in this browser. Export a file to
              back them up or move them to another computer.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleExport} className="btn">
                <Download className="h-4 w-4" /> Export progress
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} className="btn">
                <Upload className="h-4 w-4" /> Import progress
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportFile(file)
                }}
              />
              <button
                type="button"
                onClick={handleReset}
                onBlur={() => setConfirmReset(false)}
                className={`btn ${confirmReset ? 'border-danger text-danger' : ''}`}
              >
                <Trash2 className="h-4 w-4" />
                {confirmReset ? 'Click again to confirm' : `Reset ${gameMode === 'pve' ? 'PvE' : 'PvP'} progress`}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Data source</h3>
            <p className="text-xs text-ink-muted">
              Game data comes from the tarkov.dev JSON API at{' '}
              <code className="text-ink">{JSON_API_BASE}</code> and is cached for one hour.
            </p>
            {catalog.data && (
              <p className="text-xs text-ink-muted">
                Catalog: {catalog.data.data.endpoints.length} endpoints · game modes{' '}
                {catalog.data.data.gameModes.join(', ')} · {catalog.data.data.languages.length} languages
              </p>
            )}
            {catalog.isError && (
              <p className="text-xs text-danger">Could not load the API catalog right now.</p>
            )}
            <button type="button" onClick={handleRefresh} className="btn">
              <RefreshCw className="h-4 w-4" /> Refresh game data now
            </button>
          </section>

          <DesktopSettingsSection />

          {message && (
            <p
              role="status"
              className={`rounded border px-3 py-2 text-xs ${
                message.kind === 'ok'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-danger/40 bg-danger/10 text-danger'
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
