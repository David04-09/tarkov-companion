import { useEffect, useState } from 'react'
import { FolderOpen, FolderSearch, History, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { formatTimeAgo } from '../lib/format'
import type { DesktopSettings, GameEvent } from '../shared/desktop-api'
import { isDesktop, runBackfill, updateDesktopSettings, useDesktopStore } from './useDesktop'

function describeEvent(e: GameEvent, taskName: (id: string) => string): string {
  switch (e.kind) {
    case 'taskFinished':
      return `Completed: ${taskName(e.taskId)}`
    case 'taskStarted':
      return `Started: ${taskName(e.taskId)}`
    case 'taskFailed':
      return `Failed: ${taskName(e.taskId)}`
    case 'sessionMode':
      return `Game mode: ${e.raw}`
    case 'profile':
      return `Profile selected (…${e.profileId.slice(-6)})`
    case 'gameVersion':
      return `Game version ${e.version}`
    case 'mapLoading':
      return `Loading map ${e.scenePath.replace(/^maps\//, '').replace(/\.bundle$/, '')}`
    case 'raidMatched':
      return `Raid matched: ${e.location} (${e.online ? 'online' : 'offline'}, ${e.gameMode})`
    case 'raidStarting':
      return 'Raid starting'
    case 'raidStarted':
      return 'Raid started'
    case 'raidEnded':
      return `Raid over: ${e.location}`
    case 'matchingAborted':
      return 'Matching cancelled'
    case 'fleaSold':
      return `Flea sale: ${e.count}× item …${e.itemId.slice(-6)} to ${e.buyer}`
    case 'fleaExpired':
      return `Flea offer expired: …${e.itemId.slice(-6)}`
  }
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  )
}

