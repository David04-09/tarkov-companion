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
}

export const DEFAULT_SETTINGS: StoredSettings = {
  logsPath: null,
  startWithWindows: false,
  startMinimized: false,
  minimizeToTray: true,
  openMapOnRaid: true,
  initialBackfillDone: false,
  paused: false,
  window: { width: 1360, height: 860 },
}

export class SettingsStore {
  private file: string
  private data: StoredSettings

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'settings.json')
    this.data = { ...DEFAULT_SETTINGS }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoredSettings>
      this.data = { ...DEFAULT_SETTINGS, ...raw, window: { ...DEFAULT_SETTINGS.window, ...(raw.window ?? {}) } }
    } catch {
      // first run
    }
  }

  get(): StoredSettings {
    return { ...this.data, window: { ...this.data.window } }
  }

  /** The renderer-facing subset (no window bounds). */
  getPublic(): DesktopSettings {
    const { window: _w, ...rest } = this.data
    return rest
  }

  update(patch: Partial<StoredSettings>): StoredSettings {
    this.data = { ...this.data, ...patch, window: { ...this.data.window, ...(patch.window ?? {}) } }
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
