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
  shortName?: string
  types?: string[]
  properties?: { baseItem?: string }
}

const res = (await (await fetch('https://json.tarkov.dev/regular/items')).json()) as { data: { items: Record<string, RawItem> } }
const en = (await (await fetch('https://json.tarkov.dev/regular/items_en')).json()) as { data?: Record<string, string> } & Record<string, string>
const shortNames = (en.data ?? en) as Record<string, string>
// Weapons: the base item's picture is the bare receiver (AK-74N: 4x1), but a gun in the stash
// is assembled (the default AK-74N is 5x2). Every preset is a ready-made build with its own
// picture and size, so presets ship too, labelled as their base weapon (same printed name).
const all = res.data.items
// Items without a picture yet share tarkov.dev's "unknown item" placeholder: never a fingerprint.
const items = Object.values(all).filter((i) => i.gridImageLink && !i.gridImageLink.includes('/unknown-item') && (!(i.types ?? []).includes('preset') || all[i.properties?.baseItem ?? '']))
const baseOf = (i: RawItem) => ((i.types ?? []).includes('preset') ? all[i.properties?.baseItem ?? ''] : i)
const isGun = (i: RawItem) => (baseOf(i).types ?? []).includes('gun')
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

const results: { id: string; w: number; h: number; px: Uint8Array; n: string; g: boolean }[] = []
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
    const base = baseOf(item)
    results.push({ id: base.id, w, h, px: Uint8Array.from(fp, (v) => Math.round(v)), n: shortNames[base.shortName ?? ''] ?? '', g: isGun(item) })
    if (results.length % 500 === 0) console.log(`  ${results.length} / ${items.length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
results.sort((a, b) => a.id.localeCompare(b.id))

// Corrections exported from the app (scan-corrections/*.json) ship as extra references.
const corrections: { id: string; w: number; h: number; px: Uint8Array; src: 'correction' | 'confirmed' | 'not' }[] = []
if (fs.existsSync('scan-corrections')) {
  for (const f of fs.readdirSync('scan-corrections').filter((n) => n.endsWith('.json'))) {
    const file = JSON.parse(fs.readFileSync(path.join('scan-corrections', f), 'utf8')) as { fp?: number; records?: { itemId: string; kind?: 'correct' | 'confirmed' | 'not'; w: number; h: number; fp: string }[] }
    if (file.fp !== FP) {
      console.warn(`skipping ${f}: made with FP=${file.fp}, scanner uses ${FP}`)
      continue
    }
    for (const r of file.records ?? []) {
      const px = new Uint8Array(Buffer.from(r.fp, 'base64'))
      if (px.length === r.w * FP * r.h * FP * 3) corrections.push({ id: r.itemId, w: r.w, h: r.h, px, src: r.kind === 'confirmed' ? 'confirmed' : r.kind === 'not' ? 'not' : 'correction' })
    }
  }
  console.log(`${corrections.length} shipped corrections`)
}

const header: FingerprintHeader = { version: 1, fp: FP, generated: new Date().toISOString(), items: [] }
const total = results.reduce((n, r) => n + r.px.length, 0) + corrections.reduce((n, r) => n + r.px.length, 0)
const pixels = new Uint8Array(total)
let o = 0
for (const r of results) {
  header.items.push({ id: r.id, w: r.w, h: r.h, o, n: r.n || undefined, g: r.g ? 1 : undefined })
  pixels.set(r.px, o)
  o += r.px.length
}
for (const c of corrections) {
  header.items.push({ id: c.id, w: c.w, h: c.h, o, src: c.src })
  pixels.set(c.px, o)
  o += c.px.length
}
fs.writeFileSync(path.join(OUT_DIR, 'fingerprints.json'), JSON.stringify(header))
fs.writeFileSync(path.join(OUT_DIR, 'fingerprints.bin'), pixels)

console.log(`wrote ${results.length} fingerprints (${(total / 1e6).toFixed(1)} MB), ${failed} failed`)
