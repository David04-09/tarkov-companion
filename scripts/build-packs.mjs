// Content packs for the desktop app: parts that are not open source (RE3MR's Lighthouse tiles,
// CC BY-NC-SA; the scanner fingerprints made from Battlestate's item pictures) are not inside the
// signed installer. Each release carries them as separate downloads; the app fetches a pack the
// first time it is needed and checks it against the SHA-256 written here into the app.
//
// Pack file: "TCPK1\n" + 4-byte big-endian header length + JSON header
// { files: [{ path, size }] } + the files' bytes back to back, in header order.
// Files are sorted and nothing time-dependent is stored, so the same content always gives the
// same pack (and the same hash: users only download again when something really changed).
//
// Usage: npm run packs   (after tiles:lighthouse and scan:fingerprints)
// Writes release-packs/<name>-<hash12>.tcpack and electron/packs.generated.json.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PACKS = [
  { name: 'lighthouse', dir: 'public/tiles/lighthouse-re3mr', prefix: 'tiles/lighthouse-re3mr', label: 'Lighthouse map (RE3MR render)' },
  { name: 'scan', dir: 'public/scan', prefix: 'scan', label: 'stash scanner data' },
]
const OUT = 'release-packs'
const MAGIC = Buffer.from('TCPK1\n')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() && !entry.name.endsWith('.xml')) out.push(full)
  }
  return out
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const manifest = { packs: {} }
for (const pack of PACKS) {
  if (!fs.existsSync(pack.dir)) throw new Error(`${pack.dir} is missing: build it first`)
  const files = walk(pack.dir)
    .map((full) => ({ full, path: `${pack.prefix}/${path.relative(pack.dir, full).split(path.sep).join('/')}` }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const bodies = files.map((f) => fs.readFileSync(f.full))
  const header = Buffer.from(JSON.stringify({ files: files.map((f, i) => ({ path: f.path, size: bodies[i].length })) }))
  const len = Buffer.alloc(4)
  len.writeUInt32BE(header.length)
  const data = Buffer.concat([MAGIC, len, header, ...bodies])
  const sha256 = crypto.createHash('sha256').update(data).digest('hex')
  const file = `${pack.name}-${sha256.slice(0, 12)}.tcpack`
  fs.writeFileSync(path.join(OUT, file), data)
  manifest.packs[pack.name] = { file, sha256, size: data.length, files: files.length, label: pack.label }
  console.log(`${file}: ${files.length} files, ${(data.length / 1e6).toFixed(1)} MB`)
}
fs.writeFileSync('electron/packs.generated.json', JSON.stringify(manifest, null, 2) + '\n')
console.log('wrote electron/packs.generated.json')
