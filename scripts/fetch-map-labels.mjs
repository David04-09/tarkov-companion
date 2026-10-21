// Place names on the maps (Dorms, Crackhouse, …) from tarkov.dev's map config (MIT).
// Writes src/data/mapLabels.json: { _source, maps: { [normalizedName]: [{ text, x, z, top?, bottom? }] } }.
// Run: node scripts/fetch-map-labels.mjs
import fs from 'node:fs'

const REPO = 'the-hideout/tarkov-dev'
const FILE = 'src/data/maps.json'
const commits = await (await fetch(`https://api.github.com/repos/${REPO}/commits?path=${FILE}&per_page=1`)).json()
const sha = commits[0].sha
const groups = await (await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${FILE}`)).json()
const maps = {}
for (const group of groups) {
  for (const m of group.maps ?? []) {
    if (m.projection !== 'interactive' || !m.labels?.length) continue
    const key = group.normalizedName
    const seen = new Set((maps[key] ??= []).map((l) => l.text))
    for (const l of m.labels) {
      if (typeof l.text !== 'string' || !Array.isArray(l.position) || seen.has(l.text)) continue
      seen.add(l.text)
      const out = { text: l.text.trim(), x: l.position[0], z: l.position[1] }
      if (typeof l.top === 'number') out.top = l.top
      if (typeof l.bottom === 'number') out.bottom = l.bottom
      maps[key].push(out)
    }
  }
}
const out = { _source: { project: `https://github.com/${REPO}`, file: FILE, commit: sha, fetched: new Date().toISOString().slice(0, 10), license: 'MIT (tarkov.dev)' }, maps }
fs.writeFileSync('src/data/mapLabels.json', JSON.stringify(out, null, 1) + '\n')
console.log(Object.entries(maps).map(([k, v]) => `${k}: ${v.length}`).join('\n'))
