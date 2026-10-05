/**
 * Real-browser evidence for reproducible Next scenarios (docs/match-next-truth/audit/scenarios.json).
 * Per scenario: plain + truth views, N evenly spaced frames over the tick window, contact sheets, beat log,
 * canonical-vs-rendered stats.
 * usage: node scripts/next/scenarios-capture.mjs --scenarios <json> --out <dir> [--frames 12] [--only rebound,drive] [--keepFrames]
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))
const out = String(args.out ?? 'docs/match-next-truth/evidence')
const frames = Number(args.frames ?? 12)
const only = args.only ? String(args.only).split(',') : undefined
const port = Number(args.port ?? 5288)
const scenarios = JSON.parse(readFileSync(String(args.scenarios ?? 'docs/match-next-truth/audit/scenarios.json'), 'utf8')).filter((s) => !only || only.includes(s.kind))
const browser = await chromium.launch({ channel: 'chrome', headless: Boolean(args.headless), args: ['--window-size=1560,940'] })

async function open(seed) {
  const page = await browser.newPage({ viewport: { width: 1540, height: 860 } })
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(`http://localhost:${port}/dev-match-next.html?seed=${seed}&camera=fullCourt&speed=1`)
  await page.waitForFunction(() => window.__bdmNext !== undefined && window.__bdmNext.getFrameInfo() !== undefined, null, { timeout: 60000 })
  await page.evaluate(() => window.__bdmNext.setPaused(true))
  return page
}
async function sheet(files, target, title) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const imgs = files.map((f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`)
  await page.setContent(`<body style="margin:0;background:#0b0f14;color:#94a3b8;font:12px monospace"><div style="padding:6px 10px">${title}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px">${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:100%;display:block"/><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">#${i}</span></div>`).join('')}</div></body>`)
  await page.waitForTimeout(500)
  await page.setViewportSize({ width: 1600, height: await page.evaluate(() => document.body.scrollHeight) })
  await page.screenshot({ path: target })
  await page.close()
}

for (const sc of scenarios) {
  const dir = `${out}/${sc.kind}-seed${sc.seed}-t${sc.fromTick}-${sc.toTick}`
  mkdirSync(dir, { recursive: true })
  const windowMs = (sc.toTick - sc.fromTick) * 100
  const every = Math.max(100, Math.floor(windowMs / frames))
  const summary = { scenario: sc, everyMs: every, views: {} }
  for (const view of ['plain', 'truth']) {
    const page = await open(sc.seed)
    await page.evaluate(({ view }) => { const a = window.__bdmNext; a.setTruthMode(view === 'truth'); if (view === 'truth') for (const o of ['targets', 'facing', 'assignments', 'slots', 'screens', 'moves']) a.setOverlay(o, true) }, { view })
    await page.evaluate((t) => window.__bdmNext.seekToTick(t), sc.fromTick)
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } })
    const files = []
    const diffs = []
    for (let i = 0; i < frames; i += 1) {
      await page.waitForTimeout(120)
      const file = `${dir}/${view}-${String(i).padStart(2, '0')}.png`
      await page.screenshot({ path: file, clip })
      files.push(file)
      const info = await page.evaluate(() => ({ truth: window.__bdmNext.getTruthFrame(), frame: window.__bdmNext.getFrameInfo() }))
      if (info.truth) { const d = info.truth.players.map((p) => p.diffMeters ?? 0); diffs.push({ frame: i, tick: info.frame.tick, ball: info.truth.ball.kind, maxPlayerDiffM: Math.max(...d) }) }
      await page.evaluate((ms) => window.__bdmNext.advance(ms), every)
    }
    if (view === 'plain') writeFileSync(`${dir}/beats.json`, JSON.stringify((await page.evaluate(() => window.__bdmNext.getBeatLog())).filter((b) => b.tick >= sc.fromTick && b.tick <= sc.toTick && !['defensiveResponsibilityChanged'].includes(b.type)), null, 1))
    await sheet(files, `${dir}/sheet-${view}.png`, `${sc.kind} - seed ${sc.seed} - ticks ${sc.fromTick}-${sc.toTick} - ${view} (${every} ms between frames at 1x)`)
    if (!args.keepFrames) for (const f of files) rmSync(f)
    summary.views[view] = { frames: files.length, diffs }
    await page.close()
  }
  writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1))
  console.log(`${sc.kind}: -> ${dir}`)
}
await browser.close()
