// Headless smoke test for an installed desktop build (Chrome DevTools Protocol): first-run screen,
// logs detection, bundled Lighthouse tiles, remote Customs tiles, watcher state, settings file.
// Usage: node scripts/smoke-test-installed.mjs "%LOCALAPPDATA%ProgramsTarkov CompanionTarkov Companion.exe" %TEMP%	c-clean-test
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [exe, userData] = process.argv.slice(2)
const PORT = 9333
fs.rmSync(userData, { recursive: true, force: true })
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

// Finish setup, then open Lighthouse (bundled tiles) and Customs (remote tiles).
await evalJs('(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Done"); b && b.click(); return !!b })()')
await sleep(1500)
await evalJs('location.hash = "#/maps"')
await sleep(1500)
await evalJs('(() => { const s=document.querySelector("select[aria-label=\\"Select map\\"]"); if(!s) return false; const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; setter.call(s,"lighthouse"); s.dispatchEvent(new Event("change",{bubbles:true})); return true })()')
await sleep(6000)
out.lighthouse = await evalJs('(() => { const t=[...document.querySelectorAll("img.leaflet-tile")]; return { tiles: t.length, loaded: t.filter(i=>i.complete&&i.naturalWidth>0).length, srcSample: (t[0]||{}).src, markers: document.querySelectorAll(".leaflet-marker-icon").length, note: (document.querySelector("[role=note]")||{}).textContent } })()')
await evalJs('(() => { const s=document.querySelector("select[aria-label=\\"Select map\\"]"); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; setter.call(s,"customs"); s.dispatchEvent(new Event("change",{bubbles:true})); })()')
await sleep(8000)
out.customs = await evalJs('(() => { const t=[...document.querySelectorAll("img.leaflet-tile")]; return { tiles: t.length, loaded: t.filter(i=>i.complete&&i.naturalWidth>0).length, markers: document.querySelectorAll(".leaflet-marker-icon").length } })()')
out.updateStatus = await evalJs('window.desktop.getUpdateStatus()')
out.watcher = await evalJs('window.desktop.getState().then(s => ({status: s.status, logsPath: s.logsPath, detected: s.detectedPath, mode: s.sessionMode}))')
out.settingsFile = fs.existsSync(path.join(userData, 'settings.json')) ? JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')) : null
console.log(JSON.stringify(out, null, 2))
ws.close()
process.kill(child.pid)
