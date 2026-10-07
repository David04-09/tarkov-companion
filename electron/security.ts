/**
 * Hardening for the desktop shell. Everything the page asks the main process to do goes
 * through these checks: a compromised page (e.g. a bad map file from a CDN) must not be able
 * to run programs, read arbitrary files or reach the camera/microphone.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Session, WebContents } from 'electron'
import type { DesktopSettings } from '../src/shared/desktop-api'

/** Absolute local folder that exists (no network shares, no files: shell.openPath runs files). */
export function isSafeDirectory(p: unknown): p is string {
  if (typeof p !== 'string' || p.length > 1024 || !path.isAbsolute(p)) return false
  if (p.startsWith('\\\\') || p.startsWith('//')) return false
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Only real web pages leave the app (never file:, javascript:, custom protocols). */
export function isWebUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.length > 4096) return false
  try {
    const { protocol } = new URL(u)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Global hotkeys: modifiers plus one key, at least one modifier (a bare key would steal normal
 * typing system-wide).
 */
const MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta'])
const KEY = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|PrintScreen|num[0-9]|[-=[\];',./`\\])$/
export function isAccelerator(a: unknown): a is string {
  if (typeof a !== 'string') return false
  if (a === '') return true // hotkey switched off
  const parts = a.split('+')
  if (parts.length < 2 || parts.length > 4) return false
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  return mods.every((m) => MODIFIERS.has(m)) && new Set(mods).size === mods.length && KEY.test(key)
}

/** The settings the page may change, each with its own check. Internal fields are never accepted. */
const CHECKS: { [K in keyof DesktopSettings]?: (v: unknown) => boolean } = {
  logsPath: (v) => v === null || isSafeDirectory(v),
  startWithWindows: (v) => typeof v === 'boolean',
  startMinimized: (v) => typeof v === 'boolean',
  minimizeToTray: (v) => typeof v === 'boolean',
  openMapOnRaid: (v) => typeof v === 'boolean',
  paused: (v) => typeof v === 'boolean',
  setupDone: (v) => typeof v === 'boolean',
  initialBackfillDone: (v) => typeof v === 'boolean',
  scanHotkey: isAccelerator,
  updateMode: (v) => v === 'auto' || v === 'notify' || v === 'off',
  trackPosition: (v) => typeof v === 'boolean',
  backupKeep: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 60,
}

/** Keeps only known, valid fields of a settings change from the page. */
export function cleanSettingsPatch(patch: unknown): Partial<DesktopSettings> {
  const out: Record<string, unknown> = {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const check = CHECKS[k as keyof DesktopSettings]
    if (check && check(v)) out[k] = v
  }
  return out as Partial<DesktopSettings>
}

/** Plain screenshot file names only (no paths, no alternate data streams). */
export function isScreenshotName(n: unknown): n is string {
  return typeof n === 'string' && n.length < 260 && n === path.basename(n) && !n.includes(':') && /\.(png|jpe?g|bmp)$/i.test(n)
}

/**
 * The app needs exactly one browser permission: notifications (raid timers, trader restocks).
 * Everything else (camera, microphone, location, screen capture from the page, USB, …) is refused.
 * Screen capture for the scanner happens in the main process, not through the page.
 */
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write'])
export function lockPermissions(session: Session) {
  session.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  session.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
  session.setDevicePermissionHandler(() => false)
}

/** IPC calls are only answered for the app's own window(s) showing the app's own page. */
export function isTrustedSender(sender: WebContents, isOwnUrl: (url: string) => boolean): boolean {
  try {
    return !sender.isDestroyed() && isOwnUrl(sender.getURL())
  } catch {
    return false
  }
}
