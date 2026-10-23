/**
 * Hardening for the desktop shell. Everything the page asks the main process to do goes
 * through these checks: a compromised page (e.g. a bad map file from a CDN) must not be able
 * to run programs, read arbitrary files or reach the camera/microphone.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  assistantHotkey: isAccelerator,
  updateMode: (v) => v === 'auto' || v === 'notify' || v === 'off',
  trackPosition: (v) => typeof v === 'boolean',
  backupKeep: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 60,
  cleanAfterUpdate: (v) => typeof v === 'boolean',
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
 * Everything else (camera, location, screen capture from the page, USB, …) is refused; the
 * microphone only as below.
 * Screen capture for the scanner happens in the main process, not through the page.
 */
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write'])

/**
 * The microphone, for the assistant's voice input (asked for only when the player clicks the
 * mic button or presses its hotkey; speech is recognised on this PC, nothing is sent anywhere).
 * Audio only: a request that also wants the camera, or any other media type, is refused.
 */
export function isMicOnly(permission: string, mediaTypes: readonly string[] | undefined): boolean {
  return permission === 'media' && Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every((t) => t === 'audio')
}

export function lockPermissions(session: Session) {
  session.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(ALLOWED_PERMISSIONS.has(permission) || isMicOnly(permission, 'mediaTypes' in details ? details.mediaTypes : undefined)),
  )
  session.setPermissionCheckHandler((_wc, permission, _origin, details) => ALLOWED_PERMISSIONS.has(permission) || (permission === 'media' && details.mediaType === 'audio'))
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

/**
 * One spelling per file: Windows may name the same folder in its short 8.3 form
 * ("C:\Users\DAVID-~1\...", e.g. the portable app unpacked in %TEMP%) or in full. The longest
 * existing part of the path is resolved to its real name (paths inside app.asar are not real
 * folders), then everything is lower-cased (Windows paths ignore case).
 */
export function canonicalPath(p: string): string {
  const parts = path.resolve(p).split(path.sep)
  for (let i = parts.length; i > 1; i--) {
    const head = parts.slice(0, i).join(path.sep)
    try {
      const real = fs.realpathSync.native(head)
      return path.join(real, ...parts.slice(i)).toLowerCase()
    } catch {
      // not a real file or folder (yet): try the parent
    }
  }
  return path.resolve(p).toLowerCase()
}

/** True when a file: URL points at the same file as `filePath` (any #route or ?query ignored). */
export function isSameFileUrl(url: string, filePath: string): boolean {
  if (!url.startsWith('file:')) return false
  try {
    return canonicalPath(fileURLToPath(url.split('#')[0].split('?')[0])) === canonicalPath(filePath)
  } catch {
    return false
  }
}

/** The pop-up's content comes from the page: plain strings only, short, never markup that runs. */
export function cleanPopupData(v: unknown): { title: string; text: string; lines: string[]; hint: string; autoCloseSeconds: number } | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  // Control characters dropped (line breaks kept).
  const str = (x: unknown, max: number) => (typeof x === 'string' ? [...x].filter((c) => c >= ' ' || c === '\n').join('').slice(0, max) : '')
  const text = str(o.text, 600)
  if (!text) return null
  const lines = Array.isArray(o.lines) ? o.lines.map((l) => str(l, 220)).filter(Boolean).slice(0, 12) : []
  const secs = typeof o.autoCloseSeconds === 'number' && Number.isFinite(o.autoCloseSeconds) ? Math.min(600, Math.max(0, Math.round(o.autoCloseSeconds))) : 0
  return { title: str(o.title, 140), text, lines, hint: str(o.hint, 120), autoCloseSeconds: secs }
}
