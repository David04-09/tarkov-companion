import { useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { isDesktop, useDesktopStore } from '../desktop/useDesktop'
import { APP_NAME, APP_VERSION, CREDITS, RELEASES_URL, REPO_URL } from '../lib/app-info'

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  // In the desktop app external links open in the system browser.
  if (isDesktop()) {
    return (
      <button type="button" onClick={() => void window.desktop?.openExternal(href)} className="inline-flex items-center gap-0.5 underline hover:text-accent">
        {children}
      </button>
    )
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline hover:text-accent">
      {children}
    </a>
  )
}

function UpdateLine() {
  const status = useDesktopStore((s) => s.updateStatus)
  const [busy, setBusy] = useState(false)
  if (!isDesktop()) return null
  const text = (() => {
    switch (status?.state) {
      case 'checking':
        return 'Checking for updates…'
      case 'downloading':
        return `Downloading ${status.version ?? 'update'}… ${status.percent}%`
      case 'ready':
        return `Version ${status.version} is downloaded; restart to apply.`
      case 'installing':
        return `Installing ${status.version}… the app reopens by itself in about a minute.`
      case 'available':
        return `Version ${status.version} is available; download it from GitHub (the portable exe cannot update itself).`
      case 'none':
        return 'You are up to date.'
      case 'error':
        return `Update check failed: ${status.message}`
      case 'disabled':
        return status.message
      default:
        return ''
    }
  })()
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={busy || status?.state === 'disabled'}
        onClick={() => {
          setBusy(true)
          void window.desktop?.checkForUpdates().finally(() => setBusy(false))
        }}
        className="btn !py-1"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Check for updates
      </button>
      {(status?.state === 'ready' || status?.state === 'available') && (
        <button type="button" onClick={() => void window.desktop?.installUpdate()} className="btn !py-1 border-accent text-accent">
          {status.state === 'available' ? 'Download' : 'Restart to update'}
        </button>
      )}
      <span className="text-ink-muted">{text}</span>
    </div>
  )
}

/** Version, credits with licenses and the GitHub link. Shared by web and desktop. */
export function AboutSection() {
  const version = window.desktop?.appVersion || APP_VERSION
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">About</h3>
      <p className="text-sm">
        <span className="font-semibold">{APP_NAME}</span> <span className="text-ink-muted">v{version}</span>
        {isDesktop() ? ' · desktop' : ' · web'}
      </p>
      <UpdateLine />
      {REPO_URL && (
        <p className="text-xs">
          <Link href={REPO_URL}>
            Source code and issues on GitHub <ExternalLink className="h-3 w-3" />
          </Link>
          {RELEASES_URL && (
            <>
              {' · '}
              <Link href={RELEASES_URL}>
                Downloads <ExternalLink className="h-3 w-3" />
              </Link>
            </>
          )}
        </p>
      )}
      <div className="rounded border border-success/40 bg-success/5 p-2 text-xs text-ink-muted">
        <div className="mb-1 font-semibold text-success">Never touches the game</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>No access to the game's process or memory, no injection, nothing drawn inside the game.</li>
          <li>No keyboard or mouse input is sent and no network traffic is read; nothing is written to the game folder.</li>
          <li>Quest tracking only reads the game's text log files (read-only, shared). There is no overlay: nothing is shown on top of the game.</li>
          <li>The stash scanner works on an ordinary Windows screenshot, like the Snipping Tool, Discord or OBS.</li>
        </ul>
      </div>
      <p className="text-xs text-ink-muted">Free, for personal use. Built with help from these projects:</p>
      <ul className="space-y-1 text-xs">
        {CREDITS.map((c) => (
          <li key={c.name} className="rounded border border-line bg-surface px-2 py-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link href={c.url}>{c.name}</Link>
              <span className="text-ink-dim">{c.license}</span>
            </div>
            <div className="text-ink-muted">{c.what}</div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-dim">
        Map imagery under CC BY-NC-SA 4.0 may only be shared non-commercially under the same license. Escape from Tarkov is a trademark of Battlestate Games; this app is not affiliated with them.
      </p>
    </section>
  )
}
