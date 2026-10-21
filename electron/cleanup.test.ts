import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanLeftovers, oldInstallerNames, stalePackDirs } from './cleanup'

describe('oldInstallerNames', () => {
  it('picks only release files of older versions', () => {
    const names = [
      'TarkovCompanion-Setup-1.17.0.exe',
      'TarkovCompanion-Setup-1.17.0.exe.blockmap',
      'TarkovCompanion-1.9.0-portable.exe',
      'TarkovCompanion-Setup-1.18.0.exe',
      'TarkovCompanion-Setup-1.19.0.exe',
      'TarkovCompanion-Setup-1.17.0 (1).exe',
      'TarkovCompanion-Setup-1.17.0.exe.txt',
      'SomethingElse-Setup-1.0.0.exe',
    ]
    expect(oldInstallerNames(names, '1.18.0')).toEqual(['TarkovCompanion-Setup-1.17.0.exe', 'TarkovCompanion-Setup-1.17.0.exe.blockmap', 'TarkovCompanion-1.9.0-portable.exe'])
  })
})

describe('stalePackDirs', () => {
  it('keeps current packs and unknown folders', () => {
    const keep = new Set(['scan-0123456789abcdef'])
    expect(stalePackDirs(['scan-0123456789abcdef', 'scan-fedcba9876543210', 'lighthouse-aaaaaaaaaaaaaaaa.tmp', 'notes', 'scan-short'], keep)).toEqual(['scan-fedcba9876543210', 'lighthouse-aaaaaaaaaaaaaaaa.tmp'])
  })
})

describe('cleanLeftovers', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-cleanup-'))
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('measures in a dry run and removes for real otherwise', async () => {
    const updater = path.join(tmp, 'updater')
    const downloads = path.join(tmp, 'Downloads')
    fs.mkdirSync(path.join(updater, 'pending'), { recursive: true })
    fs.writeFileSync(path.join(updater, 'pending', 'TarkovCompanion-Setup-1.17.0.exe'), 'x'.repeat(100))
    fs.mkdirSync(downloads)
    fs.writeFileSync(path.join(downloads, 'TarkovCompanion-Setup-1.17.0.exe'), 'y'.repeat(50))
    fs.writeFileSync(path.join(downloads, 'holiday.jpg'), 'z')
    const trashed: string[] = []
    const places = { currentVersion: '1.18.0', updaterCacheDir: updater, packs: null, crashReportsDir: path.join(tmp, 'none'), downloadsDir: downloads, runningExe: null, trash: async (f: string) => { trashed.push(f); fs.rmSync(f) } }

    const dry = await cleanLeftovers({ ...places, dry: true })
    expect(dry.bytes).toBe(150)
    expect(fs.existsSync(path.join(updater, 'pending'))).toBe(true)

    const real = await cleanLeftovers({ ...places, dry: false })
    expect(real.bytes).toBe(150)
    expect(fs.readdirSync(updater)).toEqual([])
    expect(trashed).toEqual([path.join(downloads, 'TarkovCompanion-Setup-1.17.0.exe')])
    expect(fs.readdirSync(downloads)).toEqual(['holiday.jpg'])
  })
})
