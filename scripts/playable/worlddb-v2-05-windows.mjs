// Real Tauri/WebView2 acceptance. Uses the existing Courtside controls and native Save V4.
import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'
import { resolveNativeMedical, resolveNativePress } from './worlddb-v2-native-decisions.mjs'

const out = resolve('.worlddb-v2', 'native-universe-05-' + Date.now())
const profile = 'worlddb-v2-05-native-' + Date.now()
const savePath = join(process.env.APPDATA, 'com.bdm.worlddbv2.pilot', 'saves', 'profiles', profile, 'main.json')
const certifiedCheckpoint = process.env.BDM_NATIVE_CHECKPOINT
mkdirSync(out, { recursive: true })
if (certifiedCheckpoint) { mkdirSync(dirname(savePath), { recursive: true }); copyFileSync(certifiedCheckpoint, savePath) }
let app, c
const steps = []
const assert = (ok, message) => { if (!ok) throw Error(message) }
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const truth = v => { const x = structuredClone(v); x.staffCareerRuntime.governanceDecisionEvents.sort((a,b) => a.id.localeCompare(b.id)); return JSON.stringify(canonical(x)) }
async function launch() {
  app = await launchApp(resolve('artifacts/bdm.exe'), 9555, { BDM_SAVE_PROFILE: profile, WEBVIEW2_USER_DATA_FOLDER: join(out, 'webview') })
  c = await connect(app.page.webSocketDebuggerUrl)
  await c.waitFor("document.body?.innerText.includes('NEW GAME')", { timeout: 60000 })
}
async function field(label, value) {
  await c.evaluate(`(() => { const l = [...document.querySelectorAll('label')].find(l => l.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!l) throw Error('Missing field'); const e = l.querySelector('input,select,textarea'); const p = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await sleep(200)
}
async function open(name, group) {
  await c.click('button', 'Abrir menú de inicio BDM')
  await c.click('button', '=' + group)
  await c.click('button', '=' + name)
  await sleep(500)
}
async function save(name) {
  await c.click('button', 'Abrir menú de inicio BDM')
  await c.click('button', 'GUARDAR PARTIDA')
  await c.waitFor("document.body?.innerText.includes('Partida guardada.')", { timeout: 60000 })
  await c.click('button', 'Abrir menú de inicio BDM')
  const v = JSON.parse(readFileSync(savePath, 'utf8'))
  writeFileSync(join(out, name + '.json'), JSON.stringify(v))
  return v
}
async function day() {
  const before = await c.evaluate("document.querySelector('.ng-system-bar__date').innerText")
  await open('MATCH', 'Partidos y competición')
  await c.click('button', 'AVANZAR UN DÍA')
  // WebView2 may consume the first mouse activation after opening a workspace.
  // Retry only while the date is unchanged and no simulation or error exists.
  await sleep(1500)
  if (await c.evaluate(`document.querySelector('.ng-system-bar__date')?.innerText === ${JSON.stringify(before)} && !document.body.innerText.includes('SIMULATION RUNNING') && !document.querySelector('[role="alert"]')`)) await c.click('button', 'AVANZAR UN DÍA')
  assert(!await c.locate('[role=alert]'), 'Day advance reported an error')
  await c.waitFor(`document.querySelector('.ng-system-bar__date')?.innerText !== ${JSON.stringify(before)}`, { timeout: 600000 })
}
async function step(name, action) {
  try {
    const detail = await action()
    steps.push({ name, status: 'PASS', detail })
    await c.screenshot(join(out, name + '.png'))
    console.log('PASS ' + name)
  } catch (error) {
    steps.push({ name, status: 'FAIL', error: String(error), text: await c.bodyText().catch(() => '<closed>') })
    await c.screenshot(join(out, 'failure.png')).catch(() => {})
    throw error
  } finally {
    writeFileSync(join(out, 'acceptance.json'), JSON.stringify({ passed: steps.length === (certifiedCheckpoint ? 3 : 5) && steps.every(s => s.status === 'PASS'), certifiedCheckpoint, profile, savePath, steps, consoleErrors: c?.consoleErrors ?? [] }, null, 2))
  }
}
try {
  await launch()
  if (certifiedCheckpoint) {
    await step('load-certified-checkpoint', async () => {
      await c.click('button', '=CONTINUE')
      await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')", { timeout: 120000 })
      const restored = await save('certified-loaded')
      const original = JSON.parse(readFileSync(certifiedCheckpoint, 'utf8'))
      assert(truth(restored.payload) === truth(original.payload), 'Certified universe changed during native load')
      assert(restored.payload.competitions.length === 4 && restored.payload.teams.length === 70, 'Missing universe state')
      return { date: restored.payload.currentDate, actas: restored.payload.matchStatLogs.length }
    })
  } else {
  await step('new-shared-career', async () => {
    await c.click('button', '=NEW GAME')
    await field('UNIVERSE', 'worldDbV2')
    assert(await c.evaluate("document.querySelectorAll('fieldset input[type=checkbox]:checked').length === 4"), 'Four active leagues must be selected')
    await field('WORLDDB SOURCE FOLDER', process.env.WORLDDB_SOURCE_ROOT ?? 'C:/BDM_DB/WORLDDB_PBM')
    await c.waitFor("[...document.querySelectorAll('select option')].some(o => o.value === 'pbm:DYN_equipe:41')", { timeout: 60000 })
    await field('TEAM', 'pbm:DYN_equipe:41')
    await field('START DATE', '2025-10-04')
    await field('WORLD SEED', 'worlddb-v2-universe-05')
    await field('COACH FIRST NAME', 'Universe')
    await field('COACH LAST NAME', 'Windows')
    await c.click('button', 'START CAREER')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')", { timeout: 180000 })
    const v = await save('opening')
    assert(v.payload.teams.length === 70 && v.payload.competitions.length === 4, 'Expected one 70-club universe')
    assert(v.payload.worldDbCompetitionRuntime.worldDbV2.activeCompetitionIds.length === 4, 'Missing active identities')
    return { teams: 70, competitions: 4, games: v.payload.games.length }
  })
  await step('all-four-leagues-play', async () => {
    const started = Date.now()
    await day()
    const v = await save('played')
    const leagues = v.payload.competitions.map(comp => ({ id: comp.id, completed: v.payload.games.filter(g => g.competitionId === comp.id && g.status === 'completed').length }))
    assert(leagues.every(row => row.completed > 0), 'A league did not advance')
    assert(v.payload.matchStatLogs.length === 35, 'Expected 35 real match actas')
    return { leagues, elapsedMs: Date.now() - started, cores: await c.evaluate('navigator.hardwareConcurrency') }
  })
  await step('consult-other-competitions', async () => {
    await open('COMPETITION', 'Partidos y competición')
    const leagues = await c.evaluate("[...document.querySelector('select[aria-label=\"Competición\"]').options].map(o => ({id:o.value,name:o.text}))")
    assert(leagues.length === 4, 'Other leagues missing from Courtside')
    for (const league of leagues) {
      await c.evaluate(`(() => { const e = document.querySelector('select[aria-label="Competición"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(league.id)}); e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
      await sleep(400)
      await c.click('button,[role=tab]', '=Clasificación')
      await c.screenshot(join(out, league.id.replaceAll(':', '-') + '.png'))
      assert((await c.bodyText()).includes(league.name), 'Competition selection failed')
    }
    return leagues
  })
  }
  await step('global-market-rosters', async () => {
    await open('MARKET', 'Mercado')
    await c.click('button', '=Buscar jugadores')
    await c.click('summary', 'Más filtros')
    const leagues = await c.evaluate("[...document.querySelector('select[aria-label=\"Competición\"]').options].filter(o=>o.value).map(o=>o.value)")
    assert(leagues.length === 4, 'Global market must expose all four active leagues')
    for (const league of leagues) {
      await field('Competición', league)
      assert(await c.locate('.market-talent__player'), 'Active league has no searchable player')
    }
    return leagues
  })
  await step('save-close-load-continue', async () => {
    const checkpoint = await save('before-close')
    c.close(); app.child.kill(); await sleep(1500)
    await launch()
    await c.click('button', '=CONTINUE')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')", { timeout: 60000 })
    const reopened = await save('reopened')
    assert(truth(reopened.payload) === truth(checkpoint.payload), 'Native reload changed world truth')
    await resolveNativePress(c, open, out)
    await resolveNativeMedical(c, open, out)
    await day()
    const after = await save('continued')
    assert(after.payload.currentDate > reopened.payload.currentDate && after.payload.competitions.length === 4, 'Whole universe did not continue')
    return { date: after.payload.currentDate, actas: after.payload.matchStatLogs.length }
  })
} finally {
  c?.close(); app?.child.kill()
  console.log(JSON.stringify({ out, profile }))
}
