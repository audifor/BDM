/**
 * BT1 real-browser capture. Opens the Basketball Truth demo in REAL Chrome (headed unless --headless),
 * pauses live playback and advances the presentation timeline deterministically through
 * window.__bdmBT.advance(), saving PNG frames plus the canonical-vs-rendered truth frame (JSON).
 *
 * usage: node scripts/bt1/capture.mjs --seed 424242 --out docs/match-basketball-truth/evidence/x \
 *          --seconds 40 --every 800 [--truth] [--camera fullCourt|halfCourt|followBall] [--speed 1]
 *          [--until shotMade] [--overlays targets,facing,assignments,path] [--headless]
 *          [--fromSegment N --toSegment M]   (segment = one MatchEngine step, see scenarios.ts)
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
const out = String(args.out ?? `docs/match-basketball-truth/evidence/seed-${seed}`)
const seconds = Number(args.seconds ?? 30)
const every = Number(args.every ?? 1000)
const camera = String(args.camera ?? 'fullCourt')
const speed = Number(args.speed ?? 1)
const port = Number(args.port ?? 5199)
const overlays = String(args.overlays ?? (args.truth ? 'targets,facing,assignments' : '')).split(',').filter(Boolean)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: Boolean(args.headless), args: ['--window-size=1560,940'] })
const page = await browser.newPage({ viewport: { width: 1540, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
await page.goto(`http://localhost:${port}/dev-match-phaser.html?seed=${seed}&camera=${camera}&speed=${speed}`)
await page.waitForFunction(() => window.__bdmBT !== undefined && window.__bdmBT.getFrameInfo() !== undefined, null, { timeout: 30000 })
await page.evaluate(
  ({ truth, overlays }) => {
    const api = window.__bdmBT
    api.setPaused(true)
    api.setTruthMode(Boolean(truth))
    for (const o of overlays) api.setOverlay(o, true)
  },
  { truth: Boolean(args.truth), overlays },
)
await page.waitForTimeout(400)
if (args.fromSegment !== undefined) await page.evaluate((n) => window.__bdmBT.seekToSegment(n), Number(args.fromSegment))
const toSegment = args.toSegment === undefined ? undefined : Number(args.toSegment)

const truthFrames = []
let shot = 0
let elapsed = 0
const until = args.until ? String(args.until) : undefined
let stop = false
while (elapsed < seconds * 1000 && !stop) {
  await page.evaluate((ms) => window.__bdmBT.advance(ms), every)
  elapsed += every
  await page.waitForTimeout(120)
  const name = String(shot).padStart(3, '0')
  await page.screenshot({ path: `${out}/${name}.png` })
  const info = await page.evaluate(() => ({ truth: window.__bdmBT.getTruthFrame(), frame: window.__bdmBT.getFrameInfo() }))
  truthFrames.push({ shot, elapsed, frame: info.frame, truth: info.truth })
  shot += 1
  if (toSegment !== undefined && (info.frame?.segmentIndex ?? 0) > toSegment) stop = true
  if (until) {
    const log = await page.evaluate(() => window.__bdmBT.getBeatLog())
    if (log.some((b) => b.kind === until || b.label === until)) stop = true
  }
}
const beatLog = await page.evaluate(() => window.__bdmBT.getBeatLog())
writeFileSync(`${out}/beats.json`, JSON.stringify(beatLog, null, 1))
writeFileSync(`${out}/truth-frames.json`, JSON.stringify(truthFrames, null, 1))
writeFileSync(`${out}/errors.json`, JSON.stringify(errors, null, 1))
await browser.close()
console.log(`captured ${shot} frames -> ${out}; beats=${beatLog.length}; errors=${errors.length}`)
if (errors.length) console.log(errors.slice(0, 5).join('\n'))
