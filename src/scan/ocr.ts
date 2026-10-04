/**
 * Reads the short names printed on items (top-right of every slot) with Tesseract,
 * fully offline. The engine and English model ship in /ocr (npm run ocr:assets).
 * In the installed app the page is a local file, which Chromium cannot fetch() from,
 * so the files are served through the app's own read-only "tcres://" address.
 */
import { createWorker, OEM, PSM } from 'tesseract.js'
import type { OcrWord } from './core'

type TessWorker = Awaited<ReturnType<typeof createWorker>>

function assetBase(): string {
  if (location.protocol === 'file:') return 'tcres://app/ocr'
  return new URL(`${import.meta.env.BASE_URL}ocr`, location.href).href.replace(/\/$/, '')
}

let workerPromise: Promise<TessWorker> | null = null
/** Blank margin around the image handed to the reader. */
const PAD = 24

function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const base = assetBase()
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: true,
      })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
      return worker
    })().catch((err: unknown) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

/** Separable bicubic (Keys, a = -0.5) resize of a single-channel image. */
function bicubicResize(src: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const kernel = (x: number) => {
    const t = Math.abs(x)
    if (t <= 1) return 1.5 * t ** 3 - 2.5 * t ** 2 + 1
    if (t < 2) return -0.5 * t ** 3 + 2.5 * t ** 2 - 4 * t + 2
    return 0
  }
  const pass = (data: Float32Array, inW: number, inH: number, outW: number, horizontal: boolean) => {
    // outW is the target length along the pass direction (width for horizontal, height for vertical).
    const len = outW
    const res = new Float32Array(horizontal ? outW * inH : inW * outW)
    const inLen = horizontal ? inW : inH
    const ratio = inLen / len
    for (let o = 0; o < len; o++) {
      const center = (o + 0.5) * ratio - 0.5
      const i0 = Math.floor(center)
      const wts = [-1, 0, 1, 2].map((k) => kernel(center - (i0 + k)))
      const sum = wts.reduce((x, y) => x + y, 0)
      for (let line = 0; line < (horizontal ? inH : inW); line++) {
        let v = 0
        for (let k = 0; k < 4; k++) {
          const i = Math.min(inLen - 1, Math.max(0, i0 - 1 + k))
          v += wts[k] * (horizontal ? data[line * inW + i] : data[i * inW + line])
        }
        if (horizontal) res[line * outW + o] = v / sum
        else res[o * inW + line] = v / sum
      }
    }
    return res
  }
  const horiz = pass(src, w, h, W, true)
  return pass(horiz, W, h, H, false)
}

/** Starts loading the reader in the background (the model is ~3 MB). */
export function warmUpOcr(): void {
  void getWorker().catch(() => undefined)
}

/**
 * Words in the screenshot, in screenshot pixel coordinates. Only the bright lettering
 * is kept (item names are white), enlarged 2x for small screenshots.
 */
export async function readWords(image: Blob, crop: { x: number; y: number; w: number; h: number } | null): Promise<OcrWord[]> {
  const bitmap = await createImageBitmap(image)
  const area = crop ?? { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
  const scale = area.w < 1800 ? 2 : 1
  // Luminance at native size, then a sharp bicubic enlargement (the browser's own canvas
  // scaling blurs the small lettering and the reader then misreads names).
  const src = new OffscreenCanvas(area.w, area.h)
  const sctx = src.getContext('2d', { willReadFrequently: true })
  if (!sctx) return []
  sctx.drawImage(bitmap, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h)
  bitmap.close()
  const rgba = sctx.getImageData(0, 0, area.w, area.h).data
  const lum = new Float32Array(area.w * area.h)
  for (let i = 0; i < lum.length; i++) lum[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114
  const big = scale === 1 ? lum : bicubicResize(lum, area.w, area.h, area.w * scale, area.h * scale)
  const W = area.w * scale
  const H = area.h * scale
  // A blank margin: Tesseract misses text that touches the image border (narrow snips).
  const canvas = new OffscreenCanvas(W + 2 * PAD, H + 2 * PAD)
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const out = ctx.createImageData(W, H)
  for (let i = 0; i < big.length; i++) {
    const v = big[i] > 150 ? 0 : 255 // white names -> black text on white
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, PAD, PAD)
  const png = await canvas.convertToBlob({ type: 'image/png' })
  const worker = await getWorker()
  const { data } = await worker.recognize(png, {}, { blocks: true })
  const words: OcrWord[] = []
  for (const b of data.blocks ?? []) {
    for (const para of b.paragraphs) {
      for (const line of para.lines) {
        for (const w of line.words) {
          words.push({
            text: w.text,
            conf: w.confidence,
            x0: area.x + (w.bbox.x0 - PAD) / scale,
            y0: area.y + (w.bbox.y0 - PAD) / scale,
            x1: area.x + (w.bbox.x1 - PAD) / scale,
            y1: area.y + (w.bbox.y1 - PAD) / scale,
          })
        }
      }
    }
  }
  return words
}
