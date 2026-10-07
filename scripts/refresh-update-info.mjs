// After code signing, the installer's bytes (and so its SHA-512 and size) differ from what
// electron-builder wrote into latest.yml and the .blockmap. The updater checks the download
// against latest.yml, so both are rebuilt here from the signed file, with electron-builder's own
// blockmap code. Usage: node scripts/refresh-update-info.mjs [releaseDir=release]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap')

const dir = process.argv[2] ?? 'release'
const ymlFile = path.join(dir, 'latest.yml')
const info = yaml.load(fs.readFileSync(ymlFile, 'utf8'))
for (const entry of info.files ?? []) {
  const file = path.join(dir, entry.url)
  if (!fs.existsSync(file)) throw new Error(`${entry.url} listed in latest.yml is missing`)
  const result = await buildBlockMap(file, 'gzip', `${file}.blockmap`)
  entry.sha512 = result.sha512
  entry.size = fs.statSync(file).size
  console.log(`${entry.url}: ${entry.size} bytes, new blockmap`)
  if (info.path === entry.url) info.sha512 = entry.sha512
}
fs.writeFileSync(ymlFile, yaml.dump(info, { lineWidth: 8000 }))
console.log('latest.yml updated for the signed files')
