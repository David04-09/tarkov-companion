/**
 * Tarkov Companion desktop shell: main window + tray + the read-only EFT log
 * watcher. The React app runs in the renderer with
 * contextIsolation; the only bridge is the typed API in preload.ts.
 *
 * Nothing here touches the game, and nothing is shown on top of it (the old
 * overlay window was removed in 1.8.0).
 */
import { BrowserWindow, Menu, Tray, app, dialog, globalShortcut, ipcMain, nativeImage, protocol, session, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopSettings, GameEvent, LogStatsData, WipeEvent } from '../src/shared/desktop-api'
import { detectLogsFolder } from './logs/locator'
import { LogWatcher } from './logs/watcher'
import { SettingsStore } from './settings'
import { latestPosition, watchScreenshots } from './position'
import { backupDir, listBackups, readBackup, writeBackup } from './backups'
import { captureScreenUnderCursor, listGameScreenshots, readAppResource, readGameScreenshot, resourceResponse } from './capture'

// Read-only access to the app's own bundled scanner/OCR files (the page is a local file and
// Chromium cannot fetch() file:// URLs). Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'tcres', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
import { checkForUpdates, getUpdateOutcome, getUpdateStatus, installUpdate, runInstallerManually, setUpdateMode, setupUpdater } from './updater'
import { cleanSettingsPatch, isSafeDirectory, isTrustedSender, isWebUrl, lockPermissions } from './security'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
/** Same as build.appId in package.json (the installer gives the shortcuts this id). The installer
 *  itself keeps its original id (build.nsis.guid) so updates replace existing installs in place. */
const APP_USER_MODEL_ID = 'io.github.david04-09.tarkov-companion'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let settings: SettingsStore
const watcher = new LogWatcher()
let stopScreenshots: (() => void) | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(bootstrap)
}

function resourcePath(...p: string[]): string {
  return path.join(__dirname, '..', ...p)
}

function appIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resourcePath('build', 'icon.png'))
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

/** Sends to every open renderer window. */
function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

function bootstrap() {
  // Same id as the installer's shortcuts, so Windows shows the app's notifications under its name.
  if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID)
  protocol.handle('tcres', (req) => resourceResponse(req.url, Boolean(DEV_URL)))
  lockPermissions(session.defaultSession)
  // Installed builds: no menu (it carries Reload and the developer tools).
  if (app.isPackaged) Menu.setApplicationMenu(null)
  settings = new SettingsStore(app.getPath('userData'))
  const startHidden = settings.get().startMinimized || process.argv.includes('--minimized')

  createWindow(!startHidden)
  createTray()
  registerIpc()
  registerHotkey()
  setupUpdater(broadcast, settings.get().updateMode)
  applyWatcherSettings()
  app.setLoginItemSettings({ openAtLogin: settings.get().startWithWindows, args: ['--minimized'] })

  watcher.on('event', (e: GameEvent) => {
    broadcast('watcher:event', e)
    detectWipe(e)
  })
  watcher.on('state', (s) => broadcast('watcher:state', s))
  applyPositionTracking()

  app.on('before-quit', () => {
    quitting = true
    watcher.stop()
    globalShortcut.unregisterAll()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && quitting) app.quit()
  })
  app.on('activate', () => showWindow())
  // No embedded browsers and no pop-up windows, whatever a page tries.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

/** "Where am I": positions from the names of new in-game screenshots (read-only), if switched on. */
function applyPositionTracking() {
  const on = settings.get().trackPosition
  if (on && !stopScreenshots) stopScreenshots = watchScreenshots((p) => broadcast('position:new', p))
  if (!on && stopScreenshots) {
    stopScreenshots()
    stopScreenshots = null
  }
}

// ---------------------------------------------------------------------------
// Wipe detection: a new profile id, or a jump in the game's major version.
// ---------------------------------------------------------------------------

function majorVersion(v: string): string {
  const parts = v.split('.')
  return parts.slice(0, 2).join('.')
}

