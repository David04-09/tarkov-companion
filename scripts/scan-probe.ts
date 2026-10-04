// Dev tool: at one grid spot, show how the expected item scores against the winner.
// Usage: npx tsx scripts/scan-probe.ts <png> <row> <col> <w> <h> <expected normalizedName>
import fs from 'node:fs'
import sharp from 'sharp'
import { FP, buildCandidates, chooseGrid, compareMask, distance, indexFromParts, sampleRegion, type FingerprintHeader } from '../src/scan/core'
const [file, r, c, w, h, expected] = process.argv.slice(2)
const header = JSON.parse(fs.readFileSync('public/scan/fingerprints.json', 'utf8')) as FingerprintHeader
const index = indexFromParts(header, new Uint8Array(fs.readFileSync('public/scan/fingerprints.bin')))
const items = Object.values((JSON.parse(fs.readFileSync(process.env.TMP + '/items.json', 'utf8')) as { data: { items: Record<string, { id: string; normalizedName: string }> } }).data.items)
const name = (id: string) => items.find((i) => i.id === id)?.normalizedName ?? id
const cand = buildCandidates(index)
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const img = { width: info.width, height: info.height, data }
const g = chooseGrid(img, cand)
const W = Number(w)
const H = Number(h)
const region = sampleRegion(img, g.ox + Number(c) * g.pitch, g.oy + Number(r) * g.pitch, W * g.pitch + 1, H * g.pitch + 1, W * FP, H * FP)
const rows = (cand.get(`${W}x${H}`) ?? []).map((k) => ({ n: name(k.itemId), rot: k.rotated, e: distance(region, k.fp, compareMask(W, H, k.rotated)) })).sort((a, b) => a.e - b.e)
const pos = rows.findIndex((x) => x.n === expected)
console.log(`grid ${g.pitch.toFixed(2)} ${g.ox},${g.oy}; ${W}x${H} at r${r} c${c}`)
console.log('top:', rows.slice(0, 5).map((x) => `${x.n}${x.rot ? 'R' : ''} ${x.e.toFixed(1)}`).join(' | '))
console.log(`expected ${expected}: rank ${pos + 1}, error ${rows[pos]?.e.toFixed(1)}`)
// Save the screen region next to the expected reference image for a look.
const exp = items.find((i) => i.normalizedName === expected)
if (exp) {
  const crop = await sharp(file).extract({ left: Math.round(g.ox + Number(c) * g.pitch), top: Math.round(g.oy + Number(r) * g.pitch), width: Math.round(W * g.pitch), height: Math.round(H * g.pitch) }).resize({ height: 128 * H }).png().toBuffer()
  const ref = await sharp(`assets-src/scan/grid-cache/${exp.id}.webp`).resize({ height: 128 * H }).png().toBuffer()
  const m1 = await sharp(crop).metadata()
  const m2 = await sharp(ref).metadata()
  await sharp({ create: { width: (m1.width ?? 0) + (m2.width ?? 0) + 8, height: 128 * H, channels: 3, background: '#000' } }).composite([{ input: crop, left: 0, top: 0 }, { input: ref, left: (m1.width ?? 0) + 8, top: 0 }]).png().toFile(`${process.env.TMP}/probe-${expected}.png`)
}
