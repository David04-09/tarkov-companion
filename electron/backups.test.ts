import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listBackups, readBackup, writeBackup } from './backups'

const dirs: string[] = []
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-backup-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('backups', () => {
  it('keeps one file per day and only the newest 7', () => {
    const ud = tmp()
    for (let day = 1; day <= 10; day++) writeBackup(ud, JSON.stringify({ day }), new Date(2026, 9, day, 12))
    writeBackup(ud, JSON.stringify({ day: 10, again: true }), new Date(2026, 9, 10, 20))
    const list = listBackups(ud)
    expect(list.map((b) => b.name)).toEqual(['progress-2026-10-10.json', 'progress-2026-10-09.json', 'progress-2026-10-08.json', 'progress-2026-10-07.json', 'progress-2026-10-06.json', 'progress-2026-10-05.json', 'progress-2026-10-04.json'])
    expect(JSON.parse(readBackup(ud, 'progress-2026-10-10.json'))).toEqual({ day: 10, again: true })
  })
  it('refuses invalid JSON and odd file names', () => {
    const ud = tmp()
    expect(() => writeBackup(ud, '{oops')).toThrow()
    expect(() => readBackup(ud, '../settings.json')).toThrow()
  })
})
