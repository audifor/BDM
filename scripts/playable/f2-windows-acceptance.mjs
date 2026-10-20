// F2 acceptance on the real Windows executable (Tauri debug build with the embedded production frontend, no Vite server).
// Drives the WebView2 of bdm.exe through the DevTools protocol with real mouse events and screenshots: it loads a valid F1 career, plans
// training from Courtside, delegates a staff function, advances days, plays matches, saves, closes, reloads and completes the 30 days.
// The user's native save is backed up first and restored at the end.
//
//   npm run tauri -- build --debug --no-bundle -- --offline
//   node scripts/playable/f2-windows-acceptance.mjs
//   (F2_FROM_SAVE=<Save V4 file after the first match> skips career creation; used only to iterate on this script)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash as hash } from 'node:crypto'
import { join } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'

const EXE = process.env.BDM_EXE ?? 'C:/BDM/src-tauri/target/debug/bdm.exe'
const OUT = process.env.F2_EVIDENCE_DIR ?? 'docs/playable/evidence/f2'
const FIXTURE = process.env.F2_FROM_SAVE
const SAVE = join(process.env.APPDATA, 'com.bdm.app', 'saves', 'main.json')
const BACKUP = join(process.env.TEMP ?? '.', 'bdm-f2-user-save-backup.json')
const PORT = 9433
const sha = (path) => hash('sha256').update(readFileSync(path)).digest('hex')
// Key-order independent: JSON object insertion order is not state (the same convention as the Save V4 equivalence tests).
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
const normalizedPayloadHash = (save) => hash('sha256').update(JSON.stringify(canonical(save.payload))).digest('hex')

