/** Tiny JSON settings store in Electron's userData folder. */
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopSettings } from '../src/shared/desktop-api'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

export interface StoredSettings extends DesktopSettings {
  window: WindowBounds
  overlay: WindowBounds
}

export const DEFAULT_SETTINGS: StoredSettings = {
  logsPath: null,
  startWithWindows: false,
  startMinimized: false,
  minimizeToTray: true,
  openMapOnRaid: true,
  initialBackfillDone: false,
  paused: false,
  overlayHotkey: 'Control+Shift+T',
  overlayOpacity: 0.9,
  knownProfileId: null,
  knownGameVersion: null,
  window: { width: 1360, height: 860 },
  overlay: { width: 560, height: 480 },
}

export class SettingsStore {
  private file: string
  private data: StoredSettings

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'settings.json')
    this.data = { ...DEFAULT_SETTINGS }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoredSettings>
      this.data = {
        ...DEFAULT_SETTINGS,
        ...raw,
        window: { ...DEFAULT_SETTINGS.window, ...(raw.window ?? {}) },
        overlay: { ...DEFAULT_SETTINGS.overlay, ...(raw.overlay ?? {}) },
      }
    } catch {
      // first run
    }
  }

  get(): StoredSettings {
    return { ...this.data, window: { ...this.data.window } }
  }

  /** The renderer-facing subset (no window bounds). */
  getPublic(): DesktopSettings {
    const { window: _w, overlay: _o, ...rest } = this.data
    return rest
  }

  update(patch: Partial<StoredSettings>): StoredSettings {
    this.data = {
      ...this.data,
      ...patch,
      window: { ...this.data.window, ...(patch.window ?? {}) },
      overlay: { ...this.data.overlay, ...(patch.overlay ?? {}) },
    }
    this.save()
    return this.get()
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    } catch {
      // Not fatal: settings just won't persist this time.
    }
  }
}
