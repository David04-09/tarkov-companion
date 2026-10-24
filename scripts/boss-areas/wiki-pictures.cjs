// Lists every picture on the given wiki pages (with captions from galleries) and downloads the "map" ones.
const fs = require('fs')
const path = require('path')
const API = 'https://escapefromtarkov.fandom.com/api.php'
const out = process.argv[2]
const pages = process.argv.slice(3)
fs.mkdirSync(out, { recursive: true })
const get = async (params) => (await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`)).json()
;(async () => {
  for (const p of pages) {
    const j = await get({ action: 'parse', page: p, prop: 'wikitext', redirects: '1' })
    const text = j.parse?.wikitext ?? ''
    const files = new Set()
    for (const m of text.matchAll(/(?:^|\[\[|\n)\s*(?:File|Image):([^|\]\n]+\.(?:png|jpe?g|gif|webp))/gi)) files.add(m[1].trim())
    console.log(`== ${p}: ${[...files].join(' ; ')}`)
    for (const f of files) {
      if (!/map|spawn|location|haunt/i.test(f)) continue
      const info = await get({ action: 'query', titles: `File:${f}`, prop: 'imageinfo', iiprop: 'url|size' })
      const ii = info.query?.pages?.[0]?.imageinfo?.[0]
      if (!ii) continue
      const r = await fetch(ii.url + (ii.url.includes("?") ? "&" : "?") + "format=original", { headers: { Referer: 'https://escapefromtarkov.fandom.com/' } })
      const buf = Buffer.from(await r.arrayBuffer())
      const name = `${p.replace(/\W+/g, '_')}__${f.replace(/[^\w.]+/g, '_')}`
      fs.writeFileSync(path.join(out, name), buf)
      console.log(`   saved ${name} ${ii.width}x${ii.height} ${r.status}`)
    }
  }
})()
