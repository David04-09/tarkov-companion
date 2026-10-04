// Compares what two grids find on the same screenshot (item multiset difference),
// e.g. a known-good grid vs what chooseGrid picks. Dev tool for tuning.
// Usage: npx tsx scripts/scan-compare.ts <png> <pitch> <ox> <oy>
import fs from 'node:fs'
import sharp from 'sharp'
import { closeOcr, readWordsNode } from './ocr-node'
import { buildCandidates, chooseGrid, indexFromParts, scanGrid, type FingerprintHeader, type Grid } from '../src/scan/core'

const [file, p, x, y] = process.argv.slice(2)
const header = JSON.parse(fs.readFileSync('public/scan/fingerprints.json', 'utf8')) as FingerprintHeader
const index = indexFromParts(header, new Uint8Array(fs.readFileSync('public/scan/fingerprints.bin')))
const cand = buildCandidates(index)
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const img = { width: info.width, height: info.height, data }
const pitch = Number(p)
const known: Grid = { pitch, ox: Number(x), oy: Number(y), cols: Math.floor((img.width - Number(x)) / pitch), rows: Math.floor((img.height - Number(y)) / pitch) }
const chosen = chooseGrid(img, cand)
const words = await readWordsNode(file)
const count = (g: Grid) => {
  const m = new Map<string, number>()
  for (const d of scanGrid(img, g, cand, index, { words })) m.set(d.itemId, (m.get(d.itemId) ?? 0) + 1)
  return m
}
const a = count(known)
const b = count(chosen)
let same = 0
let missing = 0
let extra = 0
for (const [id, n] of a) {
  const k = b.get(id) ?? 0
  same += Math.min(n, k)
  missing += Math.max(0, n - k)
}
for (const [id, n] of b) extra += Math.max(0, n - (a.get(id) ?? 0))
const diff: string[] = []
for (const [id, n] of a) if ((b.get(id) ?? 0) < n) diff.push('-' + id)
for (const [id, n] of b) if ((a.get(id) ?? 0) < n) diff.push('+' + id)
console.log(diff.join(' '))
console.log(`known grid ${pitch}/${x},${y}  chosen ${chosen.pitch.toFixed(2)}/${chosen.ox},${chosen.oy}: same ${same}, missing ${missing}, extra ${extra}`)
await closeOcr()
