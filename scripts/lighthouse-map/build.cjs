// Builds the updated Lighthouse drawing (public/maps/lighthouse-2026.svg).
//
//  - Ground (sea, land, lakes, islands, rock, dirt roads) comes from tarkov.dev's drawing
//    (tarkov-dev-svg-maps, CC BY-NC-SA 4.0), minus what no longer exists (the old lighthouse island).
//  - Roads, yards, concrete, rails, walls, buildings, tanks, the rebuilt island and the south road
//    landslide are traced from RE3MR's 1.7 render (CC BY-NC-SA 4.0) in specs/*.json, in the render's
//    frame; warp.json moves them onto the game's own positions where the render drifts (the
//    south-west corner: causeway and island).
//  - Minefields are the game's own outlines (json.tarkov.dev hazards, see hazards.cjs).
// The viewBox and frame are tarkov.dev's, so the app places it with the same transform.
// Usage: build.cjs <old.svg> <mines.json> <out.svg>
const fs = require('fs')
const path = require('path')
const F = require('./frames.cjs')

const [oldFile, minesFile, outFile] = process.argv.slice(2)
const SPECS = path.join(__dirname, 'specs')
const specFiles = ['north.json', 'village.json', 'south.json', 'coast.json']

// --- correction of the render's drift (render-frame drawing units → game) -------------------
const warpSpec = JSON.parse(fs.readFileSync(path.join(SPECS, 'warp.json'), 'utf8'))
function warp([u, v]) {
  let wu = 0
  let wv = 0
  let ws = 0
  for (const a of warpSpec.anchors) {
    const d2 = (u - a.at[0]) ** 2 + (v - a.at[1]) ** 2
    const w = Math.exp(-d2 / (2 * warpSpec.sigma ** 2)) + 1e-9
    wu += w * a.fix[0]
    wv += w * a.fix[1]
    ws += w
  }
  return [u + wu / ws, v + wv / ws]
}

// --- shapes ------------------------------------------------------------------------------------
const r1 = (n) => Math.round(n * 10) / 10
const pts = (list) => list.map(([u, v]) => `${r1(u)} ${r1(v)}`).join(' L')
const poly = (list) => `M${pts(list)}Z`
const line = (list) => `M${pts(list)}`

function shapeCorners(s) {
  if (s.p) return s.p
  if (s.r) {
    const [a, b, c, d] = s.r
    return [[a, b], [c, b], [c, d], [a, d]]
  }
  const [cx, cy] = s.c
  const r = ((s.a ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = (sx * s.w) / 2
    const y = (sy * s.h) / 2
    return [cx + x * cos - y * sin, cy + x * sin + y * cos]
  })
}

/** One spec shape as SVG markup (already warped). */
function shapeSvg(s) {
  if (s.rad) {
    const [cx, cy] = s.fixed ? s.c : warp(s.c)
    return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(s.rad)}"/>`
  }
  const corners = shapeCorners(s).map((p) => (s.fixed ? p : warp(p)))
  return `<path d="${poly(corners)}"/>`
}

function lineSvg(s, cls) {
  const l = s.l.map((p) => (s.fixed ? p : warp(p)))
  const width = s.w ? ` style="stroke-width:${s.w}"` : ''
  return `<path class="${cls}"${width} d="${line(l)}"/>`
}

const specs = specFiles.map((f) => JSON.parse(fs.readFileSync(path.join(SPECS, f), 'utf8')))
const all = (layer) => specs.flatMap((s) => s[layer] ?? [])

