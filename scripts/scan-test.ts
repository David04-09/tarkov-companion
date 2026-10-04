// Runs the stash scanner on a screenshot from the command line and writes an
// annotated copy next to it (<name>.scan.png) plus a list of what it found.
// Usage: npx tsx scripts/scan-test.ts <screenshot.png>
import fs from 'node:fs'
import sharp from 'sharp'
import { buildCandidates, detectGrid, refineGrid, indexFromParts, scanGrid, type FingerprintHeader } from '../src/scan/core'

const file = process.argv.slice(2).find((a) => !a.startsWith('--')) as string
if (!file) throw new Error('usage: scan-test <screenshot>')
const header = JSON.parse(fs.readFileSync('public/scan/fingerprints.json', 'utf8')) as FingerprintHeader
const index = indexFromParts(header, new Uint8Array(fs.readFileSync('public/scan/fingerprints.bin')))
const itemsRes = (await (await fetch('https://json.tarkov.dev/regular/items')).json()) as { data: { items: Record<string, { id: string; shortName: string; normalizedName: string }> } }
const en = (await (await fetch('https://json.tarkov.dev/regular/items_en')).json()) as { data?: Record<string, string> } & Record<string, string>
const tr = (en.data ?? en) as Record<string, string>
const names: Record<string, string> = {}
for (const i of Object.values(itemsRes.data.items)) names[i.id] = tr[i.shortName] ?? i.normalizedName

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const img = { width: info.width, height: info.height, data }
let t = Date.now()
const pitchArg = process.argv.find((a) => a.startsWith('--pitch='))
let grid = detectGrid(img, pitchArg ? Number(pitchArg.slice(8)) : undefined)
if (pitchArg || grid.cols * grid.rows <= 48) grid = refineGrid(img, grid, buildCandidates(index))
console.log(`grid: pitch ${grid.pitch.toFixed(2)} px, origin (${grid.ox.toFixed(1)}, ${grid.oy.toFixed(1)}), ${grid.cols} x ${grid.rows} cells, ${Date.now() - t} ms`)
t = Date.now()
const candidates = buildCandidates(index)
const found = scanGrid(img, grid, candidates, index)
console.log(`scan: ${found.length} items in ${Date.now() - t} ms`)
for (const d of found) {
  const alt = d.alternatives.slice(0, 2).map((a) => `${names[a.itemId]}(${a.error.toFixed(1)})`).join(', ')
  console.log(`  r${d.row} c${d.col} ${d.w}x${d.h}${d.rotated ? 'R' : ' '} ${names[d.itemId]?.padEnd(14)} err ${d.error.toFixed(1)}   alt: ${alt}`)
}

// Annotated image: grid lines + boxes with labels.
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}">`]
for (let c = 0; c <= grid.cols; c++) svg.push(`<line x1="${grid.ox + c * grid.pitch}" y1="0" x2="${grid.ox + c * grid.pitch}" y2="${img.height}" stroke="#ff0" stroke-opacity="0.25"/>`)
for (let r = 0; r <= grid.rows; r++) svg.push(`<line x1="0" y1="${grid.oy + r * grid.pitch}" x2="${img.width}" y2="${grid.oy + r * grid.pitch}" stroke="#ff0" stroke-opacity="0.25"/>`)
for (const d of found) {
  const x = grid.ox + d.col * grid.pitch
  const y = grid.oy + d.row * grid.pitch
  const color = d.error < 14 ? '#3f3' : d.error < 20 ? '#fc3' : '#f43'
  svg.push(`<rect x="${x + 2}" y="${y + 2}" width="${d.w * grid.pitch - 4}" height="${d.h * grid.pitch - 4}" fill="none" stroke="${color}" stroke-width="3"/>`)
  svg.push(`<rect x="${x + 3}" y="${y + d.h * grid.pitch - 24}" width="${Math.min(d.w * grid.pitch - 6, 160)}" height="20" fill="#000" fill-opacity="0.75"/>`)
  svg.push(`<text x="${x + 6}" y="${y + d.h * grid.pitch - 9}" font-family="Arial" font-size="13" fill="${color}">${(names[d.itemId] ?? '?').replace(/[<&]/g, '')} ${d.error.toFixed(0)}</text>`)
}
svg.push('</svg>')
const outFile = file.replace(/\.png$/i, '') + '.scan.png'
await sharp(file).composite([{ input: Buffer.from(svg.join('')), top: 0, left: 0 }]).png().toFile(outFile)
console.log(`annotated: ${outFile}`)
