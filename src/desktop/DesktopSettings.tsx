import { useEffect, useState } from 'react'
import { FolderOpen, FolderSearch, History, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { formatTimeAgo } from '../lib/format'
import type { DesktopSettings, GameEvent } from '../shared/desktop-api'
import { useArchivesStore } from '../store/archives'
import { useProgressStore } from '../store/progress'
import { useTimersStore } from './timers'
import { isDesktop, runBackfill, updateDesktopSettings, useDesktopStore } from './useDesktop'
import { SyncHistorySection } from './SyncReview'
import { archiveAndReset } from './wipe'

function TimersSettings() {
  const sounds = useTimersStore((s) => s.soundsEnabled)
  const setSounds = useTimersStore((s) => s.setSoundsEnabled)
  const minutes = useTimersStore((s) => s.scavCooldownMinutes)
  const setMinutes = useTimersStore((s) => s.setScavCooldownMinutes)
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Timers</h3>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sounds} onChange={(e) => setSounds(e.target.checked)} className="h-4 w-4" /> Play a short sound at raid start, when the run-through window passes and when the scav cooldown ends</label>
      <label className="flex items-center gap-2 text-sm">Scav cooldown length <input type="number" min={1} max={90} value={minutes} onChange={(e) => setMinutes(e.target.valueAsNumber)} className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-sm" /> minutes</label>
    </section>
  )
}

function ArchivesSettings() {
  const archives = useArchivesStore((s) => s.archives)
  const remove = useArchivesStore((s) => s.remove)
  const importProgress = useProgressStore((s) => s.importProgress)
  const [confirm, setConfirm] = useState<string | null>(null)
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Progress archives</h3>
      <p className="text-xs text-ink-muted">Snapshots taken when a wipe was detected, or by hand. Restoring replaces your current progress.</p>
      <button
        type="button"
        onClick={() => {
          if (confirm !== 'new') {
            setConfirm('new')
            return
          }
          archiveAndReset(`Manual · ${new Date().toLocaleDateString()}`)
          setConfirm(null)
        }}
        onBlur={() => setConfirm(null)}
        className={`btn ${confirm === 'new' ? 'border-danger text-danger' : ''}`}
      >
        {confirm === 'new' ? 'Click again: archive and reset quests' : 'Archive now and start fresh'}
      </button>
      {archives.length > 0 && (
        <ul className="space-y-1 text-xs">
          {archives.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-line bg-surface px-2 py-1">
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              <span className="text-ink-dim">PvP {a.progress.profiles.regular.completedTaskIds.length} · PvE {a.progress.profiles.pve.completedTaskIds.length} done</span>
              <button type="button" onClick={() => importProgress(a.progress)} className="underline hover:text-accent">Restore</button>
              <button type="button" onClick={() => remove(a.id)} className="underline hover:text-danger">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

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
          {(state?.accountId || state?.profileId) && (
            <div className="text-ink-dim">
              Account id <code>{state.accountId ?? '?'}</code> · profile <code>{state.profileId ?? '?'}</code>
              {state.accountId && (
                <>
                  {' '}
                  ·{' '}
                  <button
                    type="button"
                    onClick={() => void window.desktop?.openExternal(`https://tarkov.dev/players/${state.sessionMode === 'pve' ? 'pve' : 'regular'}/${state.accountId}`)}
                    className="underline hover:text-accent"
                  >
                    view public profile on tarkov.dev
                  </button>
                </>
              )}
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
            <span className="text-ink-muted">Scans every old session and lists the quests you handed in, for you to confirm before anything is ticked.</span>
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
          <Toggle label="Close to tray" hint="The X button hides the window and keeps quest tracking running; use the tray icon to reopen or quit. Minimizing works as normal." value={settings?.minimizeToTray ?? true} onChange={(v) => set({ minimizeToTray: v })} />
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

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Overlay window</h3>
        <p className="text-xs text-ink-muted">
          A small always-on-top window with the current map, timers and item lookup. It is an ordinary window: use the game in
          borderless windowed mode so it can sit on top. It never interacts with the game process.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => void window.desktop?.toggleOverlay()} className="btn">Show / hide overlay</button>
          <label className="flex items-center gap-1.5">
            Hotkey
            <input
              type="text"
              defaultValue={settings?.overlayHotkey ?? 'Control+Shift+T'}
              onBlur={(e) => e.target.value.trim() && set({ overlayHotkey: e.target.value.trim() })}
              aria-label="Overlay hotkey"
              className="w-40 rounded border border-line bg-surface px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Opacity
            <input type="range" min={0.3} max={1} step={0.05} value={settings?.overlayOpacity ?? 0.9} onChange={(e) => set({ overlayOpacity: Number(e.target.value) })} aria-label="Overlay opacity" />
            {Math.round((settings?.overlayOpacity ?? 0.9) * 100)}%
          </label>
        </div>
        <p className="text-[11px] text-ink-dim">Hotkey format: Electron accelerator, e.g. Control+Shift+T or Alt+F2. Position and size are remembered.</p>
        <label className="flex flex-wrap items-center gap-1.5 text-xs">
          Stash scanner hotkey
          <input
            type="text"
            defaultValue={settings?.scanHotkey ?? 'Alt+Shift+S'}
            onBlur={(e) => e.target.value.trim() && set({ scanHotkey: e.target.value.trim() })}
            aria-label="Stash scanner hotkey"
            className="w-40 rounded border border-line bg-surface px-2 py-1 font-mono text-xs"
          />
          <span className="text-ink-dim">Captures the screen the game is on and opens the scanner with it.</span>
        </label>
      </section>

      <SyncHistorySection />
      <TimersSettings />
      <ArchivesSettings />

    </>
  )
}
