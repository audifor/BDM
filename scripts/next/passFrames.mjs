/**
 * BT4.5 visual validation: frames of chosen passes in the real Phaser renderer.
 * usage: node scripts/next/passFrames.mjs --seed 31337 --list <passes.json> --out <dir> [--port 5299] [--before 3] [--frames 6] [--stepMs 100]
 * passes.json: [{ "t": <release tick>, "label": "..." }]. For each pass the page is sought to (t - before) ticks, paused, and stepped `frames` times.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => { if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return acc }, []))
const seed = Number(args.seed ?? 31337), port = Number(args.port ?? 5299), before = Number(args.before ?? 3), frames = Number(args.frames ?? 6), stepMs = Number(args.stepMs ?? 100)
const out = String(args.out ?? 'pass-frames'); mkdirSync(out, { recursive: true })
const list = JSON.parse(readFileSync(String(args.list), 'utf-8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--window-size=1400,860'] })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 780 } })).newPage()
await page.goto(`http://localhost:${port}/dev-match-next.html?seed=${seed}&camera=fullCourt&speed=1`)
await page.waitForFunction(() => window.__bdmNext?.getFrameInfo() !== undefined, null, { timeout: 60000 })
await page.evaluate(() => { const a = window.__bdmNext; a.setPaused(true); a.setOverlay('names', true); a.setOverlay('action', true) })
// the renderer can only move forward: process the list in tick order
const sorted = [...list].sort((a, b) => a.t - b.t)
let n = 0
for (const item of sorted) {
  await page.evaluate((t) => window.__bdmNext.seekToTick(t), Math.max(0, item.t - before))
  for (let i = 0; i < frames; i += 1) {
    await page.evaluate((ms) => window.__bdmNext.advance(ms), stepMs)
    const info = await page.evaluate(() => window.__bdmNext.getFrameInfo())
    await page.screenshot({ path: `${out}/${String(n).padStart(3, '0')}_${item.label}_f${i}_tick${info.tick}.png` })
  }
  n += 1
}
await browser.close()
console.log(`frames written for ${n} passes in ${out}`)
