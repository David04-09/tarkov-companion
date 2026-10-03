// Downloads RE3MR's Lighthouse render (the source for `npm run tiles:lighthouse`).
// Source: https://reemr.se/maps/Lighthouse/re3mrLighthouseVERT.png (CC BY-NC-SA 4.0, by re3mr / reemr.se)
// Usage:  npm run tiles:fetch   (skips the download when the file already exists)
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const URL_ = 'https://reemr.se/maps/Lighthouse/re3mrLighthouseVERT.png'
const DEST = 'assets-src/lighthouse/re3mrLighthouseVERT.png'
const MIN_BYTES = 5 * 1024 * 1024 // the real file is ~23 MB; anything smaller is an error page

if (fs.existsSync(DEST) && fs.statSync(DEST).size > MIN_BYTES) {
  console.log(`${DEST} already present (${(fs.statSync(DEST).size / 1e6).toFixed(1)} MB)`)
  process.exit(0)
}
fs.mkdirSync(path.dirname(DEST), { recursive: true })
console.log(`downloading ${URL_}`)
const res = await fetch(URL_, { headers: { 'User-Agent': 'tarkov-companion-build (map tiles; CC BY-NC-SA credit in app)' } })
if (!res.ok || !res.body) {
  console.error(`download failed: HTTP ${res.status}`)
  process.exit(1)
}
await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(DEST))
const size = fs.statSync(DEST).size
if (size < MIN_BYTES) {
  fs.rmSync(DEST)
  console.error(`download too small (${size} bytes); the host may have blocked the request`)
  process.exit(1)
}
console.log(`saved ${DEST} (${(size / 1e6).toFixed(1)} MB)`)
