import os from 'node:os'
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalPath, cleanSettingsPatch, isAccelerator, isMicOnly, isSafeDirectory, isSameFileUrl, isScreenshotName, isWebUrl, cleanPopupData } from './security'

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

describe('microphone permission', () => {
  it('allows the microphone alone, never the camera', () => {
    expect(isMicOnly('media', ['audio'])).toBe(true)
    expect(isMicOnly('media', ['audio', 'video'])).toBe(false)
    expect(isMicOnly('media', ['video'])).toBe(false)
    expect(isMicOnly('media', [])).toBe(false)
    expect(isMicOnly('media', undefined)).toBe(false)
    expect(isMicOnly('geolocation', ['audio'])).toBe(false)
  })
})

describe('cleanPopupData', () => {
  it('keeps short plain strings and drops everything else', () => {
    expect(cleanPopupData({ title: 'Price of a GPU', text: 'About 325k.', lines: ['Flea: 325,473', 7, 'x'.repeat(500)], hint: 'Say "close that"', extra: 1 })).toEqual({
      title: 'Price of a GPU',
      text: 'About 325k.',
      lines: ['Flea: 325,473', 'x'.repeat(220)],
      hint: 'Say "close that"',
      autoCloseSeconds: 0,
    })
    expect(cleanPopupData({ text: 'x', autoCloseSeconds: 15 })?.autoCloseSeconds).toBe(15)
    expect(cleanPopupData({ text: 'x', autoCloseSeconds: 1e9 })?.autoCloseSeconds).toBe(600)
    expect(cleanPopupData({ text: 'x', autoCloseSeconds: '5' })?.autoCloseSeconds).toBe(0)
    // Cards: only known shapes, tarkov.dev pictures, sane numbers.
    const card = cleanPopupData({
      text: 'x',
      item: { name: 'Graphics card', iconLink: 'https://assets.tarkov.dev/57347ca924597744596b4e71-icon.webp', flea: 320000, trader: { name: 'Therapist', price: 200000 }, fleaLevel: 40, needed: 3, fir: true, banned: false },
      quest: { trader: 'Prapor', map: 'Customs', status: 'Available', level: 500, objectives: ['a', 7, 'b'] },
      map: { mapKey: 'customs', mapName: 'Customs', points: [{ x: 1, y: 2, z: 3, label: 'Dorms', kind: 'place' }, { x: 'no' }], path: [{ x: 1, z: 2 }] },
    })
    expect(card?.item).toMatchObject({ name: 'Graphics card', fleaLevel: 40, needed: 3, fir: true })
    expect(card?.quest).toMatchObject({ level: 99, objectives: ['a', 'b'] })
    expect(card?.map?.points).toHaveLength(1)
    expect(cleanPopupData({ text: 'x', item: { name: 'x', iconLink: 'https://evil.example/a.png' } })?.item?.iconLink).toBeNull()
    expect(cleanPopupData({ text: 'x', map: { mapKey: '../../etc', points: [{ x: 1, z: 1 }] } })?.map).toBeUndefined()
    const more = cleanPopupData({
      text: 'x',
      paused: true,
      images: [{ thumb: 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/a/ab/Debut.png', caption: 'Spot' }, { thumb: 'https://evil.example/x.png' }],
      map: { mapKey: 'customs', points: [], focus: [{ x: 1, z: 2 }], zoomDelta: 9 },
    })
    expect(more?.paused).toBe(true)
    expect(more?.images).toHaveLength(1)
    expect(more?.map).toMatchObject({ focus: [{ x: 1, y: 0, z: 2 }], zoomDelta: 4 })
    expect(cleanPopupData({ text: '' })).toBeNull()
    expect(cleanPopupData('nope')).toBeNull()
  })
})
