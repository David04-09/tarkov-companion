// Robustness test for cell-size detection: cuts random "snips" (different sizes,
// positions and scales) out of real screenshots and checks the detected cell size.
// Usage: npx tsx scripts/scan-snip-test.ts [count] [--no-ocr] [--scale=1] [--prior=84.05] [--only=3,7]
// (--prior = remembered cell size at scale 1, as the app passes it after a good scan)
import fs from 'node:fs'
import sharp from 'sharp'
import { buildCandidates, chooseGrid, indexFromParts, type FingerprintHeader } from '../src/scan/core'
import { closeOcr, readWordsNode } from './ocr-node'

const COUNT = Number(process.argv.find((a) => /^[0-9]+$/.test(a)) ?? 40)
const SOURCES = [
  { file: 'assets-src/scan/shot-124558.png', pitch: 84.09 },
  { file: 'assets-src/scan/junk-box.png', pitch: 84.02 },
  { file: 'assets-src/scan/shot-124215.png', pitch: 84.02 },
]
const header = JSON.parse(fs.readFileSync('public/scan/fingerprints.json', 'utf8')) as FingerprintHeader
const index = indexFromParts(header, new Uint8Array(fs.readFileSync('public/scan/fingerprints.bin')))
const cand = buildCandidates(index)

// Deterministic random numbers so runs are comparable.
let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

let ok = 0
const fails: string[] = []
for (let n = 0; n < COUNT; n++) {
  const src = SOURCES[n % SOURCES.length]
  const meta = await sharp(src.file).metadata()
  // Snip size from 1x1 cells up to the whole image, any position.
  const cellsW = 1 + Math.floor(rnd() * 13)
  const cellsH = 1 + Math.floor(rnd() * 13)
  const w = Math.min(meta.width!, Math.round(cellsW * src.pitch + rnd() * 30))
  const h = Math.min(meta.height!, Math.round(cellsH * src.pitch + rnd() * 30))
  const x = Math.floor(rnd() * (meta.width! - w + 1))
  const y = Math.floor(rnd() * (meta.height! - h + 1))
  // Scale as if taken at another resolution / display scaling (0.75x .. 1.5x).
  const scaleArg = process.argv.find((a) => a.startsWith('--scale='))
  const pick = [1, 1, 0.76, 0.9, 1.125, 1.5][Math.floor(rnd() * 6)]
  const scale = scaleArg ? Number(scaleArg.slice(8)) : pick
  const sw = Math.round(w * scale)
  const sh = Math.round(h * scale)
  const only = process.argv.find((a) => a.startsWith('--only='))
  if (only && !only.slice(7).split(',').map(Number).includes(n)) continue
  const snipFile = `${process.env.TMP}/snip-${n}.png`
  await sharp(src.file).extract({ left: x, top: y, width: w, height: h }).resize(sw, sh).png().toFile(snipFile)
  const { data, info } = await sharp(snipFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const words = process.argv.includes('--no-ocr') ? undefined : await readWordsNode(snipFile)
  const priorArg = process.argv.find((a) => a.startsWith('--prior='))
  const grid = chooseGrid({ width: info.width, height: info.height, data }, cand, words, priorArg ? Number(priorArg.slice(8)) : undefined)
  const expected = src.pitch * scale
  const good = Math.abs(grid.pitch - expected) / expected < 0.02
  if (good) ok++
  else fails.push(`#${n} fit ${grid.fit.toFixed(1)} ${cellsW}x${cellsH} cells, scale ${scale}: expected ${expected.toFixed(1)} got ${grid.pitch.toFixed(1)} (${sw}x${sh}px)`)
}
await closeOcr()
console.log(`${ok}/${COUNT} snips got the right cell size`)
for (const f of fails) console.log('  FAIL ' + f)
