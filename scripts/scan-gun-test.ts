// Builds a test stash with guns: pastes ready-made weapon builds (tarkov.dev preset pictures,
// scaled to the screenshot's cell size) into the empty part of a real stash screenshot.
// "--modded" also stretches some builds one cell wider, like a gun with a longer stock that no
// picture matches. Writes <out>.png and <out>.expected.json, then compare with scan-test.
// Usage: npx tsx scripts/scan-gun-test.ts <empty-ish stash.png> <out.png> [--count=12] [--seed=1] [--modded] [--relabel] [--pitch=84]
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { buildCandidates, chooseGrid, detectGrid, emptyCells, refineGrid, indexFromParts, type FingerprintHeader } from '../src/scan/core'

const [src, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!src || !out) throw new Error('usage: scan-gun-test <stash.png> <out.png>')
const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d)
const count = arg('count', 12)
let seed = arg('seed', 1)
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const modded = process.argv.includes('--modded')
// tarkov.dev's preset pictures print the preset's name; the game prints the base gun's short name.
const relabel = process.argv.includes('--relabel')

type Raw = { id: string; width: number; height: number; gridImageLink?: string; shortName?: string; types?: string[]; properties?: { baseItem?: string } }
const all = ((await (await fetch('https://json.tarkov.dev/regular/items')).json()) as { data: { items: Record<string, Raw> } }).data.items
const en = (await (await fetch('https://json.tarkov.dev/regular/items_en')).json()) as { data?: Record<string, string> }
const tr = (en.data ?? en) as Record<string, string>
const presets = Object.values(all).filter((i) => (i.types ?? []).includes('preset') && (all[i.properties?.baseItem ?? '']?.types ?? []).includes('gun') && i.width <= 6 && i.height <= 3)

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const img = { width: info.width, height: info.height, data }
const header = JSON.parse(fs.readFileSync('public/scan/fingerprints.json', 'utf8')) as FingerprintHeader
const cands = buildCandidates(indexFromParts(header, new Uint8Array(fs.readFileSync('public/scan/fingerprints.bin'))))
// Mostly empty stashes fool the size finder: pass --pitch= (the cell size in px) for those.
const grid = arg('pitch', 0) ? refineGrid(img, detectGrid(img, arg('pitch', 0)), cands) : chooseGrid(img, cands)
const empty = emptyCells(img, grid)
const used = empty.map((r) => r.map((e) => !e))
const comps: { input: Buffer; left: number; top: number }[] = []
const expected: { name: string; baseId: string; col: number; row: number; w: number; h: number; modded: boolean }[] = []
for (let tries = 0; expected.length < count && tries < 2000; tries++) {
  const p = presets[Math.floor(rand() * presets.length)]
  const stretch = modded && rand() < 0.5 ? 1 : 0
  const w = p.width + stretch
  const h = p.height
  const col = Math.floor(rand() * (grid.cols - w + 1))
  const row = Math.floor(rand() * (grid.rows - h + 1))
  let free = true
  for (let y = row; y < row + h && free; y++) for (let x = col; x < col + w; x++) if (used[y][x]) free = false
  if (!free) continue
  const cache = path.join('assets-src/scan/grid-cache', `${p.id}.webp`)
  const buf = fs.existsSync(cache) ? fs.readFileSync(cache) : Buffer.from(await (await fetch(p.gridImageLink as string)).arrayBuffer())
  const pw = Math.round(w * grid.pitch)
  const ph = Math.round(h * grid.pitch)
  const base = all[p.properties?.baseItem ?? '']
  let pic = sharp(buf).resize(pw, ph, { fit: 'fill' })
  if (relabel) {
    const fs2 = Math.round(grid.pitch * 0.16)
    const label = (tr[base.shortName ?? ''] ?? '').replace(/[<&]/g, '')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect x="${pw * 0.3}" y="1" width="${pw * 0.7 - 2}" height="${fs2 + 6}" fill="rgb(14,14,14)"/><text x="${pw - 3}" y="${fs2 + 2}" text-anchor="end" font-family="Arial" font-size="${fs2}" fill="#d8d8d8">${label}</text></svg>`
    pic = sharp(await pic.png().toBuffer()).composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  }
  comps.push({ input: await pic.png().toBuffer(), left: Math.round(grid.ox + col * grid.pitch), top: Math.round(grid.oy + row * grid.pitch) })
  for (let y = row; y < row + h; y++) for (let x = col; x < col + w; x++) used[y][x] = true
  expected.push({ name: tr[base.shortName ?? ''] ?? base.id, baseId: base.id, col, row, w, h, modded: stretch > 0 })
}
await sharp(src).composite(comps).png().toFile(out)
fs.writeFileSync(out.replace(/\.png$/i, '.expected.json'), JSON.stringify(expected, null, 1))
console.log(`grid pitch ${grid.pitch.toFixed(1)} origin ${grid.ox.toFixed(1)},${grid.oy.toFixed(1)}; pasted ${expected.length} guns:`)
for (const e of expected) console.log(`  r${e.row} c${e.col} ${e.w}x${e.h} ${e.name}${e.modded ? ' (stretched)' : ''}`)
