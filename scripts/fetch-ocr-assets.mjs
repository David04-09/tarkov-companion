// Puts the offline text reader (Tesseract, Apache-2.0) into public/ocr so it ships with the app:
// the tesseract.js worker, the LSTM engine builds, and the English model.
// Usage: npm run ocr:assets   (re-runs skip the model download when it is cached)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const OUT = 'public/ocr'
const CACHE = 'assets-src/ocr'
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz'
// The model ships inside the app: refuse anything but the exact file that was checked (2026-10-07).
const MODEL_SHA256 = '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91'
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(CACHE, { recursive: true })

const copy = (from, to) => {
  fs.copyFileSync(from, path.join(OUT, to))
  console.log(`  ${to} (${(fs.statSync(from).size / 1e6).toFixed(1)} MB)`)
}
copy('node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js')
for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  copy(`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`, `tesseract-core-${variant}.wasm.js`)
}

const cached = path.join(CACHE, 'eng.traineddata.gz')
if (!fs.existsSync(cached) || fs.statSync(cached).size < 1e6) {
  console.log(`downloading ${MODEL_URL}`)
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`)
  fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()))
}
if (sha256(cached) !== MODEL_SHA256) {
  fs.rmSync(cached, { force: true })
  throw new Error('eng.traineddata.gz does not match the expected checksum; refusing to ship it')
}
copy(cached, 'eng.traineddata.gz')
console.log('OCR assets ready')
