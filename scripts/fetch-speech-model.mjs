// Speech to text for the assistant's questions: Moonshine tiny (Useful Sensors, MIT,
// https://huggingface.co/UsefulSensors/moonshine-tiny) as int8 ONNX from onnx-community, plus the
// WebAssembly build of onnxruntime-web that runs it. Written to public/asr/ (content pack 'asr',
// downloaded by the desktop app the first time a question is spoken). The small Vosk model
// (voice:assets) stays for the wake word and for hearing when a question has ended.
// Usage: npm run asr:assets   (downloads are cached in assets-src/asr-moonshine; SHA-256 pinned)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const REPO = 'onnx-community/moonshine-tiny-ONNX'
const REV = 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95'
// Checked 2026-10-21.
const FILES = {
  'onnx/encoder_model_quantized.onnx': 'c6fc4b7bc5af75c0591fd157a1f3829b533d18e9769a888fd95a62e470dd4f4a',
  'onnx/decoder_model_quantized.onnx': '2e7db65f157a0c1b7a2ca2e9bf682766de9304664df8e74605838ea75751affa',
  'tokenizer.json': '7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f',
}
const CACHE = 'assets-src/asr-moonshine'
const OUT = 'public/asr'
const WASM = 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

fs.mkdirSync(CACHE, { recursive: true })
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'moonshine'), { recursive: true })
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
  fs.copyFileSync(cached, path.join(OUT, 'moonshine', path.basename(rel)))
}
fs.copyFileSync(WASM, path.join(OUT, 'ort', path.basename(WASM)))
console.log(`wrote ${OUT}`)
