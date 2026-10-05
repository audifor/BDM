/**
 * ME-LOCK1.2 browser bench driver: opens a dev page in headless Chrome (remote debugging, Node's built-in WebSocket) and waits for the
 * page to publish `window.__melock`. Used with dev-melock-bench.html served by Vite (real Web Worker pool, Chromium = WebView2 engine).
 *   node scripts/next/melock12Chrome.mjs <url> [chromePath] [debugPort=9333]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe', portArg = '9333'] = process.argv.slice(2)
const profile = mkdtempSync(join(tmpdir(), 'melock12-chrome-'))
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${portArg}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  let targets
  for (let attempt = 0; attempt < 50 && targets === undefined; attempt += 1) {
    try { targets = await (await fetch(`http://127.0.0.1:${portArg}/json/list`)).json() } catch { await sleep(200) }
  }
  const page = targets.find((target) => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (message) => { const data = JSON.parse(message.data); pending.get(data.id)?.(data); pending.delete(data.id) })
  const send = (method, params = {}) => new Promise((resolve) => { id += 1; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
  await send('Page.navigate', { url })
  const started = Date.now()
  for (;;) {
    await sleep(2000)
    const reply = await send('Runtime.evaluate', { expression: 'window.__melock ?? null', returnByValue: true })
    const value = reply.result?.result?.value
    if (value) { console.log(value); break }
    if (Date.now() - started > 15 * 60_000) { console.log(JSON.stringify({ error: 'timeout' })); break }
  }
  socket.close()
} finally {
  chrome.kill()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}
