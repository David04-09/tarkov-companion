/**
 * Auto-update via GitHub Releases (electron-updater).
 *
 * The builds are not code-signed, so electron-updater's signature check is
 * off (`win.verifyUpdateCodeSignature: false` in package.json; it would be
 * skipped anyway because there is no publisherName). Trade-off: the only
 * protection is HTTPS to github.com and the GitHub account that owns the
 * repository. Anyone who can publish a release there can push an update to
 * every user. Keep the account on 2FA and do not add collaborators lightly.
 *
 * Updates download silently in the background; nothing is installed until
 * the user clicks "Restart to update" (or quits the app, when the pending
 * installer runs on exit).
 */
import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../src/shared/desktop-api'

const SIX_HOURS = 6 * 60 * 60 * 1000
const RELEASES_URL = 'https://github.com/David04-09/tarkov-companion/releases/latest'
/** electron-builder sets this when the app runs as the single-file portable exe. */
const IS_PORTABLE = Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

type Broadcast = (channel: string, payload: unknown) => void

let status: UpdateStatus = { state: 'idle' }
let broadcastFn: Broadcast = () => undefined
let timer: ReturnType<typeof setInterval> | null = null
let updater: typeof autoUpdater | null = null

/** First line only: electron-updater errors include whole HTTP header dumps. */
function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'Update check failed')
  return msg.split('\n')[0].trim().slice(0, 160) || 'Update check failed'
}

function setStatus(next: UpdateStatus) {
  status = next
  broadcastFn('update:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Wires electron-updater; a no-op in development (unpackaged) builds. */
export function setupUpdater(broadcast: Broadcast) {
  broadcastFn = broadcast
  if (!app.isPackaged) {
    setStatus({ state: 'disabled', message: 'Updates only work in the installed app.' })
    return
  }
  updater = autoUpdater
  // The portable exe cannot replace itself: only check, then offer the download page.
  autoUpdater.autoDownload = !IS_PORTABLE
  autoUpdater.autoInstallOnAppQuit = !IS_PORTABLE
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    setStatus(IS_PORTABLE ? { state: 'available', version: info.version, url: RELEASES_URL } : { state: 'downloading', version: info.version, percent: 0 }),
  )
  autoUpdater.on('download-progress', (p) => setStatus({ state: 'downloading', version: status.state === 'downloading' ? status.version : undefined, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none', checkedAt: Date.now() }))
  autoUpdater.on('error', (err) => setStatus({ state: 'error', message: shortError(err) }))

  // On launch (after a short delay so the window appears first) and every 6 hours.
  setTimeout(() => void checkForUpdates(), 10_000)
  timer = setInterval(() => void checkForUpdates(), SIX_HOURS)
  app.on('before-quit', () => {
    if (timer) clearInterval(timer)
  })
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!updater) return status
  if (status.state === 'ready' || status.state === 'downloading' || status.state === 'available') return status
  try {
    await updater.checkForUpdates()
  } catch (err) {
    setStatus({ state: 'error', message: shortError(err) })
  }
  return status
}

/** Installed app: quits and runs the downloaded installer silently, then restarts. Portable: opens the download page. */
export function installUpdate(): void {
  if (status.state === 'available') {
    void shell.openExternal(status.url)
    return
  }
  if (!updater || status.state !== 'ready') return
  setImmediate(() => updater?.quitAndInstall(true, true))
}