/** Desktop-only part of the Settings dialog (hidden in the web build). */
export function DesktopSettingsSection() {
  const state = useDesktopStore((s) => s.state)
  const settings = useDesktopStore((s) => s.settings)
  const backfill = useDesktopStore((s) => s.backfill)
  const gameData = useGameData()
  const [events, setEvents] = useState<GameEvent[]>([])
  const [showEvents, setShowEvents] = useState(false)

  useEffect(() => {
    if (!showEvents || !window.desktop) return
    let alive = true
    const load = () => void window.desktop?.getRecentEvents().then((e) => alive && setEvents(e))
    load()
    const t = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [showEvents])

  if (!isDesktop()) return null
  const set = (patch: Partial<DesktopSettings>) => void updateDesktopSettings(patch)
  const taskName = (id: string) => gameData.data?.tasksById[id]?.name ?? `task …${id.slice(-6)}`
  const usingCustom = Boolean(settings?.logsPath)

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Game log watching</h3>
        <p className="text-xs text-ink-muted">
          Quest completions are read from Escape from Tarkov's own log files as you play. The app only reads these
          files; it never touches the game, its memory or its network traffic.
        </p>

        <div className="rounded border border-line bg-surface p-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                state?.status === 'watching' ? 'bg-success' : state?.status === 'paused' ? 'bg-accent' : 'bg-danger'
              }`}
            />
            <span className="font-medium">
              {state?.status === 'watching'
                ? 'Watching'
                : state?.status === 'paused'
                  ? 'Paused'
                  : state?.status === 'error'
                    ? (state.message ?? 'Error')
                    : 'Logs folder not found'}
            </span>
            {state?.lastEventAt && <span className="text-ink-muted">· last event {formatTimeAgo(state.lastEventAt)}</span>}
            {state?.sessionMode && state.sessionMode !== 'unknown' && (
              <span className="text-ink-muted">· game in {state.sessionMode === 'pve' ? 'PvE' : state.sessionMode === 'regular' ? 'PvP' : state.sessionMode}</span>
            )}
          </div>
          <div className="mt-1.5 break-all text-ink-muted">
            <span className="text-ink-dim">Logs folder{usingCustom ? ' (chosen by you)' : ' (auto-detected)'}: </span>
            <code className="text-ink">{state?.logsPath ?? 'none found'}</code>
          </div>
          {state?.currentFolder && (
            <div className="text-ink-dim">
              Current session: <code>{state.currentFolder}</code>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void window.desktop?.pickLogsFolder()} className="btn">
              <FolderSearch className="h-4 w-4" /> Change folder
            </button>
            {usingCustom && (
              <button type="button" onClick={() => set({ logsPath: null })} className="btn">
                <RotateCcw className="h-4 w-4" /> Use auto-detected
              </button>
            )}
            <button type="button" onClick={() => void window.desktop?.openLogsFolder()} disabled={!state?.logsPath} className="btn">
              <FolderOpen className="h-4 w-4" /> Open logs folder
            </button>
            <button type="button" onClick={() => set({ paused: !settings?.paused })} className="btn">
              {settings?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {settings?.paused ? 'Resume watching' : 'Pause watching'}
            </button>
          </div>
        </div>

        <div className="rounded border border-line bg-surface p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void runBackfill()} disabled={backfill.running || !state?.logsPath} className="btn">
              {backfill.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              Read past logs
            </button>
            <span className="text-ink-muted">Scans every old session once and adds the quests it finds as completed.</span>
          </div>
          {backfill.running && backfill.progress && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded bg-surface-3">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${backfill.progress.total ? (100 * backfill.progress.done) / backfill.progress.total : 0}%` }}
                />
              </div>
              <div className="mt-1 text-ink-dim">
                {backfill.progress.done} / {backfill.progress.total} sessions {backfill.progress.folder ? `· ${backfill.progress.folder}` : ''}
              </div>
            </div>
          )}
          {backfill.error && <p className="mt-1 text-danger">{backfill.error}</p>}
          {backfill.last && !backfill.running && (
            <p className="mt-1 text-ink-muted">
              Last read {formatTimeAgo(backfill.last.at)}: {backfill.last.folders} sessions, {backfill.last.files} files. Completed
              quests found: PvP {backfill.last.found.regular}, PvE {backfill.last.found.pve} (new to the app: PvP {backfill.last.added.regular},
              PvE {backfill.last.added.pve}).
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Toggle label="Open the map when a raid starts" value={settings?.openMapOnRaid ?? true} onChange={(v) => set({ openMapOnRaid: v })} />
          <Toggle label="Minimize to tray" hint="Closing or minimizing hides the window; use the tray icon to reopen or quit." value={settings?.minimizeToTray ?? true} onChange={(v) => set({ minimizeToTray: v })} />
          <Toggle label="Start with Windows" value={settings?.startWithWindows ?? false} onChange={(v) => set({ startWithWindows: v })} />
          <Toggle label="Start minimized to tray" value={settings?.startMinimized ?? false} onChange={(v) => set({ startMinimized: v })} />
        </div>

        <div>
          <button type="button" onClick={() => setShowEvents((v) => !v)} className="text-xs text-accent underline">
            {showEvents ? 'Hide recent events' : 'Show recent events (troubleshooting)'}
          </button>
          {showEvents && (
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded border border-line bg-surface p-2 font-mono text-[11px]">
              {events.length === 0 && <li className="text-ink-dim">No events parsed yet.</li>}
              {events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 text-ink-dim">{new Date(e.at).toLocaleTimeString()}</span>
                  <span className="shrink-0 text-ink-dim">[{e.mode === 'pve' ? 'PvE' : e.mode === 'regular' ? 'PvP' : e.mode}]</span>
                  <span className="min-w-0 truncate" title={`${e.source.file}:${e.source.line}`}>
                    {describeEvent(e, taskName)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">About</h3>
        <p className="text-xs text-ink-muted">
          Tarkov Companion {window.desktop?.appVersion ? `v${window.desktop.appVersion}` : ''}. Game data from{' '}
          <a href="https://tarkov.dev" target="_blank" rel="noreferrer" className="underline">tarkov.dev</a>. Lighthouse render by{' '}
          <a href="https://reemr.se" target="_blank" rel="noreferrer" className="underline">RE3MR</a> (CC BY-NC-SA 4.0). The log
          format knowledge comes from the open-source{' '}
          <a href="https://github.com/the-hideout/TarkovMonitor" target="_blank" rel="noreferrer" className="underline">TarkovMonitor</a>{' '}
          project (GPL-3.0); the parser here is an independent TypeScript implementation.
        </p>
      </section>
    </>
  )
}
