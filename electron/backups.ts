/**
 * Daily automatic backups of the progress file (desktop). Stored in the app's own data
 * folder (userData\backups), one file per day, the newest KEEP files kept.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { BackupInfo } from '../src/shared/desktop-api'

const KEEP = 7
const NAME_RE = /^progress-\d{4}-\d{2}-\d{2}\.json$/

export function backupDir(userData: string): string {
  return path.join(userData, 'backups')
}

export function listBackups(userData: string): BackupInfo[] {
  const dir = backupDir(userData)
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => NAME_RE.test(n))
      .map((name) => {
        const st = fs.statSync(path.join(dir, name))
        return { name, at: st.mtimeMs, size: st.size }
      })
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

/** Writes today's backup (replacing an earlier one from today) and removes the oldest beyond KEEP. */
export function writeBackup(userData: string, json: string, now = new Date(), keep = KEEP): BackupInfo {
  if (json.length > 50_000_000) throw new Error('Backup too large')
  JSON.parse(json) // only valid JSON is stored
  const dir = backupDir(userData)
  fs.mkdirSync(dir, { recursive: true })
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const name = `progress-${day}.json`
  fs.writeFileSync(path.join(dir, name), json)
  for (const old of listBackups(userData).slice(Math.max(1, keep))) fs.rmSync(path.join(dir, old.name), { force: true })
  const st = fs.statSync(path.join(dir, name))
  return { name, at: st.mtimeMs, size: st.size }
}

export function readBackup(userData: string, name: string): string {
  if (!NAME_RE.test(name)) throw new Error('Not a backup file')
  return fs.readFileSync(path.join(backupDir(userData), name), 'utf8')
}
