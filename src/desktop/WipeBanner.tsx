import { useState } from 'react'
import { Archive, X } from 'lucide-react'
import { archiveAndReset, useWipeBannerStore } from './wipe'

export function WipeBanner() {
  const event = useWipeBannerStore((s) => s.event)
  const dismiss = useWipeBannerStore((s) => s.dismiss)
  const [done, setDone] = useState(false)
  if (!event) return null
  const what = event.reason === 'profile' ? 'a different profile id' : `a new game version (${event.previous} → ${event.current})`
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-accent/50 bg-accent/10 px-4 py-2 text-sm">
      <Archive className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        {done ? 'Progress archived and reset. Find the archive under Settings.' : <>The game logs show {what}. That usually means a wipe. Archive your current progress and start fresh?</>}
      </span>
      {!done && (
        <button
          type="button"
          onClick={() => {
            archiveAndReset(`Before wipe (${event.reason === 'profile' ? 'new profile' : event.current}) · ${new Date().toLocaleDateString()}`)
            setDone(true)
          }}
          className="btn !py-1"
        >
          Archive & start fresh
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-ink-dim hover:text-ink"><X className="h-4 w-4" /></button>
    </div>
  )
}
