// Extract and transit positions (game x/z) for one map, plus every boss spawn point, so wiki pictures can be fitted.
const fs = require('fs')
;(async () => {
  const [mapName, mode = 'pve'] = process.argv.slice(2)
  const cache = require('path').join(require('os').tmpdir(), `tc-maps-${mode}.json`)
  let base, en
  if (fs.existsSync(cache)) ({ base, en } = JSON.parse(fs.readFileSync(cache, 'utf8')))
  else {
    ;[base, en] = await Promise.all([fetch(`https://json.tarkov.dev/${mode}/maps`).then((r) => r.json()), fetch(`https://json.tarkov.dev/${mode}/maps_en`).then((r) => r.json())])
    fs.writeFileSync(cache, JSON.stringify({ base, en }))
  }
  const t = (k) => (k && en.data[k]) || k
  const m = Object.values(base.data.maps).find((x) => x.normalizedName === mapName)
  const r = (n) => Math.round(n)
  console.log('extracts:')
  for (const e of m.extracts ?? []) console.log(`  ${t(e.name)} [${e.faction}] ${r(e.position?.x)},${r(e.position?.z)} y${r(e.position?.y)}`)
  console.log('transits:')
  for (const e of m.transits ?? []) console.log(`  ${t(e.description)} ${r(e.position?.x)},${r(e.position?.z)}`)
  const mobs = base.data.mobs ?? {}
  console.log('bosses:')
  for (const b of m.bosses ?? []) {
    const name = t(mobs[b.mob]?.name) ?? b.mob
    if (/^(BEAR|USEC)$/.test(name)) continue
    for (const l of b.spawnLocations ?? []) console.log(`  ${name} @ ${t(l.name)}: ${(l.positions ?? []).map((p) => `${r(p.x)},${r(p.z)}`).join(' ')}`)
  }
})()
