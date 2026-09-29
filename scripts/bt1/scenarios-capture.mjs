/**
 * BT1I real-browser evidence for the reproducible scenarios listed in
 * docs/match-basketball-truth/audit/scenarios.json.
 *
 * For each scenario: opens the demo with its seed in REAL Chrome (headed), jumps to the first engine step,
 * plays the possession deterministically and saves N evenly spaced frames in two views:
 *   - plain   : what a viewer sees (circles, ball, court)
 *   - truth   : Basketball Truth (canonical squares vs rendered bodies, targets, facing, assignments)
 * plus a contact sheet per view, the beat log (event order) and canonical-vs-rendered statistics.
 *
 * usage: node scripts/bt1/scenarios-capture.mjs [--out docs/match-basketball-truth/evidence] [--frames 12] [--only screen,drive] [--keepFrames]
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
    return acc
  }, []),
)
const out = String(args.out ?? 'docs/match-basketball-truth/evidence')
const frames = Number(args.frames ?? 12)
const only = args.only ? String(args.only).split(',') : undefined
const port = Number(args.port ?? 5199)
const scenarios = JSON.parse(readFileSync('docs/match-basketball-truth/audit/scenarios.json', 'utf8')).filter((s) => !only || only.includes(s.kind))

const browser = await chromium.launch({ channel: 'chrome', headless: Boolean(args.headless), args: ['--window-size=1560,940'] })

async function open(seed, camera) {
  const page = await browser.newPage({ viewport: { width: 1540, height: 860 } })
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(`http://localhost:${port}/dev-match-phaser.html?seed=${seed}&camera=${camera}&speed=1`)
  await page.waitForFunction(() => window.__bdmBT !== undefined && window.__bdmBT.getFrameInfo() !== undefined, null, { timeout: 30000 })
  await page.evaluate(() => window.__bdmBT.setPaused(true))
  return page
}

async function stageClip(page) {
  return page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
  })
}

async function contactSheet(files, target, columns, title) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const imgs = files.map((f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`)
  await page.setContent(`<body style="margin:0;background:#0b0f14;color:#94a3b8;font:12px monospace"><div style="padding:6px 10px">${title}</div><div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:4px;padding:4px">${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:100%;display:block"/><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">#${i}</span></div>`).join('')}</div></body>`)
  await page.waitForTimeout(500)
  const h = await page.evaluate(() => document.body.scrollHeight)
  await page.setViewportSize({ width: 1600, height: h })
  await page.screenshot({ path: target })
  await page.close()
}

for (const sc of scenarios) {
  const dir = `${out}/${sc.kind}-seed${sc.seed}-steps${sc.firstStep}-${sc.lastStep}`
  mkdirSync(dir, { recursive: true })
  // Pass 1: how long (wall ms at 1x) does the possession take?
  const probe = await open(sc.seed, 'halfCourt')
  await probe.evaluate((n) => window.__bdmBT.seekToSegment(n), sc.firstStep)
  let total = 0
  for (;;) {
    await probe.evaluate(() => window.__bdmBT.advance(250))
    total += 250
    const info = await probe.evaluate(() => window.__bdmBT.getFrameInfo())
    if ((info.segmentIndex ?? 0) > sc.lastStep || total > 180000) break
  }
  await probe.close()
  const every = Math.max(150, Math.floor(total / frames))

  const summary = { scenario: sc, wallMsAt1x: total, everyMs: every, views: {} }
  for (const view of ['plain', 'truth']) {
    const page = await open(sc.seed, 'halfCourt')
    await page.evaluate(
      ({ view }) => {
        const api = window.__bdmBT
        api.setTruthMode(view === 'truth')
        if (view === 'truth') for (const o of ['targets', 'facing', 'assignments']) api.setOverlay(o, true)
      },
      { view },
    )
    await page.evaluate((n) => window.__bdmBT.seekToSegment(n), sc.firstStep)
    await page.waitForTimeout(300)
    const clip = await stageClip(page)
    const files = []
    const diffs = []
    for (let i = 0; i < frames; i += 1) {
      await page.waitForTimeout(150)
      const file = `${dir}/${view}-${String(i).padStart(2, '0')}.png`
      await page.screenshot({ path: file, clip })
      files.push(file)
      const info = await page.evaluate(() => ({ truth: window.__bdmBT.getTruthFrame(), frame: window.__bdmBT.getFrameInfo() }))
      if (info.truth) {
        const d = info.truth.players.map((p) => p.canonicalRenderedDiffMeters ?? 0)
        diffs.push({ frame: i, segment: info.frame.segmentIndex, phase: info.frame.phase, ballLeg: info.frame.ballLeg, maxPlayerDiffM: Math.max(...d), meanPlayerDiffM: d.reduce((a, b) => a + b, 0) / d.length, ballDiffM: info.truth.ball.rendered ? Math.hypot(info.truth.ball.rendered.x - info.truth.ball.canonical.x, info.truth.ball.rendered.y - info.truth.ball.canonical.y) : null })
      }
      await page.evaluate((ms) => window.__bdmBT.advance(ms), every)
    }
    const beats = await page.evaluate(() => window.__bdmBT.getBeatLog())
    await contactSheet(files, `${dir}/sheet-${view}.png`, 3, `${sc.kind} — seed ${sc.seed} — engine steps ${sc.firstStep}-${sc.lastStep} — ${view} (${every} ms between frames, ${total} ms total at 1x)`)
    if (!args.keepFrames) for (const f of files) rmSync(f)
    summary.views[view] = { frames: files.length, diffs }
    if (view === 'plain') writeFileSync(`${dir}/beats.json`, JSON.stringify(beats.filter((b) => b.segment >= sc.firstStep && b.segment <= sc.lastStep + 1), null, 1))
    await page.close()
  }
  writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1))
  console.log(`${sc.kind}: ${total} ms at 1x, ${frames} frames per view -> ${dir}`)
}
await browser.close()
