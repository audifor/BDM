// Minimal Chrome DevTools Protocol client for the real Windows acceptance run: the WebView2 of the Tauri executable is
// started with --remote-debugging-port, and the run drives it with real mouse/keyboard events and screenshots.
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function launchApp(exePath, port, env = {}) {
  const child = spawn(exePath, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=*`, ...env },
    stdio: env.BDM_NATIVE_DIAGNOSTICS === '1' ? 'inherit' : 'ignore', detached: false,
  })
  child.on('error', (error) => { throw error })
  let targets
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(500)
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      if (targets.some((target) => target.type === 'page')) break
    } catch { /* the window is still starting */ }
  }
  const page = targets?.find((target) => target.type === 'page')
  if (page === undefined) throw new Error('The Tauri window did not expose a debuggable page')
  return { child, page, port }
}

export async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 1
  const pending = new Map()
  socket.onclose = () => { for (const {reject, timer} of pending.values()) { clearTimeout(timer); reject(new Error('Native WebView2 connection closed')) }; pending.clear() }
  const consoleErrors = []
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data)
    if (data.id !== undefined && pending.has(data.id)) {
      const { resolve, reject, timer } = pending.get(data.id)
      clearTimeout(timer)
      pending.delete(data.id)
      if (data.error) reject(new Error(`${data.error.message}`)); else resolve(data.result)
    } else if (data.method === 'Runtime.exceptionThrown') consoleErrors.push(data.params.exceptionDetails?.exception?.description ?? data.params.exceptionDetails?.text)
    else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') consoleErrors.push(data.params.args.map((arg) => arg.value ?? arg.description).join(' '))
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error(`Native WebView2 connection is closed (${method})`)); return }
    const id = nextId++
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native WebView2 command timed out: ${method}`)) }, 60000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  await send('Runtime.enable')
  await send('Page.enable')

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const api = {
    send, evaluate, consoleErrors,
    close: () => socket.close(),
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(path, Buffer.from(data, 'base64'))
    },
    async size(width, height) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    },
    async resetSize() { await send('Emulation.clearDeviceMetricsOverride') },
    /** Center of the first visible element matching `selector` whose text contains `text` (case-insensitive); a leading `=` asks for an exact match. */
    async locate(selector, text) {
      return evaluate(`(() => {
        const raw = ${JSON.stringify(text ?? '')}.toLowerCase()
        const exact = raw.startsWith('=')
        const wanted = exact ? raw.slice(1) : raw
        const same = (value) => (value ?? '').trim().toLowerCase() === wanted
        const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(visible).find((candidate) => wanted === '' || (exact ? same(candidate.innerText) || same(candidate.getAttribute('aria-label')) : (candidate.innerText ?? candidate.textContent ?? '').toLowerCase().includes(wanted) || (candidate.getAttribute('aria-label') ?? '').toLowerCase().includes(wanted)))
        if (!el) return null
        el.scrollIntoView({ block: 'center', inline: 'center' })
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: el.disabled === true, text: (el.innerText ?? '').trim().slice(0, 80) }
      })()`)
    },
    async click(selector, text, { timeout = 15000 } = {}) {
      const deadline = Date.now() + timeout
      let target = null
      while (Date.now() < deadline) {
        target = await api.locate(selector, text)
        if (target !== null && !target.disabled) break
        await sleep(250)
      }
      if (target === null || target.disabled) throw new Error(`Cannot click ${selector} "${text ?? ''}": ${target === null ? 'not found' : 'disabled'}`)
      await sleep(80)
      const again = await api.locate(selector, text)
      for (const [type, extra] of [['mouseMoved', {}], ['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]]) {
        await send('Input.dispatchMouseEvent', { type, x: again.x, y: again.y, ...extra })
      }
      await sleep(250)
      return again.text
    },
    async waitFor(predicateSource, { timeout = 30000, label = predicateSource } = {}) {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        if (await evaluate(`Boolean(${predicateSource})`)) return
        await sleep(300)
      }
      throw new Error(`Timed out waiting for: ${label}`)
    },
    async type(text) { for (const char of text) { await send('Input.dispatchKeyEvent', { type: 'char', text: char }); await sleep(8) } },
    async focus(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`) },
    async setValue(selector, value) {
      // A React-controlled input/select: set through the native setter and dispatch the events React listens to.
      await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))})
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
      await sleep(150)
    },
    buttons: () => evaluate(`[...document.querySelectorAll('button,[role=button],a')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map((el) => (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 60)).filter(Boolean)`),
    bodyText: () => evaluate('document.body.innerText'),
  }
  return api
}

/** Real keyboard press on the focused element (used for sliders: ArrowRight/ArrowLeft/Home/End). */
export async function press(cdp, key) {
  const codes = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35, Enter: 13, Escape: 27 }
  const vk = codes[key]
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await sleep(120)
}
