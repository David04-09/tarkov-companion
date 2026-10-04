// Headless smoke test for an installed desktop build (Chrome DevTools Protocol): first-run screen,
// logs detection, bundled Lighthouse tiles, remote Customs tiles, watcher state, settings file.
// Usage: node scripts/smoke-test-installed.mjs "<path to Tarkov Companion.exe>" "<empty folder to use as user data>"
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [exe, userData] = process.argv.slice(2)
const PORT = 9333
fs.rmSync(userData, { recursive: true, force: true })
// Optional: start from an existing settings.json (e.g. one left by an older version).
if (process.env.TC_SEED_SETTINGS) {
  fs.mkdirSync(userData, { recursive: true })
  fs.copyFileSync(process.env.TC_SEED_SETTINGS, path.join(userData, 'settings.json'))
}
const child = spawn(exe, [`--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], { detached: true, stdio: 'ignore' })
child.unref()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function pages() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  } catch {
    return []
  }
}
let list = []
for (let i = 0; i < 60 && list.length === 0; i++) {
  await sleep(1000)
  list = (await pages()).filter((p) => p.type === 'page')
}
if (list.length === 0) {
  console.log(JSON.stringify({ ok: false, error: 'app did not expose a page in 60 s' }))
  process.exit(1)
}
const page = list[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d)
    pending.delete(d.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id
    pending.set(n, resolve)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null
}

await sleep(3000)
const out = { url: page.url }
out.version = await evalJs('window.desktop && window.desktop.appVersion')
out.setupScreen = await evalJs('!!document.querySelector("[aria-labelledby=setup-title]")')
out.setupText = await evalJs('(document.querySelector("[aria-labelledby=setup-title]")||{}).innerText?.slice(0,400)')
out.logsFolderFound = await evalJs('/Logs folder found/.test(document.body.innerText)')
out.logsPath = await evalJs('(document.querySelector("[aria-labelledby=setup-title] code")||{}).textContent')

// Read past logs from the setup screen when it is shown, then count completed quests.
if (out.setupScreen) {
  await evalJs('(() => { const b=[...document.querySelectorAll("[aria-labelledby=setup-title] button")].find(x=>/Read past logs/.test(x.textContent)); b && !b.disabled && b.click(); return !!b })()')
  // The catch-up now opens a review list; read it, then confirm the default selection.
  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    if (await evalJs('!!document.querySelector("[aria-labelledby=review-title]")')) break
  }
  out.review = await evalJs('(() => { const d=document.querySelector("[aria-labelledby=review-title]"); if(!d) return null; return { summary: d.querySelector("p")?.innerText, rows: d.querySelectorAll("li input[type=checkbox]").length, checked: d.querySelectorAll("li input[type=checkbox]:checked").length, sample: [...d.querySelectorAll("li")].slice(0,5).map(li=>li.innerText.replace(/\\s+/g," ")) } })()')
  out.reviewApplied = await evalJs('(() => { const b=[...document.querySelectorAll("[aria-labelledby=review-title] button")].find(x=>/^Tick [0-9]+ quests/.test(x.textContent.trim())); b && b.click(); return b ? b.textContent.trim() : null })()')
  await sleep(1500)
  out.syncHistory = await evalJs('(() => { const h = JSON.parse(localStorage.getItem("tarkov-companion-sync-history")||"{}").state; return h ? { entries: h.entries.length, sources: [...new Set(h.entries.map(e=>e.source))] } : null })()')
  out.backfillLine = await evalJs('(document.body.innerText.match(/Done: [0-9]+ PvE[^.]*/)||[""])[0]')
  out.doneButton = await evalJs('(() => { const b=[...document.querySelectorAll("[aria-labelledby=setup-title] button")].find(x=>x.textContent.trim()==="Done"); return b ? { disabled: b.disabled } : "missing" })()')
}

// Finish setup, then open Lighthouse (bundled tiles) and Customs (remote tiles).
out.doneClicked = await evalJs('(() => { const b=[...document.querySelectorAll("[aria-labelledby=setup-title] button")].find(x=>x.textContent.trim()==="Done"); b && b.click(); return !!b })()')
await sleep(1500)
out.setupStillShown = await evalJs('!!document.querySelector("[aria-labelledby=setup-title]")')
await evalJs('location.hash = "#/maps"')
await sleep(1500)
await evalJs('(() => { const s=document.querySelector("select[aria-label=\\"Select map\\"]"); if(!s) return false; const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; setter.call(s,"lighthouse"); s.dispatchEvent(new Event("change",{bubbles:true})); return true })()')
await sleep(6000)
out.lighthouse = await evalJs('(() => { const t=[...document.querySelectorAll("img.leaflet-tile")]; return { tiles: t.length, loaded: t.filter(i=>i.complete&&i.naturalWidth>0).length, srcSample: (t[0]||{}).src, markers: document.querySelectorAll(".leaflet-marker-icon").length, note: (document.querySelector("[role=note]")||{}).textContent } })()')
await evalJs('(() => { const s=document.querySelector("select[aria-label=\\"Select map\\"]"); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; setter.call(s,"customs"); s.dispatchEvent(new Event("change",{bubbles:true})); })()')
await sleep(8000)
out.customs = await evalJs('(() => { const t=[...document.querySelectorAll("img.leaflet-tile")]; return { tiles: t.length, loaded: t.filter(i=>i.complete&&i.naturalWidth>0).length, markers: document.querySelectorAll(".leaflet-marker-icon").length } })()')
// Optional: paste a stash screenshot into Item Collection and read the scan result.
// Optional: paste screenshots into Item Collection one after another (comma-separated paths;
// the page is reloaded between them, so later ones use the remembered cell size).
if (process.env.TC_SCAN_IMAGE) {
  out.scan = []
  for (const file of process.env.TC_SCAN_IMAGE.split(',')) {
    const b64 = fs.readFileSync(file).toString('base64')
    await evalJs('location.hash = "#/items"; location.reload()')
    await sleep(4000)
    await evalJs(`(async () => { const bin = atob('${b64}'); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([u], 'shot.png', { type: 'image/png' })); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })); return true })()`)
    for (let i = 0; i < 40; i++) {
      await sleep(1000)
      if (await evalJs('/items · cell|Scanner data|error/i.test((document.querySelector("[aria-labelledby=scan-title]")||{}).innerText||"")')) break
    }
    out.scan.push(await evalJs('(() => { const d = document.querySelector("[aria-labelledby=scan-title]"); if (!d) return "no dialog"; return { status: (d.innerText.match(/[0-9]+ items · cell [0-9]+ px[^\\n]*/) || [d.innerText.slice(0, 200)])[0], error: d.querySelector(".text-danger")?.innerText ?? null, rows: d.querySelectorAll("li input[type=number]").length, remembered: localStorage.getItem("tc-scan-cell-size") } })()'))
  }
}
out.updateStatus = await evalJs('window.desktop.getUpdateStatus()')
out.watcher = await evalJs('window.desktop.getState().then(s => ({status: s.status, logsPath: s.logsPath, detected: s.detectedPath, mode: s.sessionMode}))')
out.completed = await evalJs('(() => { const p = JSON.parse(localStorage.getItem("tarkov-companion-progress")||"{}").state?.profiles; return p ? { pve: p.pve.completedTaskIds.values.length, pvp: p.regular.completedTaskIds.values.length } : null })()')
out.flags = await evalJs('localStorage.getItem("tarkov-companion-desktop-flags")')
out.settingsFile = fs.existsSync(path.join(userData, 'settings.json')) ? JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')) : null
console.log(JSON.stringify(out, null, 2))
ws.close()
process.kill(child.pid)
