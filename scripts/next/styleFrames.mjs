/**
 * BT5 visual validation: the same matchup and seed, with a coach identity per team, filmed in the real Phaser renderer.
 * usage: node scripts/next/styleFrames.mjs --seed 31337 --home fast --away controlled --out <dir> [--port 5299] [--from 600] [--to 1800] [--every 10] [--overlays screens,moves]
 * One screenshot every `every` ticks between `from` and `to` (the renderer only moves forward).
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => { if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return acc }, []))
const seed = Number(args.seed ?? 31337), port = Number(args.port ?? 5299), from = Number(args.from ?? 600), to = Number(args.to ?? 1800), every = Number(args.every ?? 10)
const out = String(args.out ?? 'style-frames'); mkdirSync(out, { recursive: true })
const style = (key) => (args[key] ? `&${key}Style=${args[key]}` : '')
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--window-size=1400,860'] })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 780 } })).newPage()
await page.goto(`http://localhost:${port}/dev-match-next.html?seed=${seed}&camera=fullCourt&speed=1${style('home')}${style('away')}`)
await page.waitForFunction(() => window.__bdmNext?.getFrameInfo() !== undefined, null, { timeout: 120000 })
const overlays = String(args.overlays ?? 'names,action,screens,moves').split(',')
await page.evaluate((names) => { const a = window.__bdmNext; a.setPaused(true); for (const n of names) a.setOverlay(n, true) }, overlays)
await page.evaluate((t) => window.__bdmNext.seekToTick(t), from)
let n = 0
for (let t = from; t <= to; t += every) {
  await page.evaluate((target) => window.__bdmNext.seekToTick(target), t)
  const info = await page.evaluate(() => window.__bdmNext.getFrameInfo())
  await page.screenshot({ path: `${out}/${String(n).padStart(4, '0')}_tick${info.tick}.png` })
  n += 1
}
await browser.close()
console.log(`${n} frames in ${out}`)
