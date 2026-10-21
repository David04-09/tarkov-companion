// The offline speech model for the assistant's voice input (Vosk small English model, Apache-2.0,
// https://alphacephei.com/vosk/models) as public/voice/<name>.tar.gz, the format vosk-browser
// loads (one top-level folder). The tar is written here with fixed times and owners and gzip
// without a timestamp, so every build gives the same bytes and the same content-pack hash (users
// only download it again when the model really changes).
// Usage: npm run voice:assets   (the 41 MB download is cached in assets-src/voice)
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const NAME = 'vosk-model-small-en-us-0.15'
const URL = `https://alphacephei.com/vosk/models/${NAME}.zip`
// Only the exact file that was checked ships with the app (2026-10-21).
const ZIP_SHA256 = '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498'
const CACHE = 'assets-src/voice'
const OUT = 'public/voice'

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

fs.mkdirSync(CACHE, { recursive: true })
const zip = path.join(CACHE, `${NAME}.zip`)
if (!fs.existsSync(zip) || fs.statSync(zip).size < 1e6) {
  console.log(`downloading ${URL}`)
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`)
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
}
if (sha256(zip) !== ZIP_SHA256) {
  fs.rmSync(zip, { force: true })
  throw new Error(`${NAME}.zip does not match the expected checksum; refusing to ship it`)
}

// Unzip with bsdtar (reads zip). On Windows name System32's tar.exe: Git Bash's GNU tar comes first
// on PATH there and takes "C:" for a remote host.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-voice-'))
execFileSync(TAR, ['-xf', path.resolve(zip), '-C', tmp])

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push({ full, dir: true }, ...walk(full))
    else if (entry.isFile()) out.push({ full, dir: false })
  }
  return out
}

/** One 512-byte ustar header; times, owners and modes are fixed. */
function header(name, size, dir) {
  const h = Buffer.alloc(512)
  if (Buffer.byteLength(name) > 100) throw new Error(`path too long for tar: ${name}`)
  h.write(name, 0, 100)
  h.write(dir ? '0000755\0' : '0000644\0', 100)
  h.write('0000000\0', 108)
  h.write('0000000\0', 116)
  h.write(size.toString(8).padStart(11, '0') + '\0', 124)
  h.write('00000000000\0', 136)
  h.write('        ', 148)
  h.write(dir ? '5' : '0', 156)
  h.write('ustar\0', 257)
  h.write('00', 263)
  let sum = 0
  for (const b of h) sum += b
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  return h
}

const parts = []
for (const e of walk(tmp)) {
  const rel = path.relative(tmp, e.full).split(path.sep).join('/') + (e.dir ? '/' : '')
  if (e.dir) {
    parts.push(header(rel, 0, true))
    continue
  }
  const body = fs.readFileSync(e.full)
  parts.push(header(rel, body.length, false), body, Buffer.alloc((512 - (body.length % 512)) % 512))
}
parts.push(Buffer.alloc(1024))
fs.rmSync(tmp, { recursive: true, force: true })

fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { force: true })
const out = path.join(OUT, `${NAME}.tar.gz`)
// Node's gzip writes no timestamp (mtime 0), so the output is the same on every build.
fs.writeFileSync(out, zlib.gzipSync(Buffer.concat(parts), { level: 9 }))
console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, sha256 ${sha256(out).slice(0, 16)}…`)

// The recogniser itself: vosk-browser keeps its worker (Vosk compiled to WebAssembly) as base64 inside
// its bundle and starts it from a blob: URL. A blob: worker inherits the page's security policy, which
// forbids running code from strings, and Emscripten's bindings need that. Started from its own file
// instead, the worker gets no page policy (src/assistant/voskClient.ts talks to it directly).
// This file ships inside the app (public/vosk -> dist/vosk); only the model is a content pack.
const BUNDLE = 'node_modules/vosk-browser/dist/vosk.js'
const bundle = fs.readFileSync(BUNDLE, 'utf8')
const marker = "createBase64WorkerFactory('"
const at = bundle.lastIndexOf(marker)
if (at < 0) throw new Error(`no worker found in ${BUNDLE}`)
const b64 = bundle.slice(at + marker.length, bundle.indexOf("'", at + marker.length))
const source = Buffer.from(b64, 'base64')
// Same cut as vosk-browser's createURL: drop the first line (a loader comment).
const body = source.subarray(source.indexOf(0x0a, 10) + 1)
fs.mkdirSync('public/vosk', { recursive: true })
fs.writeFileSync('public/vosk/vosk-worker.js', body)
console.log(`public/vosk/vosk-worker.js: ${(body.length / 1e6).toFixed(1)} MB`)
