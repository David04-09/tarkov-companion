/**
 * Tarkov Companion desktop shell: main window + tray + the read-only EFT log
 * watcher. The React app runs in the renderer with
 * contextIsolation; the only bridge is the typed API in preload.ts.
 *
 * Nothing here touches the game, and nothing is shown on top of it (the old
 * overlay window was removed in 1.8.0).
 */
import { BrowserWindow, Menu, Tray, app, dialog, globalShortcut, ipcMain, nativeImage, protocol, shell } from 'electron'
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
import { checkForUpdates, getUpdateOutcome, getUpdateStatus, installUpdate, runInstallerManually, setupUpdater } from './updater'

const DEV_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let settings: SettingsStore
const watcher = new LogWatcher()

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
  if (process.platform === 'win32') app.setAppUserModelId('io.github.david04-09.tarkov-companion')
  protocol.handle('tcres', (req) => resourceResponse(req.url, Boolean(DEV_URL)))
  settings = new SettingsStore(app.getPath('userData'))
  const startHidden = settings.get().startMinimized || process.argv.includes('--minimized')

  createWindow(!startHidden)
  createTray()
  registerIpc()
  registerHotkey()
  setupUpdater(broadcast)
  applyWatcherSettings()
  app.setLoginItemSettings({ openAtLogin: settings.get().startWithWindows, args: ['--minimized'] })

  watcher.on('event', (e: GameEvent) => {
    broadcast('watcher:event', e)
    detectWipe(e)
  })
  watcher.on('state', (s) => broadcast('watcher:state', s))
  // "Where am I": positions from the names of new in-game screenshots (read-only).
  watchScreenshots((p) => broadcast('position:new', p))

  app.on('before-quit', () => {
    quitting = true
    watcher.stop()
    globalShortcut.unregisterAll()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && quitting) app.quit()
  })
  app.on('activate', () => showWindow())
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
  const own = (url: string) => url.startsWith('file:') || (DEV_URL ? url.startsWith(DEV_URL) : false)
  w.webContents.on('will-navigate', (e, url) => {
    if (own(url)) return
    e.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
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
  watcher.configure({ logsPath: s.logsPath ?? detected.path, detectedPath: detected.path, paused: s.paused })
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
  broadcast('watcher:state', watcher.getState())
  broadcast('settings:changed', settings.getPublic())
  return settings.getPublic()
}

function registerIpc() {
  ipcMain.handle('watcher:getState', () => watcher.getState())
  ipcMain.handle('settings:get', () => settings.getPublic())
  ipcMain.handle('settings:set', (_e, patch: Partial<DesktopSettings>) => updateSettings(patch ?? {}))
  ipcMain.handle('watcher:recent', () => watcher.getRecentEvents())
  ipcMain.handle('watcher:pickFolder', async () => {
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
  ipcMain.handle('watcher:backfill', async () => {
    const result = watcher.backfill((p) => broadcast('watcher:backfillProgress', p))
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
  ipcMain.handle('stats:read', async (): Promise<LogStatsData> => {
    const result = watcher.backfill()
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
  ipcMain.handle('watcher:openFolder', async () => {
    const p = watcher.getState().logsPath
    if (p) await shell.openPath(p)
  })
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:outcome', () => getUpdateOutcome())
  ipcMain.handle('position:latest', () => latestPosition())
  ipcMain.handle('backup:write', (_e, json: unknown) => writeBackup(app.getPath('userData'), String(json)))
  ipcMain.handle('backup:list', () => listBackups(app.getPath('userData')))
  ipcMain.handle('backup:read', (_e, name: unknown) => readBackup(app.getPath('userData'), String(name)))
  ipcMain.handle('backup:openFolder', async () => {
    const dir = backupDir(app.getPath('userData'))
    fs.mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })
  ipcMain.handle('update:runInstaller', (_e, version: unknown) => {
    if (typeof version === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) runInstallerManually(version)
  })
  ipcMain.handle('resource:read', (_e, rel: string) => readAppResource(String(rel), Boolean(DEV_URL)))
  ipcMain.handle('scan:capture', () => captureScreenUnderCursor())
  ipcMain.handle('scan:listShots', () => listGameScreenshots())
  ipcMain.handle('scan:readShot', (_e, name: string) => readGameScreenshot(String(name)))
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (/^https?:/i.test(url)) await shell.openExternal(url)
  })
}