function detectWipe(e: GameEvent) {
  const s = settings.get()
  if (e.kind === 'profile') {
    if (s.knownProfileId && s.knownProfileId !== e.profileId) {
      const ev: WipeEvent = { reason: 'profile', previous: s.knownProfileId, current: e.profileId }
      settings.update({ knownProfileId: e.profileId })
      broadcast('wipe:detected', ev)
    } else if (!s.knownProfileId) {
      settings.update({ knownProfileId: e.profileId })
    }
  } else if (e.kind === 'gameVersion') {
    if (s.knownGameVersion && majorVersion(s.knownGameVersion) !== majorVersion(e.version)) {
      const ev: WipeEvent = { reason: 'version', previous: s.knownGameVersion, current: e.version }
      settings.update({ knownGameVersion: e.version })
      broadcast('wipe:detected', ev)
    } else if (!s.knownGameVersion || s.knownGameVersion !== e.version) {
      settings.update({ knownGameVersion: e.version })
    }
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function rendererUrl(hash: string): { url?: string; file?: string } {
  if (DEV_URL) return { url: `${DEV_URL}#${hash}` }
  return { file: resourcePath('dist', 'index.html') }
}

function load(w: BrowserWindow, hash: string) {
  const target = rendererUrl(hash)
  if (target.url) void w.loadURL(target.url)
  else void w.loadFile(target.file as string, { hash })
}

/**
 * Windows only ever show the app itself: navigating to any other page (a link that slipped
 * through, a redirect) is blocked, and web links open in the user's browser instead.
 */
function lockNavigation(w: BrowserWindow) {
  w.webContents.on('will-navigate', (e, url) => {
    if (isOwnUrl(url)) return
    e.preventDefault()
    if (isWebUrl(url)) void shell.openExternal(url)
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

/** The app's own page: exactly its index.html (any #route), or the dev server. Not any local file. */
function isOwnUrl(url: string): boolean {
  if (DEV_URL) return url.startsWith(DEV_URL)
  const own = pathToFileURL(resourcePath('dist', 'index.html')).href
  return url.split('#')[0].split('?')[0].toLowerCase() === own.toLowerCase()
}

function createWindow(show: boolean) {
  const b = settings.get().window
  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    minWidth: 900,
    minHeight: 600,
    show,
    title: 'Tarkov Companion',
    backgroundColor: '#0c0c0b',
    icon: appIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
      additionalArguments: ['--tc-window=main', `--tc-version=${app.getVersion()}`],
    },
  })
  if (b.maximized) win.maximize()

  const saveBounds = () => {
    if (!win) return
    const maximized = win.isMaximized()
    const bounds = maximized ? settings.get().window : win.getBounds()
    settings.update({ window: { ...bounds, maximized } })
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('close', (e) => {
    if (quitting) return
    if (settings.get().minimizeToTray) {
      e.preventDefault()
      win?.hide()
      // Tell people once where the window went, so closing never looks like a crash.
      if (!settings.get().trayNoticeShown && tray) {
        tray.displayBalloon({
          title: 'Tarkov Companion is still running',
          content: 'It keeps tracking your quests from the tray. Right-click the tray icon to open it again or quit.',
          iconType: 'info',
        })
        settings.update({ trayNoticeShown: true })
      }
    } else {
      quitting = true
    }
  })
  lockNavigation(win)
  load(win, '/')
}

function showWindow() {
  if (!win) return
  if (!win.isVisible()) win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

function registerHotkey() {
  globalShortcut.unregisterAll()
  const tryRegister = (key: string, fn: () => void) => {
    if (!key) return
    try {
      globalShortcut.register(key, fn)
    } catch {
      // Invalid accelerator: ignore; the Settings screen shows the current value.
    }
  }
  tryRegister(settings.get().scanHotkey, () => void captureForScan())
}

/** Scan hotkey: capture the game screen first, then bring the app up with the scan. */
async function captureForScan() {
  try {
    const png = await captureScreenUnderCursor()
    showWindow()
    win?.webContents.send('scan:captured', png)
  } catch {
    // Capture failed (no screen permission or display): nothing to show.
  }
}

// ---------------------------------------------------------------------------
// Tray + settings + IPC
// ---------------------------------------------------------------------------

function createTray() {
  const img = nativeImage.createFromPath(resourcePath('build', 'tray.png'))
  tray = new Tray(img.isEmpty() ? appIcon().resize({ width: 16, height: 16 }) : img)
  tray.setToolTip('Tarkov Companion')
  tray.on('double-click', showWindow)
  refreshTrayMenu()
}

function refreshTrayMenu() {
  if (!tray) return
  const paused = settings.get().paused
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Tarkov Companion', click: showWindow },
      { label: paused ? 'Resume log watching' : 'Pause log watching', click: () => updateSettings({ paused: !settings.get().paused }) },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}

function applyWatcherSettings() {
  const s = settings.get()
  const detected = detectLogsFolder()
  // A saved folder that is gone (or was never a folder) falls back to the detected one.
  const custom = s.logsPath && isSafeDirectory(s.logsPath) ? s.logsPath : null
  watcher.configure({ logsPath: custom ?? detected.path, detectedPath: detected.path, paused: s.paused })
  refreshTrayMenu()
}

function updateSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const before = settings.get()
  settings.update(patch)
  const after = settings.get()
  if (patch.startWithWindows !== undefined && patch.startWithWindows !== before.startWithWindows) {
    app.setLoginItemSettings({ openAtLogin: after.startWithWindows, args: ['--minimized'] })
  }
  if (patch.logsPath !== undefined || patch.paused !== undefined) applyWatcherSettings()
  if (patch.scanHotkey !== undefined) registerHotkey()
  if (patch.updateMode !== undefined) setUpdateMode(after.updateMode)
  if (patch.trackPosition !== undefined) applyPositionTracking()
  broadcast('watcher:state', watcher.getState())
  broadcast('settings:changed', settings.getPublic())
  return settings.getPublic()
}

function registerIpc() {
  // Every request must come from the app's own page; anything else is refused.
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrustedSender(e.sender, isOwnUrl)) throw new Error('Refused')
      return fn(e, ...args)
    })
  handle('watcher:getState', () => watcher.getState())
  handle('settings:get', () => settings.getPublic())
  handle('settings:set', (_e, patch: unknown) => updateSettings(cleanSettingsPatch(patch)))
  handle('watcher:recent', () => watcher.getRecentEvents())
  handle('watcher:pickFolder', async () => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: 'Select the Escape from Tarkov Logs folder',
      properties: ['openDirectory'],
      defaultPath: watcher.getState().logsPath ?? undefined,
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const picked = res.filePaths[0]
    updateSettings({ logsPath: picked })
    return picked
  })
  handle('watcher:backfill', async () => {
    const result = await watcher.backfillAsync((p) => broadcast('watcher:backfillProgress', p))
    settings.update({ initialBackfillDone: true })
    const summary = {
      at: new Date().toISOString(),
      logsPath: watcher.getState().logsPath,
      folders: result.folders,
      files: result.files,
      events: result.events.length,
      finishedTasks: {
        pvp: result.finishedByMode.regular.length,
        pve: result.finishedByMode.pve.length,
        seasonal: result.finishedByMode.seasonal.length,
        unknownMode: result.finishedByMode.unknown.length,
      },
    }
    console.log('[backfill]', JSON.stringify(summary))
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'last-backfill.json'), JSON.stringify(summary, null, 2))
    } catch {
      // not fatal
    }
    return result
  })
  // Stats tab: the same read-only pass over all log folders, without touching settings.
  handle('stats:read', async (): Promise<LogStatsData> => {
    const result = await watcher.backfillAsync()
    const keep = new Set(['mapLoading', 'raidMatched', 'raidStarted', 'raidEnded', 'matchingAborted', 'fleaSold', 'fleaExpired', 'fleaRating', 'taskFinished', 'taskStarted', 'taskFailed'])
    const sessions = result.sessions ?? []
    return {
      events: result.events.filter((e) => keep.has(e.kind)),
      sessions,
      accountId: watcher.getState().accountId ?? null,
      from: sessions.length ? Math.min(...sessions.map((s) => s.start)) : null,
      to: sessions.length ? Math.max(...sessions.map((s) => s.end)) : null,
      resetAtByMode: result.resetAtByMode ?? { regular: null, pve: null, seasonal: null, unknown: null },
    }
  })
  handle('watcher:openFolder', async () => {
    // openPath runs files: only ever open a real folder.
    const p = watcher.getState().logsPath
    if (isSafeDirectory(p)) await shell.openPath(p)
  })
  handle('update:status', () => getUpdateStatus())
  handle('update:check', () => checkForUpdates())
  handle('update:install', () => installUpdate())
  handle('update:outcome', () => getUpdateOutcome())
  handle('position:latest', () => latestPosition())
  handle('backup:write', (_e, json: unknown) => {
    if (typeof json !== 'string') throw new Error('Not a backup')
    return writeBackup(app.getPath('userData'), json, new Date(), settings.get().backupKeep)
  })
  handle('backup:list', () => listBackups(app.getPath('userData')))
  handle('backup:read', (_e, name: unknown) => readBackup(app.getPath('userData'), String(name)))
  handle('backup:openFolder', async () => {
    const dir = backupDir(app.getPath('userData'))
    fs.mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })
  handle('update:runInstaller', (_e, version: unknown) => {
    if (typeof version === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) runInstallerManually(version)
  })
  handle('resource:read', (_e, rel: unknown) => {
    if (typeof rel !== 'string' || rel.length > 300) throw new Error('Not allowed')
    return readAppResource(rel, Boolean(DEV_URL))
  })
  handle('scan:capture', () => captureScreenUnderCursor())
  handle('scan:listShots', () => listGameScreenshots())
  handle('scan:readShot', (_e, name: unknown) => readGameScreenshot(String(name)))
  handle('shell:openExternal', async (_e, url: unknown) => {
    if (isWebUrl(url)) await shell.openExternal(url)
  })
}
