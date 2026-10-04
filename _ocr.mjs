import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'
const file = process.argv[2]
const scale = 2
const t0 = Date.now()
// Bright lettering -> black text on white, enlarged.
const { data, info } = await sharp(file).greyscale().resize({ width: Math.round((await sharp(file).metadata()).width * scale) }).raw().toBuffer({ resolveWithObject: true })
const bw = Buffer.alloc(data.length)
for (let i = 0; i < data.length; i++) bw[i] = data[i] > 150 ? 0 : 255
const png = await sharp(bw, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer()
await sharp(png).toFile(process.env.TMP + '/ocr-input.png')
const worker = await createWorker('eng')
await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
const { data: res } = await worker.recognize(png, {}, { blocks: true })
const words = []
for (const b of res.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({ t: w.text, c: Math.round(w.confidence), x: Math.round(w.bbox.x1 / scale), y: Math.round(w.bbox.y0 / scale) })
await worker.terminate()
console.log(`ocr ${Date.now() - t0} ms, ${words.length} words`)
console.log(words.slice(0, 80).map((w) => `${w.t}(${w.c})@${w.x},${w.y}`).join('  '))