// --- the old drawing -----------------------------------------------------------------------------
const old = fs.readFileSync(oldFile, 'utf8')
const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(old)[1]
/** Inner markup of one old group (between its opening and closing tag). */
function oldGroup(id) {
  const start = old.indexOf(`<g id="${id}"`)
  if (start < 0) return ''
  const open = old.indexOf('>', start) + 1
  const close = old.indexOf('</g>', open)
  return old.slice(open, close)
}
/** Old paths/circles of a group, minus those lying inside `drop` boxes [u0, v0, u1, v1]. */
function keepOld(id, drop = []) {
  const { pathPoints } = require('./svgpath.cjs')
  return (oldGroup(id).match(/<(path|circle)[^>]*>(<\/\1>)?/g) ?? [])
    .filter((el) => {
      const d = /d="([^"]+)"/.exec(el)
      const c = /cx="([\d.]+)" cy="([\d.]+)"/.exec(el)
      const p = d ? pathPoints(d[1]) : c ? [[Number(c[1]), Number(c[2])]] : []
      if (!p.length) return true
      const us = p.map((q) => q[0])
      const vs = p.map((q) => q[1])
      const box = [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)]
      return !drop.some(([a, b, c2, d2]) => box[0] >= a && box[1] >= b && box[2] <= c2 && box[3] <= d2)
    })
    .map((el) => el.replace(/><\/(path|circle)>/, '/>'))
    .join('')
}
// The old lighthouse island (rebuilt and moved west since) and its jetty
const OLD_ISLAND = [[30, 1360, 260, 1620]]

// --- minefields (game data) ----------------------------------------------------------------------
const mines = JSON.parse(fs.readFileSync(minesFile, 'utf8'))

const g = (id, cls, inner) => `    <g id="${id}"${cls ? ` class="${cls}"` : ''}>${inner}</g>\n`
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${F.VIEW[0]}" height="${F.VIEW[1]}" viewBox="0 0 ${F.VIEW[0]} ${F.VIEW[1]}">
  <desc>Escape from Tarkov's Lighthouse, updated to the current layout. Ground from the tarkov.dev SVG maps (the-hideout/tarkov-dev-svg-maps, Shebuka and contributors); buildings, roads, the rebuilt lighthouse island and the south road landslide traced from RE3MR's Lighthouse 1.7 render (reemr.se); minefields from the game's data via tarkov.dev. Licensed CC BY-NC-SA 4.0. Not for use in cheating software.</desc>
  <style>${style.trim()}
    .tc26-mines { fill:red; fill-opacity:.35; stroke:red; stroke-width:1; stroke-dasharray:3,2 }
    .tc26-tank { fill:#1a2632; stroke:#768089; stroke-width:1.5 }
  </style>
  <g id="Ground_Level" data-layer="Ground_Level">
${g('water', 'water', oldGroup('water'))}${g('land', 'land', keepOld('land', OLD_ISLAND))}${g('lakes', 'water', oldGroup('lakes'))}${g('islands', 'land', keepOld('islands', OLD_ISLAND))}${g('mountains', 'rock', keepOld('mountains', OLD_ISLAND))}${g('island_2026', 'land', all('land').map((s) => shapeSvg(s)).join(''))}${g('rock_2026', 'rock', all('rock').map((s) => shapeSvg(s)).join(''))}${g('dirt_road', 'gravel', keepOld('dirt_road', OLD_ISLAND))}${g('cement', 'cement', all('cement').map((s) => shapeSvg(s)).join(''))}${g('yards', 'tarmac', all('tarmac').map((s) => shapeSvg(s)).join(''))}${g('roads', '', all('roads').map((s) => lineSvg(s, 'road_tarmac')).join(''))}${g('railroad', '', all('rails').map((s) => lineSvg(s, 'railroad')).join(''))}${g('fences', '', all('fences').map((s) => lineSvg(s, 'fence')).join(''))}${g('pier', 'wood', keepOld('pier', OLD_ISLAND) + all('wood').map((s) => shapeSvg(s)).join(''))}${g('tanks', 'tc26-tank', all('tanks').map((s) => shapeSvg(s)).join(''))}${g('buildings', 'building', all('buildings').map((s) => shapeSvg(s)).join(''))}${g('limit', 'map_border', oldGroup('limit'))}${g('mines', 'tc26-mines', mines.map((m) => `<path d="${poly(m.p)}"/>`).join(''))}  </g>
</svg>
`
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, out)
const count = (layer) => all(layer).length
console.log(`wrote ${outFile} (${(out.length / 1024).toFixed(0)} KB): ${count('buildings')} buildings, ${count('roads')} roads, ${count('cement')} concrete, ${count('tarmac')} yards, ${count('tanks')} tanks, ${mines.length} minefields`)
