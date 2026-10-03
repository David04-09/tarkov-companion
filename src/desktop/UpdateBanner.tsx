import { useState } from 'react'
import { Download, X } from 'lucide-react'
import { useDesktopStore } from './useDesktop'

/** Thin bar under the top of the window: "Update available, restart to apply". */
export function UpdateBanner() {
  const status = useDesktopStore((s) => s.updateStatus)
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!status || (status.state !== 'ready' && status.state !== 'available') || dismissed === status.version) return null
  const portable = status.state === 'available'
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-info/50 bg-info/10 px-4 py-1.5 text-sm">
      <Download className="h-4 w-4 shrink-0 text-info" />
      <span className="min-w-0 flex-1">
        {portable
          ? `Tarkov Companion ${status.version} is out. This is the portable version, so download the new exe (or use the installer to get automatic updates).`
          : `Tarkov Companion ${status.version} is downloaded. It installs the next time the app restarts.`}
      </span>
      <button type="button" onClick={() => void window.desktop?.installUpdate()} className="btn !py-1">
        {portable ? 'Download' : 'Restart to update'}
      </button>
      <button type="button" onClick={() => setDismissed(status.version)} aria-label="Later" title="Later" className="text-ink-dim hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
