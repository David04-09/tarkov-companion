/**
 * "Where am I": EFT names every in-game screenshot after the player's position and facing,
 * e.g. "2024-08-17[21-42]_-55.45, 2.30, 102.73_0.00000, -0.85211, 0.00000, 0.52335_13.07 (0).png"
 * (position x, y, z, then rotation as a quaternion x, y, z, w). This watches the screenshots
 * folder (read-only; only file names are used, images are never opened) and reports new positions.
 */
import fs from 'node:fs'
import type { PlayerPosition } from '../src/shared/desktop-api'
import { gameScreenshotsDir } from './capture'

const NUM = '(-?\\d+(?:\\.\\d+)?)'
const NAME_RE = new RegExp(`_${NUM}, ${NUM}, ${NUM}_${NUM}, ${NUM}, ${NUM}, ${NUM}_`)

/** Position and facing from an EFT screenshot file name, or null if it is not one. */
export function parseScreenshotName(name: string, at: number): PlayerPosition | null {
  const m = NAME_RE.exec(name)
  if (!m) return null
  const [x, y, z, qx, qy, qz, qw] = m.slice(1, 8).map(Number)
  if (![x, y, z, qx, qy, qz, qw].every(Number.isFinite)) return null
  // Heading around the vertical axis (Unity: y up), 0 = facing +z, clockwise seen from above.
  const yaw = (Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qx * qx + qy * qy)) * 180) / Math.PI
  return { x, y, z, yaw, at, file: name }
}

/** Newest screenshot position, if one was taken within `maxAgeMs`. */
export function latestPosition(maxAgeMs = 30 * 60_000): PlayerPosition | null {
  const dir = gameScreenshotsDir()
  try {
    let best: PlayerPosition | null = null
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g|bmp)$/i.test(name)) continue
      const at = fs.statSync(`${dir}/${name}`).mtimeMs
      if (Date.now() - at > maxAgeMs || (best && at <= best.at)) continue
      const p = parseScreenshotName(name, at)
      if (p) best = p
    }
    return best
  } catch {
    return null
  }
}

/** Calls `onPosition` for every new in-game screenshot. Returns a stop function. */
export function watchScreenshots(onPosition: (p: PlayerPosition) => void): () => void {
  const dir = gameScreenshotsDir()
  let watcher: fs.FSWatcher | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  const seen = new Set<string>()
  const start = () => {
    try {
      watcher = fs.watch(dir, (_event, name) => {
        if (!name || seen.has(name)) return
        const p = parseScreenshotName(String(name), Date.now())
        if (!p) return
        seen.add(name)
        onPosition(p)
      })
      watcher.on('error', () => {
        watcher?.close()
        watcher = null
        retry = setTimeout(start, 60_000)
      })
    } catch {
      // Folder does not exist yet (no screenshot taken so far): look again in a minute.
      retry = setTimeout(start, 60_000)
    }
  }
  start()
  return () => {
    watcher?.close()
    if (retry) clearTimeout(retry)
  }
}
