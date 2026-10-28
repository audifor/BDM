// Controlled native WebView2 benchmark. No simulation authority or game rule is replaced.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { cpus, totalmem } from 'node:os'
import { connect, launchApp, sleep } from './cdp.mjs'

const label = process.env.BDM_BENCH_LABEL ?? 'baseline'
const directory = resolve('.worlddb-v2/v2-06', label)
const executable = resolve(process.env.BDM_BENCH_EXE ?? 'artifacts/bdm-baseline.exe')
const opening = resolve('.worlddb-v2/v2-06/opening.json')
const repetitions = Number(process.env.BDM_BENCH_REPETITIONS ?? 3)
const reportedCores = Number(process.env.BDM_BENCH_REPORTED_CORES ?? 0)
mkdirSync(directory, { recursive: true })
const assert = (condition, message) => { if (!condition) throw Error(message) }
const sha = value => createHash('sha256').update(value).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const truth = payload => {
  const result = structuredClone(payload)
  result.staffCareerRuntime.governanceDecisionEvents.sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify(canonical(result))
}
const report = { label, reportedCores: reportedCores || cpus().length, executableSha256: sha(readFileSync(executable)), openingSha256: sha(readFileSync(opening)), hardware: { cpu: cpus()[0].model, logicalProcessors: cpus().length, memoryBytes: totalmem() }, runs: [] }
for (let repetition = 1; repetition <= repetitions; repetition++) {
  const profile = `v2-06-${label}-${Date.now()}-${repetition}`
  const savePath = join(process.env.APPDATA, 'com.bdm.worlddbv2.pilot/saves/profiles', profile, 'main.json')
  mkdirSync(dirname(savePath), { recursive: true }); copyFileSync(opening, savePath)
  let app, c
  try {
    app = await launchApp(executable, 9566, { BDM_SAVE_PROFILE: profile, WEBVIEW2_USER_DATA_FOLDER: join(directory, profile, 'webview') })
    c = await connect(app.page.webSocketDebuggerUrl)
    if (reportedCores) await c.evaluate(`Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${reportedCores} })`)
    await c.waitFor("document.body?.innerText.includes('NEW GAME')", { timeout: 60000 })
    await c.click('button', '=CONTINUE')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')", { timeout: 120000 })
    await c.click('button', 'Abrir menú de inicio BDM')
    await c.click('button', '=Partidos y competición')
    await c.click('button', '=MATCH')
    await c.waitFor("[...document.querySelectorAll('button')].some(e => e.innerText.toUpperCase() === 'AVANZAR UN DÍA')")
    await sleep(1500)
    await c.evaluate(`(() => {
      const original = crypto.getRandomValues.bind(crypto)
      const post = Worker.prototype.postMessage
      const m = window.__bdmBenchmark = { seedDraws: [], jobs: [], setups: [], replies: [], longTasks: [], frames: [], progress: [], workers: 0 }
      crypto.getRandomValues = array => {
        if (array instanceof Uint32Array && array.length === 1 && m.seedDraws.length < 35) {
          array[0] = 151617 + m.seedDraws.length; m.seedDraws.push(array[0]); return array
        }
        return original(array)
      }
      m.restoreEntropy = () => { crypto.getRandomValues = original }
      Worker.prototype.postMessage = function(job, ...rest) {
        if (!this.__bdmObserved) {
          this.__bdmObserved = true; m.workers++
          // Wrap the actual handler: Worker EventTarget listeners can run after its Promise's microtasks.
          const applicationReply = this.onmessage
          this.onmessage = function(event) {
            if (event.data?.result) m.replies.push({ at: performance.now(), jobId: event.data.jobId, result: event.data.result, engineMs: event.data.elapsedMs })
            return applicationReply?.call(this, event)
          }
        }
        if (job?.setup) { m.jobs.push({ at: performance.now(), jobId: job.jobId, gameId: job.setup.gameId, seed: job.setup.matchSeed }); m.setups.push(job.setup) }
        return post.call(this, job, ...rest)
      }
      m.observer = new PerformanceObserver(list => m.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))))
      m.observer.observe({ type: 'longtask', buffered: false })
      const frame = at => { if (!m.stopped) { m.frames.push(at); requestAnimationFrame(frame) } }; requestAnimationFrame(frame)
      const initialDate = document.querySelector('.ng-system-bar__date').innerText
      m.mutations = new MutationObserver(() => {
        const date = document.querySelector('.ng-system-bar__date')?.innerText
        const progress = document.querySelector('.ng-taskbar')?.innerText ?? document.querySelector('footer')?.innerText ?? ''
        if (progress !== m.progress.at(-1)?.text) m.progress.push({ at: performance.now(), text: progress })
        if (m.clickedAt && date && date !== initialDate && !m.dateChangedAt) {
          m.dateChangedAt = performance.now()
          requestAnimationFrame(() => requestAnimationFrame(() => { m.paintedAt = performance.now() }))
        }
      }); m.mutations.observe(document.body, { subtree: true, childList: true, characterData: true })
      document.addEventListener('click', event => {
        const button = event.target.closest('button')
        if (button?.innerText.trim().toUpperCase() === 'AVANZAR UN DÍA' && !m.clickedAt) m.clickedAt = performance.now()
      }, true)
    })()`)
    await c.send('Profiler.enable')
    await c.send('Profiler.setSamplingInterval', { interval: 1000 })
    await c.send('Profiler.start')
    await c.click('button', 'AVANZAR UN DÍA')
    await sleep(1500)
    if (await c.evaluate('!window.__bdmBenchmark.jobs.length && !window.__bdmBenchmark.dateChangedAt')) {
      await c.evaluate('window.__bdmBenchmark.clickedAt = undefined')
      await c.click('button', 'AVANZAR UN DÍA')
    }
    await c.waitFor('!!window.__bdmBenchmark.paintedAt', { timeout: 600000 })
    const { profile: cpuProfile } = await c.send('Profiler.stop')
    writeFileSync(join(directory, `day-${repetition}.cpuprofile`), JSON.stringify(cpuProfile))
    const metrics = await c.evaluate(`(() => {
      const m = window.__bdmBenchmark; m.stopped = true; m.restoreEntropy(); m.observer.disconnect(); m.mutations.disconnect()
      const frames = m.frames.filter(at => at >= m.clickedAt && at <= m.paintedAt)
      return { clickedAt:m.clickedAt, dateChangedAt:m.dateChangedAt, paintedAt:m.paintedAt, jobs:m.jobs, seedDraws:m.seedDraws,
        workers:m.workers, replies:m.replies.map(r => ({ at:r.at, jobId:r.jobId, gameId:r.result.gameId, seed:r.result.matchSeed, engineMs:r.engineMs })),
        longTasks:m.longTasks.filter(e => e.start + e.duration >= m.clickedAt), maxFrameGapMs:Math.max(0,...frames.slice(1).map((at,i) => at-frames[i])), progress:m.progress,
        advanceMs:m.paintedAt-m.clickedAt, preparationUntilFirstPostMs:m.jobs[0].at-m.clickedAt,
        workersWallMs:Math.max(...m.replies.map(r=>r.at))-m.jobs[0].at,
        afterLastReplyUntilPaintMs:m.paintedAt-Math.max(...m.replies.map(r=>r.at)) }
    })()`)
    assert(metrics.jobs.length === 35 && metrics.replies.length === 35, 'Expected 35 exact Match Next jobs and results')
    if (process.env.BDM_BENCH_EXPECT_WORKERS) assert(metrics.workers === Number(process.env.BDM_BENCH_EXPECT_WORKERS), 'Unexpected native worker pool size')
    assert(metrics.jobs.every((job, i) => job.seed === 151617 + i), 'Sporting seed stream was not controlled')
    assert(metrics.replies.every(reply => reply.seed === metrics.jobs.find(job => job.jobId === reply.jobId)?.seed), 'Worker changed a seed')
    writeFileSync(join(directory, `day-${repetition}-metrics.json`), JSON.stringify(metrics, null, 2))
    await c.screenshot(join(directory, `day-${repetition}.png`))
    writeFileSync(join(directory, `setups-${repetition}.json`), JSON.stringify(await c.evaluate('window.__bdmBenchmark.setups')))
    // Hash outside the timed interval, in the renderer, without transporting full match histories over CDP.
    const workerResultsSha256 = await c.evaluate(`(async () => {
      const results = window.__bdmBenchmark.replies.map(r => r.result).sort((a,b) => a.gameId.localeCompare(b.gameId))
      const bytes = new TextEncoder().encode(JSON.stringify(results))
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('')
    })()`)
    if (process.env.BDM_BENCH_AUDIT === '1') {
      writeFileSync(join(directory, 'audit-result.json'), JSON.stringify(await c.evaluate('window.__bdmBenchmark.replies.find(r => r.result.gameId.includes(":BRA:") && r.result.gameId.endsWith(":0001")).result')))
      const workerName = readdirSync('dist/assets').find(name => /^matchSimulation\.worker-.*\.js$/.test(name))
      const nativeBundleHash = await c.evaluate(`(async () => {
        const bytes = await (await fetch('/assets/' + ${JSON.stringify(workerName)})).arrayBuffer()
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')
      })()`)
      const browser = await c.send('Browser.getVersion')
      const math = await c.evaluate('Array.from({length:10000},(_,i)=>{const x=(i+1)/37.01;return [Math.sin(x),Math.cos(x),Math.pow(x,0.8),Math.exp(x/100),Math.log(x),Math.hypot(x,Math.sin(x))]})')
      writeFileSync(join(directory, 'runtime-audit.json'), JSON.stringify({ browser, nativeBundleHash, sourceBundleHash: sha(readFileSync(resolve('dist/assets',workerName))), math }))
    }
    await c.send('Page.bringToFront')
    await c.click('button', 'Abrir menú de inicio BDM')
    await c.send('Profiler.start')
    let saveStart = performance.now()
    await c.click('button', 'GUARDAR PARTIDA')
    await c.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 3000 }).catch(() => {})
    let saveActivationRetry = false
    if (!await c.evaluate("document.body.innerText.includes('Partida guardada.')") && !(await c.locate('button', 'GUARDAR PARTIDA'))?.disabled
      && JSON.parse(readFileSync(savePath, 'utf8')).payload.currentDate === JSON.parse(readFileSync(opening, 'utf8')).payload.currentDate) {
      saveActivationRetry = true
      await c.send('Page.bringToFront'); saveStart = performance.now()
      await c.click('button', 'GUARDAR PARTIDA')
    }
    await c.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 120000 })
    const saveMs = performance.now() - saveStart
    const { profile: saveProfile } = await c.send('Profiler.stop')
    writeFileSync(join(directory, `save-${repetition}.cpuprofile`), JSON.stringify(saveProfile))
    const saved = readFileSync(savePath, 'utf8'), payload = JSON.parse(saved).payload
    assert(payload.matchStatLogs.length === 35 && payload.competitions.length === 4 && payload.teams.length === 70, 'Incomplete shared day')
    const payloadSha256 = sha(truth(payload))
    const run = { repetition, profile, ...metrics, saveMs, saveActivationRetry, saveBytes: Buffer.byteLength(saved), payloadSha256, workerResultsSha256, consoleErrors: c.consoleErrors }
    if (process.env.BDM_BENCH_REFERENCE) {
      const reference = JSON.parse(readFileSync(process.env.BDM_BENCH_REFERENCE, 'utf8')).runs[0]
      assert(payloadSha256 === reference.payloadSha256, 'Candidate changed the complete certified persistent world')
      assert(workerResultsSha256 === reference.workerResultsSha256, 'Candidate changed exact match results or event histories')
    }
    if (report.runs.length) {
      assert(payloadSha256 === report.runs[0].payloadSha256, 'Fixed-seed persistent worlds differ')
      assert(workerResultsSha256 === report.runs[0].workerResultsSha256, 'Fixed-seed exact match results differ')
    }
    copyFileSync(savePath, join(directory, `world-${repetition}.json`))
    report.runs.push(run)
    writeFileSync(join(directory, 'benchmark.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ label, repetition, advanceMs: metrics.advanceMs, preparationMs: metrics.preparationUntilFirstPostMs, workersMs: metrics.workersWallMs, afterWorkersMs: metrics.afterLastReplyUntilPaintMs, saveMs, maxFrameGapMs: metrics.maxFrameGapMs, payloadSha256 }))
  } catch (error) {
    writeFileSync(join(directory, `failure-${repetition}.json`), JSON.stringify({ error: String(error), body: await c?.bodyText().catch(() => '<closed>'), consoleErrors: c?.consoleErrors }, null, 2))
    await c?.screenshot(join(directory, `failure-${repetition}.png`)).catch(() => {})
    throw error
  } finally { c?.close(); app?.child.kill(); await sleep(1000) }
}
