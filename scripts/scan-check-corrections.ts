// Uses saved scanner corrections as test images: for each one, what would the
// matcher pick from tarkov.dev's pictures alone, and what with the other
// corrections added (leave-one-out)? Prints a mismatch count to track progress.
// Usage: npm run scan:check [corrections.json ...]   (default: scan-corrections/*.json)
import fs from 'node:fs'
import path from 'node:path'
import { FP, buildCandidates, compareMask, distance, indexFromParts, withLearned, type FingerprintHeader, type LearnedFingerprint } from '../src/scan/core'

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.existsSync('scan-corrections')
    ? fs.readdirSync('scan-corrections').filter((f) => f.endsWith('.json')).map((f) => path.join('scan-corrections', f))
    : []
const records: (LearnedFingerprint & { id: string; wrongItemId: string | null })[] = []
const all: LearnedFingerprint[] = []
for (const f of files) {
  const file = JSON.parse(fs.readFileSync(f, 'utf8')) as { fp?: number; records?: { id: string; itemId: string; kind?: 'correct' | 'confirmed' | 'not'; wrongItemId: string | null; w: number; h: number; fp: string }[] }
  if (file.fp !== FP) continue
  for (const r of file.records ?? []) {
    const fp = new Uint8Array(Buffer.from(r.fp, 'base64'))
    const kind = r.kind ?? 'correct'
    all.push({ itemId: r.itemId, w: r.w, h: r.h, fp, kind })
    // Test images: what the item really is (fixes and confirmations).
    if (kind !== 'not') records.push({ id: r.id, itemId: r.itemId, wrongItemId: r.wrongItemId, w: r.w, h: r.h, fp, kind })
  }
}
if (records.length === 0) {
  console.log('No corrections to check (export some from the app into scan-corrections/).')
  process.exit(0)
}

const header = JSON.parse(fs.readFileSync('public/scan/fingerprints.json', 'utf8')) as FingerprintHeader
// Base pictures only: drop corrections already bundled into the fingerprint file.
const baseHeader: FingerprintHeader = { ...header, items: header.items.filter((i) => !i.src) }
const index = indexFromParts(baseHeader, new Uint8Array(fs.readFileSync('public/scan/fingerprints.bin')))
const base = buildCandidates(index)

function best(candidates: ReturnType<typeof buildCandidates>, r: (typeof records)[number]) {
  const fp = Float32Array.from(r.fp)
  let top = { itemId: '', error: Infinity }
  const list = candidates.get(`${r.w}x${r.h}`) ?? []
  const rejected = new Map<string, number>()
  for (const c of list) if (c.negative) rejected.set(c.itemId, Math.min(rejected.get(c.itemId) ?? Infinity, distance(fp, c.fp, compareMask(r.w, r.h, false))))
  for (const c of list) {
    if (c.negative) continue
    const raw = distance(fp, c.fp, compareMask(r.w, r.h, c.rotated))
    const dNot = rejected.get(c.itemId)
    if (dNot !== undefined && (dNot < 9 || dNot <= raw)) continue
    const e = raw - c.bonus
    if (e < top.error) top = { itemId: c.itemId, error: e }
  }
  return top
}

let wrongBase = 0
let wrongWith = 0
for (const r of records) {
  const b = best(base, r)
  const others = all.filter((o) => o.fp !== r.fp)
  const w = best(withLearned(base, others), r)
  if (b.itemId !== r.itemId) wrongBase++
  if (w.itemId !== r.itemId) wrongWith++
  console.log(`${r.itemId.slice(-6)} ${r.w}x${r.h}  base: ${b.itemId === r.itemId ? 'ok ' : 'WRONG'} (${b.error.toFixed(1)})  with other corrections: ${w.itemId === r.itemId ? 'ok ' : 'WRONG'} (${w.error.toFixed(1)})`)
}
console.log(`\n${records.length} test images: ${wrongBase} wrong with tarkov.dev pictures alone, ${wrongWith} wrong with the other corrections added.`)
