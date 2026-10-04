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
 *
 * The installer runs silently and takes about a minute with nothing on screen
 * (the visible NSIS installer would ask "just me / all users" on every update).
 * Opening the app during that minute makes the installer fail on locked files,
 * which looked like "it only restarted". So the app says what is happening
 * before it closes (bar + Windows notification), writes update-attempt.json,
 * and at the next launch reports whether the version actually changed.
 */
import { Notification, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdateOutcome, UpdateStatus } from '../src/shared/desktop-api'

const SIX_HOURS = 6 * 60 * 60 * 1000
const RELEASES_URL = 'https://github.com/David04-09/tarkov-companion/releases/latest'
/** electron-builder sets this when the app runs as the single-file portable exe. */
const IS_PORTABLE = Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

type Broadcast = (channel: string, payload: unknown) => void

let status: UpdateStatus = { state: 'idle' }
let broadcastFn: Broadcast = () => undefined
let timer: ReturnType<typeof setInterval> | null = null
let updater: typeof autoUpdater | null = null
let outcome: UpdateOutcome | null = null

const attemptFile = () => path.join(app.getPath('userData'), 'update-attempt.json')

/** -1, 0 or 1 for dotted version numbers. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return Math.sign(d)
  }
  return 0
}

/** Reads (once) and clears the note left by the last "Restart to update". */
function readAttempt() {
  try {
    const raw = JSON.parse(fs.readFileSync(attemptFile(), 'utf8')) as { version?: unknown; at?: unknown }
    fs.rmSync(attemptFile(), { force: true })
    if (typeof raw.version !== 'string' || typeof raw.at !== 'number' || Date.now() - raw.at > 24 * 60 * 60 * 1000) return
    outcome = { ok: compareVersions(app.getVersion(), raw.version) >= 0, version: raw.version }
  } catch {
    // no attempt pending
  }
}

export function getUpdateOutcome(): UpdateOutcome | null {
  return outcome
}

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
  readAttempt()
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
  if (status.state === 'ready' || status.state === 'downloading' || status.state === 'available' || status.state === 'installing') return status
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
  const version = status.version
  try {
    fs.writeFileSync(attemptFile(), JSON.stringify({ version, at: Date.now() }))
  } catch {
    // only used for the "updated" note at the next launch
  }
  setStatus({ state: 'installing', version })
  if (Notification.isSupported()) {
    new Notification({
      title: `Updating Tarkov Companion to ${version}`,
      body: "It closes now and opens again by itself in about a minute. Please don't open it in the meantime.",
    }).show()
  }
  // A moment to read the bar before the window closes.
  setTimeout(() => updater?.quitAndInstall(true, true), 2500)
}
