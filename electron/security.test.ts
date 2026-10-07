import os from 'node:os'
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalPath, cleanSettingsPatch, isAccelerator, isSafeDirectory, isSameFileUrl, isScreenshotName, isWebUrl } from './security'

describe('settings from the page', () => {
  it('keeps only known fields with valid values', () => {
    const patch = cleanSettingsPatch({
      paused: true,
      startWithWindows: 'yes',
      window: { width: 1 },
      trayNoticeShown: true,
      knownProfileId: 'x',
      updateMode: 'notify',
      backupKeep: 500,
      scanHotkey: 'Alt+Shift+S',
    })
    expect(patch).toEqual({ paused: true, updateMode: 'notify', scanHotkey: 'Alt+Shift+S' })
  })

  it('refuses a logs "folder" that is a file, a share or relative', () => {
    expect(cleanSettingsPatch({ logsPath: 'C:\\Windows\\System32\\calc.exe' })).toEqual({})
    expect(cleanSettingsPatch({ logsPath: '\\\\evil-host\\share\\x' })).toEqual({})
    expect(cleanSettingsPatch({ logsPath: 'relative\\dir' })).toEqual({})
    expect(cleanSettingsPatch({ logsPath: null })).toEqual({ logsPath: null })
    expect(cleanSettingsPatch({ logsPath: os.tmpdir() })).toEqual({ logsPath: os.tmpdir() })
  })

  it('ignores junk', () => {
    expect(cleanSettingsPatch(null)).toEqual({})
    expect(cleanSettingsPatch([1, 2])).toEqual({})
    expect(cleanSettingsPatch('paused')).toEqual({})
  })
})

describe('checks', () => {
  it('accelerators need a modifier and one key', () => {
    expect(isAccelerator('Alt+Shift+S')).toBe(true)
    expect(isAccelerator('Ctrl+F5')).toBe(true)
    expect(isAccelerator('')).toBe(true)
    expect(isAccelerator('S')).toBe(false)
    expect(isAccelerator('Alt+Alt+S')).toBe(false)
    expect(isAccelerator('Alt+Shift+S+D')).toBe(false)
    expect(isAccelerator(42)).toBe(false)
  })

  it('only web links leave the app', () => {
    expect(isWebUrl('https://tarkov.dev/players/pve/1')).toBe(true)
    expect(isWebUrl('http://example.com')).toBe(true)
    expect(isWebUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
    expect(isWebUrl('ms-settings:privacy')).toBe(false)
    expect(isWebUrl('not a url')).toBe(false)
  })

  it('screenshot names are plain image files', () => {
    expect(isScreenshotName('2026-10-06[22-48]_123.4, 5.6, 7.8_0.1, 0.2, 0.3, 0.9_1.23 (0).png')).toBe(true)
    expect(isScreenshotName('..\\..\\secret.png')).toBe(false)
    expect(isScreenshotName('shot.png:stream')).toBe(false)
    expect(isScreenshotName('notes.txt')).toBe(false)
  })

  it('folders must exist and be local', () => {
    expect(isSafeDirectory(os.tmpdir())).toBe(true)
    expect(isSafeDirectory('C:\\definitely\\not\\here\\12345')).toBe(false)
    expect(isSafeDirectory(undefined)).toBe(false)
  })
})

describe('own page check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-own-'))
  const page = path.join(dir, 'app.asar', 'dist', 'index.html')
  it('matches the same file however Windows spells the folder', () => {
    // os.tmpdir() is often the short 8.3 form ("DAVID-~1"); realpath gives the long one.
    const long = path.join(fs.realpathSync.native(dir), 'app.asar', 'dist', 'index.html')
    expect(canonicalPath(page)).toBe(canonicalPath(long))
    expect(isSameFileUrl(pathToFileURL(long).href + '#/maps', page)).toBe(true)
    expect(isSameFileUrl(pathToFileURL(page).href.toUpperCase().replace('FILE:', 'file:'), page)).toBe(true)
  })
  it('refuses other files and schemes', () => {
    expect(isSameFileUrl(pathToFileURL(path.join(dir, 'other.html')).href, page)).toBe(false)
    expect(isSameFileUrl('https://example.com/index.html', page)).toBe(false)
  })
})
