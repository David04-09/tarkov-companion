/**
 * Tarkov Companion desktop shell: window + tray + read-only EFT log watcher.
 * The React app runs in the renderer with contextIsolation; the only bridge is
 * the typed API in preload.ts.
 */
import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopSettings } from '../src/shared/desktop-api'
import { detectLogsFolder } from './logs/locator'
import { LogWatcher } from './logs/watcher'
import { SettingsStore } from './settings'

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
  // dist-electron/main.cjs -> project root (dev) or resources/app.asar (prod)
  return path.join(__dirname, '..', ...p)
}

function appIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resourcePath('build', 'icon.png'))
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

function bootstrap() {
  settings = new SettingsStore(app.getPath('userData'))
  const startHidden = settings.get().startMinimized || process.argv.includes('--minimized')

  createWindow(!startHidden)
  createTray()
  registerIpc()
  applyWatcherSettings()
  app.setLoginItemSettings({ openAtLogin: settings.get().startWithWindows, args: ['--minimized'] })

  watcher.on('event', (e) => win?.webContents.send('watcher:event', e))
  watcher.on('state', (s) => win?.webContents.send('watcher:state', s))

  app.on('before-quit', () => {
    quitting = true
    watcher.stop()
  })
  app.on('window-all-closed', () => {
    // Keep running in the tray; "Quit" in the tray menu exits.
    if (process.platform !== 'darwin' && quitting) app.quit()
  })
  app.on('activate', () => showWindow())
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
    } else {
      quitting = true
    }
  })
  win.on('minimize', () => {
    if (settings.get().minimizeToTray) win?.hide()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_URL) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadFile(resourcePath('dist', 'index.html'))
  }
}

function showWindow() {
  if (!win) return
  if (!win.isVisible()) win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

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
      {
        label: paused ? 'Resume log watching' : 'Pause log watching',
        click: () => {
          updateSettings({ paused: !settings.get().paused })
        },
      },
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
  win?.webContents.send('watcher:state', watcher.getState())
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
    const result = watcher.backfill((p) => win?.webContents.send('watcher:backfillProgress', p))
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
    // Also kept on disk for troubleshooting (userData/last-backfill.json).
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
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (/^https?:/i.test(url)) await shell.openExternal(url)
  })
}
