/**
 * Real-browser capture for MatchEngine Next Basketball Truth.
 * usage: node scripts/next/capture.mjs --seed 424242 --out <dir> [--fromTick 0 --toTick 400] [--every 500] [--truth]
 *        [--camera fullCourt|halfCourt|followBall] [--overlays targets,facing,assignments,slots] [--headless] [--period 120]
 * Frames are advanced deterministically (window.__bdmNext.advance) with playback paused.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))
const seed = Number(args.seed ?? 424242)
const out = String(args.out ?? `next-capture-${seed}`)
const every = Number(args.every ?? 500)
const fromTick = args.fromTick === undefined ? 0 : Number(args.fromTick)
const toTick = args.toTick === undefined ? fromTick + 300 : Number(args.toTick)
const camera = String(args.camera ?? 'fullCourt')
const port = Number(args.port ?? 5288)
const overlays = String(args.overlays ?? (args.truth ? 'targets,facing,assignments,slots' : '')).split(',').filter(Boolean)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: Boolean(args.headless), args: ['--window-size=1560,940'] })
const page = await browser.newPage({ viewport: { width: 1540, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`http://localhost:${port}/dev-match-next.html?seed=${seed}&camera=${camera}&speed=1${args.period ? `&period=${args.period}` : ''}`)
await page.waitForFunction(() => window.__bdmNext !== undefined && window.__bdmNext.getFrameInfo() !== undefined, null, { timeout: 60000 })
await page.evaluate(({ truth, overlays }) => { const a = window.__bdmNext; a.setPaused(true); a.setTruthMode(Boolean(truth)); for (const o of overlays) a.setOverlay(o, true) }, { truth: Boolean(args.truth), overlays })
if (fromTick > 0) await page.evaluate((t) => window.__bdmNext.seekToTick(t), fromTick)
await page.waitForTimeout(300)
const frames = []
let n = 0
for (;;) {
  const info = await page.evaluate(() => window.__bdmNext.getFrameInfo())
  if (info.tick > toTick) break
  await page.screenshot({ path: `${out}/${String(n).padStart(3, '0')}.png` })
  frames.push(await page.evaluate(() => ({ info: window.__bdmNext.getFrameInfo(), truth: window.__bdmNext.getTruthFrame() })))
  n += 1
  await page.evaluate((ms) => window.__bdmNext.advance(ms), every)
  await page.waitForTimeout(100)
  if (n > 400) break
}
writeFileSync(`${out}/beats.json`, JSON.stringify(await page.evaluate(() => window.__bdmNext.getBeatLog()), null, 1))
writeFileSync(`${out}/frames.json`, JSON.stringify(frames, null, 1))
writeFileSync(`${out}/errors.json`, JSON.stringify(errors, null, 1))
await browser.close()
console.log(`captured ${n} frames -> ${out}; errors=${errors.length}`)
if (errors.length) console.log(errors.slice(0, 5).join('\n'))
