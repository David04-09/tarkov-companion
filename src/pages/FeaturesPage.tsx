import { Sparkles } from 'lucide-react'
import { RELEASES, UNRELEASED } from '../data/changelog'
import { APP_VERSION } from '../lib/app-info'

/** The app's own features and fixes per version, newest first. */
export function FeaturesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Features & patches</h1>
        <p className="text-sm text-ink-muted">What changed in Tarkov Companion with every update. You have version {APP_VERSION}.</p>
      </div>

      {UNRELEASED.length > 0 && (
        <section className="rounded-lg border border-accent/50 bg-accent/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-accent"><Sparkles className="h-4 w-4" /> Coming in the next update</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {UNRELEASED.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <ol className="space-y-3">
        {RELEASES.map((r) => (
          <li key={r.version} className="rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-semibold tabular-nums">v{r.version}</span>
              <span className="font-medium">{r.title}</span>
              {r.version === APP_VERSION && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">You have this</span>}
              <span className="ml-auto text-xs text-ink-dim">{r.date}</span>
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
              {r.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
