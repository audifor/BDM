/** Real-time soak of the Next demo in real Chrome with video. usage: node scripts/next/soak.mjs --seed 424242 --minutes 5 --speed 2 --out <dir> [--truthAfter 150] */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => { if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return acc }, []))
const seed = Number(args.seed ?? 424242), minutes = Number(args.minutes ?? 5), speed = Number(args.speed ?? 2), truthAfter = Number(args.truthAfter ?? minutes * 30), port = Number(args.port ?? 5288)
const out = String(args.out ?? 'next-soak'); mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1400,860'] })
const context = await browser.newContext({ viewport: { width: 1360, height: 780 }, recordVideo: { dir: out, size: { width: 1360, height: 780 } } })
const page = await context.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`http://localhost:${port}/dev-match-next.html?seed=${seed}&camera=fullCourt&speed=${speed}`)
await page.waitForFunction(() => window.__bdmNext?.getFrameInfo() !== undefined, null, { timeout: 60000 })
const samples = []; const start = Date.now(); let truthOn = false, shot = 0
while ((Date.now() - start) / 1000 < minutes * 60) {
  await page.waitForTimeout(2000)
  const el = (Date.now() - start) / 1000
  if (!truthOn && el > truthAfter) { truthOn = true; await page.evaluate(() => { const a = window.__bdmNext; a.setCamera('halfCourt'); a.setTruthMode(true); for (const o of ['targets', 'facing', 'assignments', 'slots', 'screens', 'moves']) a.setOverlay(o, true) }) }
  const info = await page.evaluate(() => ({ f: window.__bdmNext.getFrameInfo(), t: window.__bdmNext.getTruthFrame() }))
  if (info.t) { const d = info.t.players.map((p) => p.diffMeters ?? 0); samples.push({ t: Math.round(el), tick: info.f.tick, period: info.f.period, score: info.f.score, maxDiff: Math.max(...d), meanDiff: d.reduce((a, b) => a + b, 0) / d.length }) }
  if (Math.round(el) % 20 < 2 && shot < 30) { await page.screenshot({ path: `${out}/t${String(Math.round(el)).padStart(4, '0')}.png` }); shot += 1 }
}
const beats = await page.evaluate(() => window.__bdmNext.getBeatLog())
const seqs = beats.map((b) => b.sequence); let outOfOrder = 0; for (let i = 1; i < seqs.length; i += 1) if (seqs[i] <= seqs[i - 1]) outOfOrder += 1
const counts = {}; for (const b of beats) counts[b.type] = (counts[b.type] ?? 0) + 1
const summary = { seed, minutes, speed, console_errors: errors, engineEventsPlayed: beats.length, eventsOutOfOrderOrDuplicated: outOfOrder, eventKinds: counts, lastTick: samples.at(-1)?.tick, lastScore: samples.at(-1)?.score, period: samples.at(-1)?.period, canonicalRenderedGap: { maxOfMax: Math.max(...samples.map((s) => s.maxDiff)), meanOfMean: samples.reduce((a, s) => a + s.meanDiff, 0) / Math.max(1, samples.length) } }
writeFileSync(`${out}/soak-summary.json`, JSON.stringify(summary, null, 1)); writeFileSync(`${out}/soak-samples.json`, JSON.stringify(samples, null, 1))
await context.close(); await browser.close(); console.log(JSON.stringify(summary, null, 1))
