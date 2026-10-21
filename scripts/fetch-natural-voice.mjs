// The natural voice for the assistant: Kitten TTS micro 0.8 (Apache-2.0, https://huggingface.co/KittenML),
// a 40M-parameter ONNX model that speaks faster than real time on one CPU core, plus the
// WebAssembly build of onnxruntime-web that runs it. Written to public/tts/ (content pack 'tts',
// downloaded by the desktop app the first time the natural voice is used).
// voices.npz (NumPy) becomes voices.bin (float32 rows, little-endian) + voices.json (where each voice is).
// Usage: npm run tts:assets   (downloads are cached in assets-src/tts-kitten; SHA-256 pinned)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const REPO = 'KittenML/kitten-tts-micro-0.8'
const REV = '1ccf72b2c2048fd17efac7de2fab32d10e225084'
// Checked 2026-10-21.
const FILES = {
  'kitten_tts_micro_v0_8.onnx': '95481626fee1ba70ce683e69c534fc7cb38433c46ce42d3abbeafb4b9f1a4123',
  'voices.npz': '112710c1be8ad0e967c190fb0fd95cbe5848ec4791b93209f20b28b7da20dac1',
  'config.json': '1f0bd2208348f9211cb0da64fcd1536eb28228571cc6b09e767eb6e203a0a532',
}
const CACHE = 'assets-src/tts-kitten'
const OUT = 'public/tts'
const WASM = 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

fs.mkdirSync(CACHE, { recursive: true })
for (const [rel, want] of Object.entries(FILES)) {
  const cached = path.join(CACHE, rel)
  if (!fs.existsSync(cached) || sha256(cached) !== want) {
    const url = `https://huggingface.co/${REPO}/resolve/${REV}/${rel}`
    console.log(`downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`)
    fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()))
  }
  if (sha256(cached) !== want) throw new Error(`${rel} does not match the expected checksum; refusing to ship it`)
}

/** The arrays in a .npz file (a zip of .npy files, zip64 as numpy writes them): name -> { shape, data }. */
function readNpz(file) {
  // bsdtar reads zip; on Windows name System32's tar.exe (Git Bash's GNU tar comes first on PATH).
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-npz-'))
  execFileSync(tar, ['-xf', path.resolve(file), '-C', tmp])
  const out = {}
  for (const name of fs.readdirSync(tmp).filter((n) => n.endsWith('.npy'))) {
    const npy = fs.readFileSync(path.join(tmp, name))
    if (npy.toString('latin1', 1, 6) !== 'NUMPY') throw new Error(`${name}: not a .npy file`)
    const major = npy[6]
    const headerLen = major === 1 ? npy.readUInt16LE(8) : npy.readUInt32LE(8)
    const headerStart = major === 1 ? 10 : 12
    const header = npy.toString('latin1', headerStart, headerStart + headerLen)
    if (!/'descr':\s*'<f4'/.test(header) || /'fortran_order':\s*True/.test(header)) throw new Error(`${name}: expected little-endian float32 in C order (${header})`)
    const shape = header.match(/'shape':\s*\(([^)]*)\)/)[1].split(',').map((x) => x.trim()).filter(Boolean).map(Number)
    const body = npy.subarray(headerStart + headerLen)
    out[name.replace(/\.npy$/, '')] = { shape, data: new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length)) }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  return out
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'kitten'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'ort'), { recursive: true })
fs.copyFileSync(path.join(CACHE, 'kitten_tts_micro_v0_8.onnx'), path.join(OUT, 'kitten', 'model.onnx'))
const config = JSON.parse(fs.readFileSync(path.join(CACHE, 'config.json'), 'utf8'))
const arrays = readNpz(path.join(CACHE, 'voices.npz'))
const index = { aliases: config.voice_aliases ?? {}, voices: {} }
const chunks = []
let offset = 0
for (const name of Object.keys(arrays).sort()) {
  const { shape, data } = arrays[name]
  index.voices[name] = { offset, rows: shape[0], cols: shape[1] }
  chunks.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  offset += data.byteLength
}
fs.writeFileSync(path.join(OUT, 'kitten', 'voices.bin'), Buffer.concat(chunks))
fs.writeFileSync(path.join(OUT, 'kitten', 'voices.json'), JSON.stringify(index, null, 1) + '\n')
fs.copyFileSync(WASM, path.join(OUT, 'ort', path.basename(WASM)))
let total = 0
for (const d of ['kitten', 'ort']) for (const f of fs.readdirSync(path.join(OUT, d))) total += fs.statSync(path.join(OUT, d, f)).size
console.log(`${OUT}: ${(total / 1e6).toFixed(1)} MB; voices: ${Object.entries(index.voices).map(([n, v]) => `${n} ${v.rows}x${v.cols}`).join(', ')}`)
