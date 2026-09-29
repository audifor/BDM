/**
 * BT1 real-time soak: plays the demo for several minutes in REAL Chrome (headed) at real time, records a video
 * (Playwright webm) and samples the truth frame + frame info periodically. Reports stability facts:
 * console errors, event order/duplication in the beat log, canonical-vs-rendered gap statistics.
 *
 * usage: node scripts/bt1/soak-video.mjs --seed 424242 --minutes 4 --speed 2 --out <dir> [--truthAfter 120]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
    return acc
  }, []),
)
const seed = Number(args.seed ?? 424242)
const minutes = Number(args.minutes ?? 4)
const speed = Number(args.speed ?? 2)
const truthAfter = Number(args.truthAfter ?? minutes * 30) // seconds
const port = Number(args.port ?? 5199)
const out = String(args.out ?? 'bt1-soak')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1400,860'] })
const context = await browser.newContext({ viewport: { width: 1360, height: 780 }, recordVideo: { dir: out, size: { width: 1360, height: 780 } } })
const page = await context.newPage()
const errors = []
const failed = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
})
await page.goto(`http://localhost:${port}/dev-match-phaser.html?seed=${seed}&camera=fullCourt&speed=${speed}`)
await page.waitForFunction(() => window.__bdmBT !== undefined && window.__bdmBT.getFrameInfo() !== undefined, null, { timeout: 30000 })

const samples = []
const start = Date.now()
let truthOn = false
let shot = 0
while ((Date.now() - start) / 1000 < minutes * 60) {
  await page.waitForTimeout(2000)
  const elapsed = (Date.now() - start) / 1000
  if (!truthOn && elapsed > truthAfter) {
    truthOn = true
    await page.evaluate(() => {
      const api = window.__bdmBT
      api.setCamera('halfCourt')
      api.setTruthMode(true)
      for (const o of ['targets', 'facing', 'assignments']) api.setOverlay(o, true)
    })
  }
  const info = await page.evaluate(() => ({ frame: window.__bdmBT.getFrameInfo(), truth: window.__bdmBT.getTruthFrame() }))
  if (info.truth) {
    const d = info.truth.players.map((p) => p.canonicalRenderedDiffMeters ?? 0)
    samples.push({ t: Math.round(elapsed), segment: info.frame.segmentIndex, phase: info.frame.phase, queued: info.frame.queued, score: info.frame.score, period: info.frame.period, clock: Math.round(info.frame.clock), maxDiff: Math.max(...d), meanDiff: d.reduce((a, b) => a + b, 0) / d.length })
  }
  if (Math.round(elapsed) % 20 < 2 && shot < 40) {
    await page.screenshot({ path: `${out}/t${String(Math.round(elapsed)).padStart(4, '0')}.png` })
    shot += 1
  }
}
const beats = await page.evaluate(() => window.__bdmBT.getBeatLog())
const bySeq = beats.filter((b) => b.eventSequence !== undefined)
const seqs = bySeq.map((b) => b.eventSequence)
let outOfOrder = 0
for (let i = 1; i < seqs.length; i += 1) if (seqs[i] < seqs[i - 1]) outOfOrder += 1
const counts = {}
for (const b of beats) counts[b.kind] = (counts[b.kind] ?? 0) + 1
const summary = {
  seed,
  minutes,
  speed,
  console_errors: errors,
  failed_requests: failed,
  beats: beats.length,
  beatKinds: counts,
  engineEventBeats: bySeq.length,
  eventsOutOfOrder: outOfOrder,
  lastSegment: samples.at(-1)?.segment,
  lastScore: samples.at(-1)?.score,
  maxQueued: Math.max(...samples.map((s) => s.queued)),
  canonicalRenderedGap: { maxOfMax: Math.max(...samples.map((s) => s.maxDiff)), meanOfMean: samples.reduce((a, s) => a + s.meanDiff, 0) / Math.max(1, samples.length) },
}
writeFileSync(`${out}/soak-summary.json`, JSON.stringify(summary, null, 1))
writeFileSync(`${out}/soak-samples.json`, JSON.stringify(samples, null, 1))
await context.close()
await browser.close()
console.log(JSON.stringify(summary, null, 1))
