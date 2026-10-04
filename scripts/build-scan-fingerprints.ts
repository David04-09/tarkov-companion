// Builds the stash-scanner fingerprints from tarkov.dev's item grid images.
// Output: public/scan/fingerprints.json (header) + public/scan/fingerprints.bin (RGB pixels).
// Grid images are cached in assets-src/scan/grid-cache so re-runs only fetch new items.
// Usage: npm run scan:fingerprints
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { FP, sampleRegion, type FingerprintHeader } from '../src/scan/core'

const OUT_DIR = 'public/scan'
const CACHE = 'assets-src/scan/grid-cache'
const CONCURRENCY = 24

interface RawItem {
  id: string
  width?: number
  height?: number
  gridImageLink?: string
  types?: string[]
}

const res = (await (await fetch('https://json.tarkov.dev/regular/items')).json()) as { data: { items: Record<string, RawItem> } }
// Presets duplicate their base weapon's look; skip them (the base weapon still matches).
const items = Object.values(res.data.items).filter((i) => i.gridImageLink && !(i.types ?? []).includes('preset'))
fs.mkdirSync(CACHE, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })
console.log(`${items.length} items with grid images`)

async function gridImage(item: RawItem): Promise<Buffer | null> {
  const file = path.join(CACHE, `${item.id}.webp`)
  if (fs.existsSync(file)) return fs.readFileSync(file)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(item.gridImageLink as string)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      fs.writeFileSync(file, buf)
      return buf
    } catch {
      await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1)))
    }
  }
  return null
}

const results: { id: string; w: number; h: number; px: Uint8Array }[] = []
let next = 0
let failed = 0
async function worker() {
  while (next < items.length) {
    const item = items[next++]
    const buf = await gridImage(item)
    if (!buf) {
      failed++
      continue
    }
    const w = item.width || 1
    const h = item.height || 1
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const fp = sampleRegion({ width: info.width, height: info.height, data }, 0, 0, info.width, info.height, w * FP, h * FP)
    results.push({ id: item.id, w, h, px: Uint8Array.from(fp, (v) => Math.round(v)) })
    if (results.length % 500 === 0) console.log(`  ${results.length} / ${items.length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
results.sort((a, b) => a.id.localeCompare(b.id))

const header: FingerprintHeader = { version: 1, fp: FP, generated: new Date().toISOString(), items: [] }
const total = results.reduce((n, r) => n + r.px.length, 0)
const pixels = new Uint8Array(total)
let o = 0
for (const r of results) {
  header.items.push({ id: r.id, w: r.w, h: r.h, o })
  pixels.set(r.px, o)
  o += r.px.length
}
fs.writeFileSync(path.join(OUT_DIR, 'fingerprints.json'), JSON.stringify(header))
fs.writeFileSync(path.join(OUT_DIR, 'fingerprints.bin'), pixels)
console.log(`wrote ${results.length} fingerprints (${(total / 1e6).toFixed(1)} MB), ${failed} failed`)
