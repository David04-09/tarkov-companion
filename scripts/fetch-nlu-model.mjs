// Understanding plain English for the assistant: paraphrase-MiniLM-L3-v2 (sentence-transformers,
// Apache-2.0, https://huggingface.co/sentence-transformers/paraphrase-MiniLM-L3-v2) as int8 ONNX
// from Xenova, plus the WebAssembly build of onnxruntime-web. It only scores how close two
// sentences are in meaning; the assistant uses it to match a question it did not understand to one
// it knows. Written to public/nlu/ (content pack 'nlu', downloaded by the desktop app on first use).
// Usage: npm run nlu:assets   (downloads are cached in assets-src/nlu-minilm; SHA-256 pinned)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const REPO = 'Xenova/paraphrase-MiniLM-L3-v2'
const REV = '4b544e74dfc3256b2b56849ea5d7064fee1ac846'
// Checked 2026-10-21.
const FILES = {
  'onnx/model_quantized.onnx': 'b190f50dd46296b9895ae8f274c3455762d08610f8788f4a9bd15019f4f7160c',
  'vocab.txt': '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
}
const CACHE = 'assets-src/nlu-minilm'
const OUT = 'public/nlu'
const WASM = 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

fs.mkdirSync(CACHE, { recursive: true })
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'model'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'ort'), { recursive: true })
for (const [rel, want] of Object.entries(FILES)) {
  const cached = path.join(CACHE, path.basename(rel))
  if (!fs.existsSync(cached) || sha256(cached) !== want) {
    const url = `https://huggingface.co/${REPO}/resolve/${REV}/${rel}`
    console.log(`downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`)
    fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()))
  }
  if (sha256(cached) !== want) throw new Error(`${rel} does not match the expected checksum; refusing to ship it`)
  fs.copyFileSync(cached, path.join(OUT, 'model', path.basename(rel)))
}
fs.copyFileSync(WASM, path.join(OUT, 'ort', path.basename(WASM)))
console.log(`wrote ${OUT}`)