mkdirSync(OUT, { recursive: true })
const steps = []
let cdp
let app
const shot = (name) => cdp.screenshot(join(OUT, `${name}.png`))
const step = async (id, title, action) => {
  const started = Date.now()
  try {
    const detail = await action()
    steps.push({ id, title, result: 'PASS', ms: Date.now() - started, ...(detail === undefined ? {} : { detail }) })
    console.log(`PASS ${id} ${title}`)
  } catch (error) {
    steps.push({ id, title, result: 'FAIL', error: String(error?.message ?? error) })
    console.error(`FAIL ${id} ${title}: ${error?.message ?? error}`)
    throw error
  }
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const text = () => cdp.bodyText()
const has = (value) => cdp.evaluate(`document.body.innerText.includes(${JSON.stringify(value)})`)
const readSave = () => JSON.parse(readFileSync(SAVE, 'utf8'))

async function launch() {
  app = await launchApp(EXE, PORT)
  cdp = await connect(app.page.webSocketDebuggerUrl)
  cdp.setField = (label, value) => cdp.evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].filter((l) => l.getBoundingClientRect().width > 0).find((l) => (l.innerText || '').trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())}))
    if (!label) throw new Error('No field ' + ${JSON.stringify(label)})
    const el = label.querySelector('select,input,textarea')
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(1500)
}
async function closeApp() {
  try { cdp.close() } catch { /* already closed */ }
  app.child.kill()
  await sleep(2500)
}
async function openApp(label) {
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
  await cdp.click('button', `=${label}`); await sleep(2200)
}
async function saveGame() {
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
  await cdp.click('button', 'GUARDAR PARTIDA')
  await cdp.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 30000, label: 'save confirmation' })
  await sleep(400)
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(300)
}
/** Clicks (with real mouse events) the button with `buttonText` inside the first element matching `rowSelector` that contains `rowText`. */
async function clickInRow(rowSelector, rowText, buttonText) {
  const target = await cdp.evaluate(`(() => {
    const row = [...document.querySelectorAll(${JSON.stringify(rowSelector)})].filter((el) => el.getBoundingClientRect().width > 0).find((el) => el.innerText.includes(${JSON.stringify(rowText)}))
    if (!row) return null
    const button = [...row.querySelectorAll('button')].find((b) => b.innerText.includes(${JSON.stringify(buttonText)}))
    if (!button) return null
    button.scrollIntoView({ block: 'center' })
    const r = button.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  assert(target !== null, `No "${buttonText}" in row "${rowText}"`)
  for (const [type, extra] of [['mouseMoved', {}], ['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]]) await cdp.send('Input.dispatchMouseEvent', { type, x: target.x, y: target.y, ...extra })
  await sleep(500)
}
/** Plays the user game of the day with the quick simulation and waits for its acta. */
async function quickSimUserGame(previousGameIds) {
  await cdp.click('button', '=MATCH'); await sleep(2500)
  await cdp.click('button', 'SIMULACIÓN RÁPIDA')
  await cdp.waitFor(`[...document.querySelectorAll('[aria-label="Acta del partido"]')].some((el) => !${JSON.stringify(previousGameIds)}.includes(el.dataset.gameId))`, { timeout: 300000, label: 'new acta' })
  await sleep(800)
  return cdp.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label="Acta del partido"]')].find((e) => !${JSON.stringify(previousGameIds)}.includes(e.dataset.gameId)); return { gameId: el.dataset.gameId, score: [...el.querySelectorAll('.mp-report__score b')].map((b) => Number(b.innerText)) } })()`)
}
async function continueToUserGame(dateLabel) {
  await cdp.click('button', '=Home'); await sleep(1200)
  await cdp.click('button', 'CONTINUE')
  await cdp.waitFor(`document.body.innerText.includes(${JSON.stringify(dateLabel)}) && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH')`, { timeout: 300000, label: `Continue stops on ${dateLabel}` })
  await sleep(1200)
}
function saveFacts(save) {
  const p = save.payload
  const completed = p.games.filter((game) => game.status === 'completed')
  const done = p.scheduledTrainingSessions.filter((s) => s.teamId === 'acb-team-ucm' && s.status === 'completed')
  const events = p.developmentStimulusEvents ?? []
  return {
    completedGames: completed.length, userGames: completed.filter((g) => g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm').map((g) => `${g.date} ${g.result.homeScore}-${g.result.awayScore}`),
    uniqueCompletedGames: new Set(completed.map((g) => g.id)).size, statLogs: p.matchStatLogs.length,
    userSessionsCompleted: done.length, userSessionDates: done.map((s) => s.date).sort(), userSessionModules: done.map((s) => `${s.date} ${s.scope} ${s.execution?.plannedModuleName}->${s.execution?.moduleName}`).sort(), uniqueSessions: new Set(done.map((s) => s.id)).size,
    sessionsWithoutEvidence: done.filter((s) => s.execution === undefined).length,
    positiveFatigueDeltas: done.flatMap((s) => s.execution?.participants ?? []).filter((p) => p.careerFatigueDelta > 0).length,
    negativeFatigueDeltas: done.flatMap((s) => s.execution?.participants ?? []).filter((p) => p.careerFatigueDelta < 0).length,
    stimulusEvents: events.length, uniqueStimulusEvents: new Set(events.map((e) => e.id)).size,
    userCohesion: p.teamCohesion.find((c) => c.teamId === 'acb-team-ucm')?.value,
    responsibilities: p.responsibilities.filter((r) => r.teamId === 'acb-team-ucm' && r.mode !== 'userControlled').map((r) => `${r.kind}:${r.mode}:${r.holderStaffId}`),
    delegationOutcomes: (p.delegationOutcomes ?? []).filter((o) => o.kind === 'assignIndividualDevelopment').length,
  }
}

const evidence = { platform: 'Windows Tauri debug executable, embedded production frontend (no Vite)', exe: EXE }
const userSaveHash = existsSync(SAVE) ? sha(SAVE) : null
if (existsSync(SAVE)) copyFileSync(SAVE, BACKUP)
evidence.userSaveSha256Before = userSaveHash
let firstGame
let starters = []
let bench = []
const gameIds = []

try {
  await launch()
  await step(1, 'Cargar una partida F1 válida (carrera ACB creada, primer partido disputado, guardada y recargada tras reiniciar)', async () => {
    if (FIXTURE === undefined) {
      await cdp.click('button', 'NEW GAME'); await sleep(500)
      await cdp.setField('UNIVERSE', 'acb-2026-27'); await sleep(400)
      await cdp.setField('TEAM', 'ucm'); await sleep(200)
      await cdp.setField('COACH FIRST NAME', 'Elena'); await cdp.setField('COACH LAST NAME', 'Piloto')
      await cdp.setField('DATE OF BIRTH', '1990-01-01'); await cdp.setField('GENDER', 'female'); await cdp.setField('NATIONALITY', 'ESP')
      await cdp.click('button', 'START CAREER')
      await cdp.waitFor("document.body.innerText.includes('UCAM MURCIA') && document.body.innerText.includes('01 JUL 2026')", { timeout: 60000 })
      await sleep(1500)
      await continueToUserGame('26 SEPT 2026')
      firstGame = await quickSimUserGame([])
      await saveGame()
      await closeApp()
      await launch()
    } else {
      await closeApp()
      copyFileSync(FIXTURE, SAVE)
      await launch()
    }
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('26 SEPT 2026') && document.body.innerText.includes('UCAM MURCIA')", { timeout: 60000 })
    await sleep(1500)
    const save = readSave()
    assert(save.schemaVersion === 4, 'Native Save V4 expected')
    const facts = saveFacts(save)
    assert(facts.userGames.length === 1, `The F1 career must have exactly one played user game, got ${facts.userGames}`)
    evidence.startingSave = { payloadSha256: normalizedPayloadHash(save), ...facts }
    gameIds.push(save.payload.games.find((g) => g.status === 'completed' && (g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm')).id)
    await shot('01-f1-career-loaded')
  })

  await step(2, 'Periodo seleccionado y calendario: próximos encuentros del club desde Home y el calendario', async () => {
    const body = await text()
    assert(body.includes('Valencia Basket') && body.includes('03 OCT 2026'), 'Home must show the next fixture (Valencia Basket, 3 Oct)')
    assert(body.includes('Asisa Joventut') && body.includes('10 OCT 2026') && body.includes('24 OCT 2026'), 'The upcoming fixtures list must reach 24 Oct')
    await shot('02-home-calendar')
    return { window: '2026-09-26 → 2026-10-26 (30 días)', userFixtures: ['03 OCT Valencia Basket', '10 OCT Asisa Joventut', '17 OCT Río Breogán', '24 OCT Real Madrid'] }
  })

  await step(3, 'Training Studio: programar entrenamientos (sesión de equipo, táctica, recuperación) y generar semanas automáticas', async () => {
    await openApp('TRAINING')
    await cdp.click('button', '›'); await sleep(600)
    const plan = [['28', 'defensiveSystem', 'normal'], ['29', 'threePoint', 'normal'], ['30', 'offensiveSystem', 'light'], ['01', 'activeRecovery', 'light']]
    for (const [day, exercise, intensity] of plan) {
      const date = day === '01' ? '2026-10-01' : `2026-09-${day}`
      await cdp.setField('Ejercicio', exercise); await cdp.setField('Intensidad', intensity); await cdp.setField('Fecha', date)
      await cdp.click('button', 'PROGRAMAR'); await sleep(700)
    }
    const week = await cdp.evaluate(`[...document.querySelectorAll('.cts-day')].map((d) => d.innerText.split(/[\\n\\t ]+/).join(' '))`)
    const planned = ['Defensive System', 'Three-Point Shooting', 'Offensive System', 'Active Recovery'].map((name) => week.some((day) => day.includes(name)))
    assert(planned.every(Boolean), `The planned week must list the four sessions, got ${JSON.stringify(week)}`)
    assert((await text()).includes('PARTIDO'), 'The match day of the week must be marked')
    await shot('03-week-planned')
    // Following weeks: the team plan (focus/intensity) fills every non-match day.
    await cdp.click('button', 'GESTIÓN DE CARGA'); await sleep(1200)
    await cdp.click('button', 'Equipo'); await sleep(800)
    await cdp.setField('Foco', 'shooting'); await cdp.setField('Intensidad', 'normal'); await sleep(400)
    await shot('04-team-plan-focus')
    await cdp.click('button', 'Siguiente'); await sleep(400) // 28 Sep - 4 Oct: planned by hand above
    for (let week = 0; week < 3; week += 1) { // 5-11, 12-18 and 19-25 Oct from the team plan
      await cdp.click('button', 'Siguiente'); await sleep(500)
      await cdp.click('button', 'Entrenamientos automáticos'); await sleep(900)
    }
    await cdp.click('button', '=CERRAR ×'); await sleep(500)
  })

  await step(4, 'Objetivo individual: asignar un ejercicio a un jugador y fijar su objetivo de desarrollo', async () => {
    await clickInRow('.cts-tabs', 'INDIVIDUAL', 'INDIVIDUAL'); await sleep(900)
    const player = await cdp.evaluate(`[...document.querySelectorAll('.cts-person-name strong')][0].innerText`)
    await cdp.setField('Jugador', await cdp.evaluate(`[...document.querySelectorAll('select option')].find((o) => o.text === ${JSON.stringify(player)}).value`))
    await cdp.setField('Ejercicio', 'threePoint')
    await cdp.click('button', 'ASIGNAR EJERCICIO'); await sleep(900)
    const feedback = await cdp.evaluate(`document.querySelector('.cts-feedback')?.innerText ?? ''`)
    await shot('05-individual-assigned')
    assert(feedback.includes('Sesión individual asignada'), `The individual session must be assigned, got: ${feedback}`)
    await shot('05-individual-assigned')
    return { player }
  })

  await step(5, 'Staff: delegar el desarrollo individual en un responsable (Asignaciones)', async () => {
    await openApp('STAFF')
    await cdp.click('button', 'ASIGNACIONES'); await sleep(1500)
    await cdp.click('button', 'MODO SENCILLO'); await sleep(800)
    await clickInRow('.cs-staff-simple-assignment__row', 'Assign Individual Development', 'ASIGNAR / CAMBIAR'); await sleep(900)
    await shot('06-staff-popover')
    const candidate = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].filter((el) => el.getBoundingClientRect().width > 0).find((el) => /^S[A-Z]\\s+Staff\\d+/.test(el.innerText.trim())); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.innerText.replace(/\\s+/g, ' ').slice(0, 80) } })()`)
    assert(candidate !== null, 'The assignment popover must offer staff candidates')
    for (const [type, extra] of [['mouseMoved', {}], ['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]]) await cdp.send('Input.dispatchMouseEvent', { type, x: candidate.x, y: candidate.y, ...extra })
    await sleep(1000)
    const row = await cdp.evaluate(`[...document.querySelectorAll('.cs-staff-simple-assignment__row')].find((el) => el.innerText.includes('Assign Individual Development'))?.innerText.replace(/\\s+/g, ' ')`)
    assert(row !== undefined && !row.includes('Bajo tu control'), `The responsibility must now have a holder: ${row}`)
    await shot('07-staff-delegated')
    return { candidate: candidate.label, row }
  })

  await step(6, 'Training > Staff refleja la delegación canónica (herramientas detalladas)', async () => {
    await openApp('TRAINING')
    await cdp.click('button', 'MÓDULOS / STAFF'); await sleep(900)
    await cdp.click('button', '=Staff'); await sleep(900)
    const body = await text()
    assert(body.includes('Create Team Training Plan') && body.includes('Assign Individual Development'), 'Training > Staff must list the training Responsibilities')
    assert(/DELEGATED/.test(body) && !body.includes('Sin datos de plantilla técnica'), 'The delegated Responsibility must be visible, not the retired legacy map')
    await shot('08-training-staff-tab')
    await cdp.click('button', '=CERRAR ×'); await sleep(400)
  })

  await step(7, 'Avanzar varios días (CONTINUE hasta el primer partido, 3 de octubre) y comprobar que las sesiones programadas se ejecutaron', async () => {
    await continueToUserGame('03 OCT 2026')
    await saveGame()
    const facts = saveFacts(readSave())
    assert(facts.userSessionDates.join() === ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].join(), `Executed sessions must be exactly the five scheduled (4 team + 1 individual, assigned for the next day), got ${facts.userSessionDates}`)
    assert(facts.sessionsWithoutEvidence === 0 && facts.userSessionsCompleted === facts.uniqueSessions, 'Every executed session has evidence and is unique')
    for (const wanted of ['2026-09-28 team Defensive System->Defensive System', '2026-09-29 team Three-Point Shooting->Three-Point Shooting', '2026-09-30 team Offensive System->Offensive System', '2026-10-01 team Active Recovery->Active Recovery']) assert(facts.userSessionModules.includes(wanted), `Missing executed session ${wanted} in ${facts.userSessionModules}`)
    assert(facts.userSessionModules.some((line) => line.startsWith('2026-09-27 individual Three-Point Shooting->')), 'The individual session planned as Three-Point Shooting must be executed (as decided by the delegated developer)')
    assert(facts.delegationOutcomes === 1, 'The delegated individual session must record one DelegationOutcome')
    assert(facts.positiveFatigueDeltas > 0 && facts.negativeFatigueDeltas > 0, 'Training sessions must have added load and recovery sessions removed it')
    assert(facts.userCohesion > 50, `Tactical sessions must raise cohesion above 50, got ${facts.userCohesion}`)
    evidence.afterFirstWeek = facts
    await shot('09-match-day-1')
    return facts
  })

  await step(8, 'Consecuencias en Training (RESULTADOS) y Medical (fatiga) coherentes con las sesiones', async () => {
    await openApp('TRAINING')
    await cdp.click('button', 'RESULTADOS'); await sleep(900)
    const body = await text()
    assert(/COMPLETADAS\s*\n?\s*5/.test(body), 'Training RESULTADOS must show 5 completed sessions')
    await shot('10-training-results')
    const trainingAverage = await cdp.evaluate(`(() => { const m = document.body.innerText.match(/FATIGA MEDIA[\\n ]*([0-9.]+)%/); return m ? Number(m[1]) : null })()`)
    await openApp('MEDICAL')
    const medical = await cdp.evaluate(`(() => { const m = document.body.innerText.match(/AVERAGE FATIGUE[^0-9]*([0-9.]+)/); return m ? Number(m[1]) : null })()`)
    assert(medical !== null, 'Medical must show the average fatigue')
    const rosterFatigue = Object.fromEntries((await cdp.evaluate(`[...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim() || '').filter((t) => /^Open .*: fatigue/.test(t))`)).map((t) => { const m = t.match(/^Open (.+): fatigue ([0-9.]+)/); return [m[1], Number(m[2])] }))
    const average = Object.values(rosterFatigue).reduce((a, b) => a + b, 0) / Object.keys(rosterFatigue).length
    assert(Object.keys(rosterFatigue).length === 16 && Math.abs(average - medical) < 0.06, `Medical rows (${average.toFixed(2)}) must equal its average (${medical})`)
    evidence.medicalFatigueByPlayer = rosterFatigue
    assert(trainingAverage !== null && Math.abs(trainingAverage - medical) < 0.06, `Training (${trainingAverage}) and Medical (${medical}) must report the same average fatigue`)
    await shot('11-medical-fatigue')
    return { medicalAverageFatigue: medical, players: Object.keys(rosterFatigue).length }
  })

  await step(9, 'Rotaciones según disponibilidad y fatiga: guardar quinteto y banquillo descansando al titular más cargado', async () => {
    await cdp.click('button', '=MATCH'); await sleep(2500)
    const names = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.innerText.trim()); const i = b.indexOf('CAMBIAR EN PLANTILLA'); const j = b.indexOf('CAMBIAR EN TÁCTICAS'); return { starters: b.slice(i - 5, i), bench: b.slice(i + 1, j) } })()`)
    starters = names.starters; bench = names.bench
    assert(starters.length === 5 && bench.length >= 3, `The preparation must show five starters and the bench, got ${JSON.stringify(names)}`)
    const fatigue = await cdp.evaluate(`(() => { const out = {}; document.body.innerText.split('\\n') ; return out })()`)
    void fatigue
    await openApp('ROSTER')
    // Read the FATIGA column of Roster (same number as Medical) and rest the most tired starter for the best-rested bench player.
    const rows = await cdp.evaluate(`(() => { const out = {}; for (const row of document.querySelectorAll('[role=row], tr, .ng-precision-grid > div')) { const t = row.innerText.replace(/\\s+/g, ' '); const m = t.match(/^(.+?) (PG|SG|SF|PF|C) \\d+ .*? OK \\d+ cm \\d+ kg ([0-9.]+) /); if (m) out[m[1].trim()] = Number(m[3]) } return out })()`)
    const tired = [...starters].sort((a, b) => (rows[b] ?? 0) - (rows[a] ?? 0))[0]
    const fresh = [...bench].sort((a, b) => (rows[a] ?? 99) - (rows[b] ?? 99))[0]
    const slots = ['PG', 'SG', 'SF', 'PF', 'C']
    const lineup = starters.map((name) => (name === tired ? fresh : name))
    const benchOrder = [tired, ...bench.filter((name) => name !== fresh)]
    const assign = async (name, item) => { await cdp.click('button', `Rotación ${name}`); await sleep(300); await cdp.click('[role=menuitemradio]', item); await sleep(300) }
    for (const [index, name] of lineup.entries()) await assign(name, `TITULAR ${slots[index]}`)
    for (const [index, name] of benchOrder.slice(0, 4).entries()) await assign(name, `BANQUILLO B${index + 1}`)
    const head = await cdp.buttons()
    assert(head.includes('5/5 QUINTETO'), `Roster must report 5/5 QUINTETO, got ${head.filter((b) => /QUINTETO/.test(b))}`)
    await shot('12-roster-rested-starter')
    evidence.rotationDecision = { tired, tiredFatigue: rows[tired], fresh, freshFatigue: rows[fresh], lineup }
    return evidence.rotationDecision
  })

  let secondGame
  await step(10, 'Disputar el primer partido de la ventana (3 oct) y comprobar que el quinteto guardado abre el acta', async () => {
    const played = await quickSimUserGame(gameIds)
    gameIds.push(played.gameId)
    const acta = await cdp.evaluate(`(() => { const el = document.querySelector('[data-game-id="${played.gameId}"]'); const teams = [...el.querySelectorAll('article')].map((a) => ({ team: a.querySelector('h4').innerText, started: [...a.querySelectorAll('tbody tr')].filter((tr) => /TITULAR/.test(tr.querySelector('th small')?.innerText ?? '')).map((tr) => tr.querySelector('th button')?.innerText) })); return teams })()`)
    const ucm = acta.find((t) => t.team.toLowerCase() === 'ucam murcia')
    assert(JSON.stringify([...ucm.started].sort()) === JSON.stringify([...evidence.rotationDecision.lineup].sort()), `The acta starters must be the saved lineup: ${ucm.started}`)
    await shot('13-acta-game-1')
    evidence.game1 = played
    return played
  })

  await step(11, 'Continuar hasta el segundo partido (10 oct) con el plan semanal ejecutado y disputarlo', async () => {
    await continueToUserGame('10 OCT 2026')
    secondGame = await quickSimUserGame(gameIds)
    gameIds.push(secondGame.gameId)
    assert(secondGame.gameId !== gameIds[1], 'The second game is a different fixture')
    await shot('14-acta-game-2')
    evidence.game2 = secondGame
  })

  await step(12, 'Resultados y clasificación en Competition', async () => {
    await cdp.click('button', '=Home'); await sleep(1500)
    await cdp.click('button', 'VER EN COMPETICIÓN'); await sleep(2500)
    await cdp.click('button', '=Clasificación'); await sleep(1200)
    const row = await cdp.evaluate(String.raw`(() => { const squash = (el) => el.innerText.split(/\s+/).filter(Boolean).join(' '); let el = [...document.querySelectorAll('button,a,span,div')].find((e) => e.children.length === 0 && e.textContent.trim() === 'UCAM Murcia' && e.getBoundingClientRect().width > 0); for (let d = 0; el && d < 6 && !(/^[0-9]/.test(squash(el)) && squash(el).includes('UCAM Murcia ')); d += 1) el = el.parentElement; const t = el ? squash(el) : ''; return t.slice(t.indexOf('UCAM Murcia') + 11).trim().split(' ').slice(0, 7) })()`)
    assert(row[0] === '3', `UCAM Murcia must have played 3 games (first + two of the window), got ${row}`)
    await shot('15-competition-standings')
    await cdp.click('button', '=Resultados'); await sleep(1000)
    assert(await has(String(Math.max(...evidence.game2.score))) && await has(String(Math.max(...evidence.game1.score))), 'Resultados must show both scores')
    await shot('16-competition-results')
    evidence.standingsRow = row
  })

  await step(13, 'Guardar y cerrar; volver a cargar y comprobar que todo se conserva', async () => {
    await saveGame()
    const before = readSave()
    const facts = saveFacts(before)
    const hashBefore = normalizedPayloadHash(before)
    await closeApp()
    await launch()
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('10 OCT 2026')", { timeout: 60000 })
    await sleep(1500)
    await saveGame()
    if (normalizedPayloadHash(readSave()) !== hashBefore) { if (process.env.F2_DIFF_DIR) { writeFileSync(join(process.env.F2_DIFF_DIR, 'before.json'), JSON.stringify(before.payload)); writeFileSync(join(process.env.F2_DIFF_DIR, 'after.json'), JSON.stringify(readSave().payload)) } assert(false, 'Re-saving after restarting the executable must give an identical payload') }
    evidence.midWindow = { payloadSha256: hashBefore, payloadIdenticalAfterRestart: true, ...facts }
    await shot('17-reloaded-mid-window')
    return facts
  })

  await step(14, 'Cargar y continuar hasta completar los 30 días: partidos del 17 y 24 de octubre y fecha final 26 de octubre', async () => {
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('17 OCT 2026') && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH')", { timeout: 300000, label: 'Continue to 17 Oct' })
    await sleep(1000)
    const third = await quickSimUserGame(gameIds); gameIds.push(third.gameId)
    await continueToUserGame('24 OCT 2026')
    const fourth = await quickSimUserGame(gameIds); gameIds.push(fourth.gameId)
    await cdp.click('button', 'AVANZAR UN DÍA'); await sleep(2500)
    await cdp.click('button', 'AVANZAR UN DÍA'); await sleep(2500)
    await cdp.waitFor("document.body.innerText.includes('26 OCT 2026')", { timeout: 60000, label: 'final date' })
    await cdp.click('button', '=Home'); await sleep(1200)
    await shot('18-day-30-home')
    evidence.game3 = third; evidence.game4 = fourth
  })

  await step(15, 'Sin sesiones, eventos ni encuentros duplicados al terminar los 30 días (Save V4 nativo)', async () => {
    await saveGame()
    const save = readSave()
    const facts = saveFacts(save)
    assert(facts.userGames.length === 5, `Five user games (first + four), got ${facts.userGames}`)
    assert(facts.uniqueCompletedGames === facts.completedGames && facts.statLogs === facts.completedGames, 'One stat log per completed game, none duplicated')
    assert(facts.uniqueSessions === facts.userSessionsCompleted && facts.sessionsWithoutEvidence === 0, 'No user session executed twice')
    assert(facts.uniqueStimulusEvents === facts.stimulusEvents, 'No stimulus event duplicated')
    assert(facts.userSessionsCompleted >= 15, `Weekly plans must have been executed throughout the window, got ${facts.userSessionsCompleted}`)
    const dates = facts.userSessionDates
    assert(dates.every((date) => !save.payload.games.some((g) => g.date === date && (g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm'))), 'No session on a match day')
    evidence.finalSave = { payloadSha256: normalizedPayloadHash(save), ...facts }
    return facts
  })

  await step(16, 'Las decisiones siguen reflejándose en Courtside tras guardar, cerrar y cargar', async () => {
    await closeApp()
    await launch()
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('26 OCT 2026')", { timeout: 60000 })
    await sleep(1500)
    await openApp('STAFF')
    await cdp.click('button', 'ASIGNACIONES'); await sleep(1500)
    await cdp.click('button', 'MODO SENCILLO'); await sleep(700)
    const row = await cdp.evaluate(`[...document.querySelectorAll('.cs-staff-simple-assignment__row')].find((el) => el.innerText.includes('Assign Individual Development'))?.innerText.replace(/\\s+/g, ' ')`)
    assert(row !== undefined && !row.includes('Bajo tu control'), `The delegation must survive the reload: ${row}`)
    await openApp('TRAINING')
    await cdp.click('button', 'RESULTADOS'); await sleep(900)
    const completed = Number(((await text()).match(/COMPLETADAS\s*\n?\s*(\d+)/) ?? [])[1])
    assert(completed === evidence.finalSave.userSessionsCompleted, `Training must show ${evidence.finalSave.userSessionsCompleted} completed sessions, got ${completed}`)
    await shot('19-training-results-final')
    await openApp('ROSTER')
    const head = await cdp.buttons()
    assert(head.includes('5/5 QUINTETO'), 'The saved lineup must still be 5/5')
    await shot('20-roster-final')
    assert(cdp.consoleErrors.length === 0, `Rendering errors in the console: ${cdp.consoleErrors.slice(0, 3).join(' | ')}`)
    return { delegation: row, completedSessions: completed }
  })
  if (process.env.F2_RTP_FIXTURE !== undefined) {
    await step(17, 'Aviso médico → decisión: una revisión de alta vencida detiene Continue, enruta a Medical, se resuelve y el jugador vuelve al partido', async () => {
      await closeApp()
      copyFileSync(process.env.F2_RTP_FIXTURE, SAVE)
      await launch()
      await cdp.click('button', 'CONTINUE')
      await cdp.waitFor("document.body.innerText.includes('07 OCT 2026')", { timeout: 60000 })
      await sleep(2000)
      const resolver = (await cdp.buttons()).includes('MEDICAL')
      assert(resolver, 'Continue must stop and offer the Medical resolver (route of the Return-to-Play breakpoint)')
      await shot('21-rtp-continue-resolver')
      await cdp.click('button', '=MEDICAL'); await sleep(2500)
      const body = await text()
      assert(body.includes('RETURN-TO-PLAY REVIEW') && body.includes('REVIEW DUE') && body.includes('Return-to-play recommendation'), 'Medical must show the due review and the staff recommendation')
      assert(body.includes('UNAVAILABLE'), 'The injured player is shown as unavailable until cleared')
      await shot('22-rtp-medical-review')
      await cdp.click('button', '=CLEAR FOR PLAY'); await sleep(1500)
      const after = await text()
      assert(!after.includes('RETURN-TO-PLAY REVIEW') && after.includes('16 AVAILABLE'), 'After clearing, all 16 players are available and the review disappears')
      await shot('23-rtp-cleared')
      await saveGame()
      const injury = readSave().payload.injuries.find((item) => item.returnToPlay?.clearedOn !== undefined && item.id === 'f2:controlled')
      assert(injury !== undefined && injury.returnToPlay.reviews.at(-1).decision === 'CLEAR_FOR_PLAY', 'The clearance must be persisted in Save V4')
      await continueToUserGame('10 OCT 2026')
      await cdp.click('button', '=MATCH'); await sleep(2500)
      assert(await has('Jonah Radebaugh'), 'The cleared player is part of the next game preparation')
      await shot('24-rtp-next-match')
      return { clearedOn: injury.returnToPlay.clearedOn }
    })
  }
} finally {
  evidence.steps = steps
  evidence.consoleErrors = cdp?.consoleErrors ?? []
  try { cdp?.close() } catch { /* closed */ }
  app?.child.kill()
  await sleep(2000)
  if (existsSync(BACKUP)) copyFileSync(BACKUP, SAVE)
  evidence.userSaveSha256After = existsSync(SAVE) ? sha(SAVE) : null
  evidence.userSaveRestored = evidence.userSaveSha256Before === evidence.userSaveSha256After
  writeFileSync(join(OUT, 'windows-acceptance.json'), JSON.stringify(evidence, null, 2))
  console.log(`user save restored: ${evidence.userSaveRestored}`)
  const failed = steps.filter((entry) => entry.result === 'FAIL')
  console.log(failed.length === 0 && steps.length >= 16 ? 'WINDOWS ACCEPTANCE: PASS' : 'WINDOWS ACCEPTANCE: FAIL')
  process.exitCode = failed.length === 0 && steps.length >= 16 ? 0 : 1
}
