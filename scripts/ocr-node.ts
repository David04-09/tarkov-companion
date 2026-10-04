// Node version of the scanner's text reading (same preprocessing as src/scan/ocr.ts),
// for the command-line scan tools. Uses the bundled model in public/ocr.
import path from 'node:path'
import sharp from 'sharp'
import { createWorker, OEM, PSM } from 'tesseract.js'
import type { OcrWord } from '../src/scan/core'

let worker: Awaited<ReturnType<typeof createWorker>> | null = null

export async function readWordsNode(file: string): Promise<OcrWord[]> {
  const meta = await sharp(file).metadata()
  const scale = (meta.width ?? 0) < 1800 ? 2 : 1
  const { data, info } = await sharp(file).greyscale().resize({ width: Math.round((meta.width ?? 0) * scale) }).raw().toBuffer({ resolveWithObject: true })
  const bw = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) bw[i] = data[i] > 150 ? 0 : 255
  const png = await sharp(bw, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer()
  if (!worker) {
    worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: path.resolve('public/ocr'), gzip: true, cacheMethod: 'none' })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  }
  const { data: res } = await worker.recognize(png, {}, { blocks: true })
  const words: OcrWord[] = []
  for (const b of res.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
    words.push({ text: w.text, conf: w.confidence, x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale })
  }
  return words
}

export async function closeOcr() {
  await worker?.terminate()
  worker = null
}
