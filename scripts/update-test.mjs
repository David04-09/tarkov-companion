// End-to-end check of the auto-updater: launches an installed (older) build with a
// throwaway user-data folder and waits until it reports that the newest GitHub
// release has been downloaded ("ready"). Does not click "Restart to update".
// Usage: node scripts/update-test.mjs "<path to Tarkov Companion.exe>" "<empty folder>"
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const [exe, userData] = process.argv.slice(2)
const PORT = 9334
fs.rmSync(userData, { recursive: true, force: true })
const child = spawn(exe, [`--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], { detached: true, stdio: 'ignore' })
child.unref()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let page
for (let i = 0; i < 60 && !page; i++) {
  await sleep(1000)
  try {
    page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((p) => p.type === 'page')
  } catch {
    // not up yet
  }
}
if (!page) {
  console.log('app did not start')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (pending.has(d.id)) {
    pending.get(d.id)(d)
    pending.delete(d.id)
  }
}
const evalJs = (expression) =>
  new Promise((resolve) => {
    const n = ++id
    pending.set(n, (d) => resolve(d.result?.result?.value ?? null))
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })

const version = await evalJs('window.desktop.appVersion')
console.log(`running version ${version}`)
let last = ''
for (let i = 0; i < 180; i++) {
  const s = await evalJs('window.desktop.getUpdateStatus()')
  const line = JSON.stringify(s)
  if (line !== last) {
    console.log(`update status: ${line}`)
    last = line
  }
  if (s?.state === 'ready' || s?.state === 'error' || s?.state === 'none') break
  await sleep(2000)
}
const banner = await evalJs('(document.querySelector("[role=status]")||{}).innerText || null')
console.log(`banner: ${banner}`)
ws.close()
process.kill(child.pid)
