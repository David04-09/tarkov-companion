// Runs the stash scanner on a screenshot from the command line and writes an
// annotated copy next to it (<name>.scan.png) plus a list of what it found.
// Usage: npx tsx scripts/scan-test.ts <screenshot.png>
import fs from 'node:fs'
import sharp from 'sharp'
import { closeOcr, readWordsNode } from './ocr-node'
import { buildCandidates, chooseGrid, detectGrid, identifyRegion, refineGrid, indexFromParts, scanGrid, type FingerprintHeader } from '../src/scan/core'

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
const words = process.argv.includes('--no-ocr') ? undefined : await readWordsNode(file)
const grid = pitchArg ? refineGrid(img, detectGrid(img, Number(pitchArg.slice(8))), buildCandidates(index)) : chooseGrid(img, buildCandidates(index), words)
console.log(`grid: pitch ${grid.pitch.toFixed(2)} px, origin (${grid.ox.toFixed(1)}, ${grid.oy.toFixed(1)}), ${grid.cols} x ${grid.rows} cells, ${Date.now() - t} ms`)
t = Date.now()
const candidates = buildCandidates(index)
const found = scanGrid(img, grid, candidates, index, { words })
await closeOcr()
console.log(`scan: ${found.length} items in ${Date.now() - t} ms`)
for (const d of found) {
  const alt = d.alternatives.slice(0, 2).map((a) => `${names[a.itemId]}(${a.error.toFixed(1)})`).join(', ')
  console.log(`  ${d.nameMatch ? 'N' : ' '} r${d.row} c${d.col} ${d.w}x${d.h}${d.rotated ? 'R' : ' '} ${names[d.itemId]?.padEnd(14)} err ${d.error.toFixed(1)}${d.byName ? ' BYNAME' : ''}${d.unexamined ? ' UNEXAMINED' : ''}   alt: ${alt}`)
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

// Test images made by scan-gun-test come with the answer: report how many guns were found.
const expFile = file.replace(/\.png$/i, '.expected.json')
if (fs.existsSync(expFile)) {
  const expected = JSON.parse(fs.readFileSync(expFile, 'utf8')) as { name: string; baseId: string; col: number; row: number; w: number; h: number }[]
  let right = 0
  for (const e of expected) {
    const exact = found.find((d) => d.itemId === e.baseId && d.col === e.col && d.row === e.row && d.w === e.w && d.h === e.h)
    const inside = found.filter((d) => d.col < e.col + e.w && d.col + d.w > e.col && d.row < e.row + e.h && d.row + d.h > e.row)
    if (exact) right++
    console.log(`  ${exact ? 'OK  ' : 'MISS'} ${e.name} r${e.row} c${e.col} ${e.w}x${e.h}${exact ? '' : ' -> ' + inside.map((d) => `${names[d.itemId]} r${d.row} c${d.col} ${d.w}x${d.h}${d.byName ? ' byName' : ''}`).join('; ')}`)
  }
  console.log(`guns: ${right}/${expected.length} right`)
}
// --box=row,col,w,h prints the best items for one box (like the scan dialog's box editor).
const boxArg = process.argv.find((a) => a.startsWith('--box='))
if (boxArg) {
  const [row, col, w, h] = boxArg.slice(6).split(',').map(Number)
  for (const m of identifyRegion(img, grid, candidates, { row, col, w, h }, words, 8)) console.log(`  box: ${names[m.itemId]} ${m.error.toFixed(1)}${m.nameMatch ? ' N' : ''}${m.rotated ? ' R' : ''}`)
}
