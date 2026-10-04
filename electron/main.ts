/**
 * Tarkov Companion desktop shell: main window + tray + overlay window + the
 * read-only EFT log watcher. The React app runs in the renderer with
 * contextIsolation; the only bridge is the typed API in preload.ts.
 *
 * Nothing here touches the game: the overlay is an ordinary always-on-top
 * window (works with the game in borderless windowed mode).
 */
import { BrowserWindow, Menu, Tray, app, dialog, globalShortcut, ipcMain, nativeImage, protocol, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopSettings, GameEvent, WipeEvent } from '../src/shared/desktop-api'
import { detectLogsFolder } from './logs/locator'
import { LogWatcher } from './logs/watcher'
import { SettingsStore } from './settings'
import { captureScreenUnderCursor, listGameScreenshots, readAppResource, readGameScreenshot, resourceResponse } from './capture'

// Read-only access to the app's own bundled scanner/OCR files (the page is a local file and
// Chromium cannot fetch() file:// URLs). Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'tcres', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
import { checkForUpdates, getUpdateOutcome, getUpdateStatus, installUpdate, setupUpdater } from './updater'

const DEV_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null
let overlay: BrowserWindow | null = null
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

/** Sends to every open renderer (main + overlay). */
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  load(win, '/')
}

function showWindow() {
  if (!win) return
  if (!win.isVisible()) win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

/** Small frameless always-on-top window showing the map, timers and item lookup. */
function toggleOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    if (overlay.isVisible()) overlay.hide()
    else overlay.show()
    return
  }
  const b = settings.get().overlay
  overlay = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    minWidth: 320,
    minHeight: 240,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    title: 'Tarkov Companion overlay',
    backgroundColor: '#0c0c0b',
    icon: appIcon(),
    opacity: settings.get().overlayOpacity,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ['--tc-window=overlay', `--tc-version=${app.getVersion()}`],
    },
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true)
  const saveBounds = () => {
    if (overlay && !overlay.isDestroyed()) settings.update({ overlay: overlay.getBounds() })
  }
  overlay.on('resize', saveBounds)
  overlay.on('move', saveBounds)
  overlay.on('closed', () => {
    overlay = null
  })
  load(overlay, '/overlay')
}

function applyOverlayOpacity() {
  if (overlay && !overlay.isDestroyed()) overlay.setOpacity(settings.get().overlayOpacity)
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
  tryRegister(settings.get().overlayHotkey, toggleOverlay)
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
      { label: 'Toggle overlay', click: toggleOverlay },
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
  if (patch.overlayHotkey !== undefined || patch.scanHotkey !== undefined) registerHotkey()
  if (patch.overlayOpacity !== undefined) applyOverlayOpacity()
  broadcast('watcher:state', watcher.getState())
  broadcast('settings:changed', settings.getPublic())
  return settings.getPublic()
}

function registerIpc() {
  ipcMain.handle('watcher:getState', () => watcher.getState())
  ipcMain.handle('settings:get', () => settings.getPublic())
  ipcMain.handle('settings:set', (_e, patch: Partial<DesktopSettings>) => updateSettings(patch ?? {}))
  ipcMain.handle('watcher:recent', () => watcher.getRecentEvents())
  ipcMain.handle('overlay:toggle', () => toggleOverlay())
  ipcMain.handle('overlay:close', () => {
    if (overlay && !overlay.isDestroyed()) overlay.hide()
  })
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
  ipcMain.handle('watcher:openFolder', async () => {
    const p = watcher.getState().logsPath
    if (p) await shell.openPath(p)
  })
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:outcome', () => getUpdateOutcome())
  ipcMain.handle('resource:read', (_e, rel: string) => readAppResource(String(rel), Boolean(DEV_URL)))
  ipcMain.handle('scan:capture', () => captureScreenUnderCursor())
  ipcMain.handle('scan:listShots', () => listGameScreenshots())
  ipcMain.handle('scan:readShot', (_e, name: string) => readGameScreenshot(String(name)))
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (/^https?:/i.test(url)) await shell.openExternal(url)
  })
}
