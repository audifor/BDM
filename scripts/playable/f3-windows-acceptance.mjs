// F3 acceptance on the real Windows executable (Tauri debug build with the embedded production frontend, no Vite server).
// Drives the WebView2 of bdm.exe through the DevTools protocol with real mouse events and screenshots.
//
//   Career 1 (NEW GAME ACB 2026/27, UCAM Murcia): roster → squad need → Market → free-agent search → dossier and economic margin → contact →
//   offer → Board approval → signing → contract/budget/roster → rotation → match participation → operations history → an offer refused by
//   Finance → save, close, load, continue.
//   Career 2 (Save V4 produced by the F3 harness: 27 Sep 2026 → 2 Jul 2027 played day by day, no market operation; the pilot squad's renewal
//   window opens on 2 Jul 2027 and "Simulate until date" stops at every pending medical decision): renewal → Board → successor contract,
//   release with its explained obligations, save, close, load, continue.
// The user's native save is backed up first and restored at the end (SHA-256 checked).
//
//   npm run tauri -- build --debug --no-bundle -- --offline
//   F3_JULY_SAVE=<Save V4 at 2027-07-02> node scripts/playable/f3-windows-acceptance.mjs
//   (F3_FROM_SAVE=<Save V4 after the first match> skips the NEW GAME / first match; used only to iterate on this script)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash as hash } from 'node:crypto'
import { join } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'

const EXE = process.env.BDM_EXE ?? 'C:/BDM/src-tauri/target/debug/bdm.exe'
const OUT = process.env.F3_EVIDENCE_DIR ?? 'docs/playable/evidence/f3'
const FIXTURE = process.env.F3_FROM_SAVE
const JULY = process.env.F3_JULY_SAVE
const SAVE = join(process.env.APPDATA, 'com.bdm.app', 'saves', 'main.json')
const BACKUP = join(process.env.TEMP ?? '.', 'bdm-f3-user-save-backup.json')
const PORT = 9437
const sha = (path) => hash('sha256').update(readFileSync(path)).digest('hex')
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
// The order of a collection of records (one entry per id) is not state: the same convention as the key order of an object. Collections at the
// first two levels of the payload are compared as sets; the order inside a record (rounds, schedules) is kept.
const setOfRecords = (value) => Array.isArray(value) && value.every((item) => item !== null && typeof item === 'object') ? [...value].map(canonical).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1) : canonical(value)
const comparablePayload = (payload) => Object.fromEntries(Object.keys(payload).sort().map((key) => {
  const value = payload[key]
  return [key, value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((inner) => [inner, setOfRecords(value[inner])])) : setOfRecords(value)]
}))
const normalizedPayloadHash = (save) => hash('sha256').update(JSON.stringify(comparablePayload(save.payload))).digest('hex')

mkdirSync(OUT, { recursive: true })
const steps = []
const evidence = { platform: 'Windows Tauri debug executable, embedded production frontend (no Vite)', exe: EXE }
let cdp
let app
const shot = (name) => cdp.screenshot(join(OUT, `${name}.png`))
const only2 = process.env.F3_ONLY_JULY === '1' // iterate career 2 only
const step = async (id, title, action) => {
  if (only2 && id < 30) return
  const started = Date.now()
  try {
    const detail = await action()
    steps.push({ id, title, result: 'PASS', ms: Date.now() - started, ...(detail === undefined ? {} : { detail }) })
    console.log(`PASS ${id} ${title}`)
  } catch (error) {
    let buttons = []
    try { buttons = (await cdp.buttons()).slice(0, 25); await cdp.screenshot(join(OUT, `FAIL-${id}.png`)) } catch { /* the window is gone */ }
    steps.push({ id, title, result: 'FAIL', error: String(error?.message ?? error), buttons })
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
  await cdp.evaluate('window.confirm = () => true')
}
async function closeApp() {
  try { cdp.close() } catch { /* already closed */ }
  app.child.kill()
  await sleep(2500)
}
/** Opens an application from the start menu; a menu group is expanded first when the item is not visible. */
async function openApp(label, group) {
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
  if (group !== undefined) { await cdp.click('button', `=${group}`); await sleep(400) }
  await cdp.click('button', `=${label}`); await sleep(2500)
  await cdp.evaluate('window.confirm = () => true')
}
async function saveGame() {
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
  await cdp.click('button', 'GUARDAR PARTIDA')
  await cdp.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 30000, label: 'save confirmation' })
  await sleep(400)
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(300)
}
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
  await sleep(700)
}
/** Plays the user game of the day with the quick simulation and waits for its acta. */
async function quickSimUserGame(previousGameIds) {
  await cdp.click('button', '=MATCH'); await sleep(2500)
  await cdp.click('button', 'SIMULACIÓN RÁPIDA')
  await cdp.waitFor(`[...document.querySelectorAll('[aria-label="Acta del partido"]')].some((el) => !${JSON.stringify(previousGameIds)}.includes(el.dataset.gameId))`, { timeout: 300000, label: 'new acta' })
  await sleep(800)
  return cdp.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label="Acta del partido"]')].find((e) => !${JSON.stringify(previousGameIds)}.includes(e.dataset.gameId)); return { gameId: el.dataset.gameId, text: el.innerText.replace(/\\s+/g, ' ').slice(0, 3000) } })()`)
}
async function continueTo(dateLabel) {
  await cdp.click('button', '=Home'); await sleep(1200)
  await cdp.click('button', 'CONTINUE')
  await cdp.waitFor(`document.body.innerText.includes(${JSON.stringify(dateLabel)}) && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH')`, { timeout: 300000, label: `Continue stops on ${dateLabel}` })
  await sleep(1200)
}
/** Selects a section tab and waits for its section (the first click after an application opens can be absorbed). */
async function selectSection(tab, sectionLabel) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await cdp.click('button', `=${tab}`); await sleep(900)
    if (await cdp.evaluate(`[...document.querySelectorAll('section[aria-label]')].some((e) => e.getAttribute('aria-label') === ${JSON.stringify(sectionLabel)})`)) return
  }
  throw new Error(`Section ${sectionLabel} did not open`)
}
async function openMarketTab(tab) {
  await openApp('MARKET', 'MERCADO')
  await cdp.click('button', `=${tab}`); await sleep(900)
}
/** Opens the <details> of an operation row in Market > OPERACIONES. */
async function openOperation(name) {
  await openMarketTab('OPERACIONES')
  const opened = await cdp.evaluate(`(() => {
    const row = [...document.querySelectorAll('article.market-negotiations__entry')].find((el) => el.innerText.includes(${JSON.stringify(name)}))
    if (!row) return null
    const details = row.querySelector('details'); if (!details.open) details.querySelector('summary').click()
    return row.innerText.replace(/\\s+/g, ' ').slice(0, 1800)
  })()`)
  assert(opened !== null, `No operation row for ${name}`)
  await sleep(500)
  return opened
}
const operationState = async (name) => cdp.evaluate(`(() => { const row = [...document.querySelectorAll('article.market-negotiations__entry')].find((el) => el.innerText.includes(${JSON.stringify(name)})); return row ? row.querySelector('.market-negotiations__state')?.innerText : null })()`)
const marginText = () => cdp.evaluate(`document.querySelector('[data-testid="market-viability-margin"]')?.innerText ?? null`)
const budgetText = () => cdp.evaluate(`document.querySelector('.market-operations-bar__budget strong')?.innerText ?? null`)

function facts(save) {
  const p = save.payload
  const negotiations = p.marketRuntime?.negotiations ?? []
  const runtime = p.staffCareerRuntime ?? {}
  return {
    date: p.currentDate,
    userContracts: p.contracts.filter((c) => c.teamId === 'acb-team-ucm').length,
    contractIds: p.contracts.length, uniqueContractIds: new Set(p.contracts.map((c) => c.id)).size,
    signed: negotiations.filter((n) => n.status === 'SIGNED').map((n) => ({ playerId: n.playerId, contractId: n.signedContractId, salary: n.salary, years: n.years })),
    negotiations: negotiations.map((n) => `${n.playerId}:${n.status}`),
    transactions: p.playerTransactions.map((t) => `${t.kind}:${t.playerId}`),
    uniqueTransactions: new Set(p.playerTransactions.map((t) => t.id)).size, transactionCount: p.playerTransactions.length,
    executedEvents: (runtime.governanceDecisionEvents ?? []).filter((e) => e.kind === 'EXECUTED' && /signing|retention/i.test(e.decisionId)).length,
    retention: (p.retentionNegotiations ?? []).map((n) => ({ playerId: n.playerId, status: n.status, execution: n.execution?.status, successor: n.execution?.contractId })),
    reservations: (p.financialReservations ?? []).filter((r) => r.status === 'OPEN').length,
    completedGames: p.games.filter((g) => g.status === 'completed').length, statLogs: p.matchStatLogs.length,
    marketTargets: (p.marketTargets ?? []).length,
    userLineupStarters: p.lineups.find((l) => l.teamId === 'acb-team-ucm')?.starters,
  }
}

const userSaveHash = existsSync(SAVE) ? sha(SAVE) : null
if (existsSync(SAVE)) copyFileSync(SAVE, BACKUP)
evidence.userSaveSha256Before = userSaveHash
const gameIds = []
const candidatePool = ['Libre SG-01', 'Libre SG-02']
let signedName
let signedPlayerId

try {
  await launch()
  await step(1, 'NEW GAME ACB 2026/27 con UCAM Murcia y primer partido disputado (carrera nueva, Save V4 nativo)', async () => {
    if (FIXTURE === undefined) {
      await cdp.click('button', 'NEW GAME'); await sleep(500)
      await cdp.setField('UNIVERSE', 'acb-2026-27'); await sleep(400)
      await cdp.setField('TEAM', 'ucm'); await sleep(200)
      await cdp.setField('COACH FIRST NAME', 'Elena'); await cdp.setField('COACH LAST NAME', 'Piloto')
      await cdp.setField('DATE OF BIRTH', '1990-01-01'); await cdp.setField('GENDER', 'female'); await cdp.setField('NATIONALITY', 'ESP')
      await cdp.click('button', 'START CAREER')
      await cdp.waitFor("document.body.innerText.includes('UCAM MURCIA') && document.body.innerText.includes('01 JUL 2026')", { timeout: 60000 })
      await sleep(1500)
      await continueTo('26 SEPT 2026')
      const first = await quickSimUserGame([])
      gameIds.push(first.gameId)
      await saveGame()
    } else {
      await closeApp()
      copyFileSync(FIXTURE, SAVE)
      await launch()
      await cdp.click('button', 'CONTINUE')
      await cdp.waitFor("document.body.innerText.includes('UCAM MURCIA')", { timeout: 60000 })
      await sleep(1500)
      await saveGame()
    }
    const save = readSave()
    assert(save.schemaVersion === 4, 'Native Save V4 expected')
    const f = facts(save)
    assert(f.userContracts === 16, `UCAM Murcia starts with 16 contracts, got ${f.userContracts}`)
    assert((save.payload.marketRuntime?.reality ?? []).length === 15, 'The synthetic free-agent market truth must be part of the native save')
    for (const game of save.payload.games.filter((g) => g.status === 'completed' && (g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm'))) if (!gameIds.includes(game.id)) gameIds.push(game.id)
    evidence.startingSave = f
    await shot('01-career-started')
    return { date: f.date, userContracts: f.userContracts, freeAgentMarketTruth: 15 }
  })

  await step(2, 'Consultar Roster: 16 jugadores y su composición por posición', async () => {
    await openApp('ROSTER')
    const body = await text()
    assert(body.includes('Dylan Ennis') && body.includes('Wilhelm Falk'), 'Roster must list the squad')
    await shot('02-roster')
    return { guards: ['Dylan Ennis', 'Wilhelm Falk'].filter((n) => body.includes(n)) }
  })

  await step(3, 'Identificar una necesidad de plantilla y entrar en Mercado Courtside', async () => {
    await openMarketTab('BUSCAR JUGADORES')
    const body = await text()
    assert(body.includes('NECESIDADES DE PLANTILLA') && body.includes('Titular de nivel bajo · SG') && body.includes('Buscar agentes libres SG'), 'Market must show the SG squad need with a search route')
    assert(body.includes('Sin fichaje posible para esta necesidad'), 'Needs without an acquisition route must be said honestly')
    await shot('03-market-needs')
    return { need: 'SG (titular y suplente de nivel bajo)', margenPresupuesto: await budgetText() }
  })

  await step(4, 'Buscar agentes libres desde la necesidad, añadir un objetivo persistente y consultar el expediente', async () => {
    await cdp.click('button', 'Buscar agentes libres SG'); await sleep(1200)
    const body = await text()
    assert(body.includes('Libre SG-01 [sintético]') && body.includes('Libre SG-02 [sintético]') && body.includes('Libre SG-03 [sintético]'), 'The three identified synthetic shooting guards must be listed')
    await cdp.click('button', 'Añadir objetivo Libre SG-01'); await sleep(700)
    await cdp.click('button', 'Libre SG-01'); await sleep(800)
    const dossier = await text()
    assert(dossier.includes('EXPEDIENTE') && dossier.includes('Comparación posicional') && dossier.includes('?'), 'The dossier shows what is known, with unobserved attributes as "?"')
    assert(dossier.includes('Solicitar informe'), 'A scouting report can be requested')
    assert((await marginText()) === '1.57M', `The real salary margin must be shown (1.57M), got ${await marginText()}`)
    await shot('04-dossier-and-margin')
    await cdp.click('button', '=OBJETIVOS'); await sleep(900)
    assert((await text()).includes('Libre SG-01'), 'The persistent target appears in OBJETIVOS')
    await cdp.click('button', '=BUSCAR JUGADORES'); await sleep(700)
    return { margin: '1.57M', precioEsperado: 'Desconocido hasta contactar' }
  })

  await step(5, 'Contactar: SG-01 (operación principal) y SG-03 (candidato caro, para el rechazo por presupuesto)', async () => {
    await cdp.click('button', 'Buscar agentes libres SG'); await sleep(900)
    for (const name of ['Libre SG-01', 'Libre SG-03']) {
      await cdp.click('button', name); await sleep(700)
      await cdp.click('button', 'Contactar agente libre'); await sleep(800)
      assert((await text()).includes('VIABILIDAD ECONÓMICA') && (await text()).includes('Contact player') && /necesidad detectada/.test(await text()), 'The contact dialog states the economics and says whether a squad need recommends him (a recommendation, not a requirement)')
      await shot(`05-contact-${name.slice(-5)}`)
      await cdp.click('button', 'Contact player'); await sleep(1200)
      await cdp.click('button', '=BUSCAR JUGADORES'); await sleep(500)
      await cdp.click('button', 'Buscar agentes libres SG'); await sleep(900)
    }
    await cdp.click('button', '=OPERACIONES'); await sleep(700)
    const body = await text()
    assert(body.includes('Libre SG-01') && body.includes('Libre SG-03') && body.includes('CONTACTED'), 'Both contacts are recorded')
    assert(body.includes('Contacto iniciado'), 'The outcome of the command is shown')
    await shot('05-operations-contacted')
  })

  await step(6, 'Avanzar hasta el 3 oct: el agente responde; presentar la oferta preparada de SG-01 (condiciones del jugador, viabilidad visible)', async () => {
    await continueTo('03 OCT 2026')
    const row = await openOperation('Libre SG-01')
    assert(row.includes('OPEN_TO_TALKS') || row.includes('Response: OPEN_TO_TALKS'), `SG-01 must have answered the contact: ${row.slice(0, 300)}`)
    assert(row.includes('TU OFERTA') && row.includes('VIABILIDAD ECONÓMICA DE TU OFERTA') && row.includes('Viable') && row.includes('no admite otra fecha de inicio'), 'The manager writes his own offer (salary, years, role), economically viable, with the unsupported start date declared')
    await shot('06-offer-ready')
    await clickInRow('article.market-negotiations__entry', 'Libre SG-01', 'Presentar oferta')
    assert((await text()).includes('Oferta presentada'), 'The submission is confirmed to the manager')
    evidence.offer = row.slice(0, 600)
  })

  await step(7, 'Operación inválida por presupuesto: SG-03 acepta hablar pero su precio supera el margen; Finance rechaza la oferta con motivo', async () => {
    const row = await openOperation('Libre SG-03')
    assert(row.includes('No viable') && row.includes('margen salarial'), `SG-03's price must be shown as not viable: ${row.slice(0, 400)}`)
    await shot('07a-not-viable')
    await clickInRow('article.market-negotiations__entry', 'Libre SG-03', 'Presentar oferta')
    const body = await text()
    assert(body.includes('Finance rechaza la operación'), 'Finance must refuse the offer and say why')
    assert((await operationState('Libre SG-03')) === 'CONTACTED', 'The refused offer must not change the negotiation')
    await shot('07b-finance-refusal')
    evidence.refusal = body.split('Finance rechaza')[1]?.slice(0, 260)
  })

  await step(8, 'Disputar el 3 oct, avanzar al 10 oct: el jugador acepta; iniciar la aprobación de Governance de la firma', async () => {
    const g1 = await quickSimUserGame(gameIds); gameIds.push(g1.gameId)
    await continueTo('10 OCT 2026')
    const row = await openOperation('Libre SG-01')
    assert(row.includes('Agreed terms') && row.includes('ACCEPTED'), `The player must have accepted: ${row.slice(0, 400)}`)
    await shot('08-accepted')
    await clickInRow('article.market-negotiations__entry', 'Libre SG-01', 'Start signing approval')
    assert((await text()).includes('Aprobación de la firma solicitada'), 'The request to the Board is confirmed')
    evidence.agreed = row.slice(0, 400)
  })

  await step(9, 'Disputar el 10 oct; el consejo aprueba al día siguiente; completar la firma', async () => {
    const g2 = await quickSimUserGame(gameIds); gameIds.push(g2.gameId)
    await continueTo('17 OCT 2026')
    const row = await openOperation('Libre SG-01')
    assert(row.includes('Complete signing') || row.includes('APPROVED'), `The Board must have approved: ${row.slice(0, 500)}`)
    await shot('09-board-approved')
    await clickInRow('article.market-negotiations__entry', 'Libre SG-01', 'Complete signing')
    assert((await text()).includes('Fichaje completado'), 'The signing is confirmed')
    const after = await openOperation('Libre SG-01')
    assert(after.includes('SIGNED'), 'The negotiation is SIGNED')
    await saveGame()
    const f = facts(readSave())
    assert(f.signed.length === 1 && f.userContracts === 17, `One signed contract and 17 user contracts expected, got ${JSON.stringify(f.signed)} / ${f.userContracts}`)
    signedPlayerId = f.signed[0].playerId
    signedName = 'Libre SG-01'
    evidence.signing = f.signed[0]
    await shot('09-signed')
  })

  await step(10, 'Ver al jugador en la plantilla y comprobar contrato y presupuesto actualizados', async () => {
    await openApp('ROSTER')
    assert((await text()).includes('Libre SG-01'), 'The new player is on the roster')
    await shot('10-roster-with-signing')
    await openApp('CONTRACTS', 'GESTIÓN DEL CLUB')
    const body = await text()
    assert(body.includes('Libre SG-01') && body.includes('Signed') || body.includes('Libre SG-01'), 'The contract is listed in Contracts')
    await shot('10-contracts')
    await openMarketTab('BUSCAR JUGADORES')
    const margin = await budgetText()
    assert(margin === '1.34M', `The salary margin must fall exactly by the annual salary (1.57M - 230,000), got ${margin}`)
    evidence.marginAfterSigning = margin
    const save = readSave()
    const contract = save.payload.contracts.find((c) => c.id === evidence.signing.contractId)
    assert(contract.compensation.annualSalary === evidence.signing.salary && contract.teamId === 'acb-team-ucm', 'Contract terms match the agreement')
    return { salary: contract.compensation.annualSalary, term: contract.term, marginAfter: margin }
  })

  await step(11, 'Incorporarlo a una rotación válida (titular SG)', async () => {
    await openApp('ROSTER')
    await cdp.click('button', `Rotación ${signedName}`); await sleep(400)
    await cdp.click('[role=menuitemradio]', 'TITULAR SG'); await sleep(800)
    await shot('11-rotation-sg')
    await saveGame()
    assert(readSave().payload.lineups.find((l) => l.teamId === 'acb-team-ucm').starters.SG === signedPlayerId, 'The saved lineup starts the new player at SG')
  })

  await step(12, 'Disputar el partido del 17 oct y comprobar su participación real', async () => {
    const g3 = await quickSimUserGame(gameIds); gameIds.push(g3.gameId)
    await saveGame()
    const save = readSave()
    const line = save.payload.matchStatLogs.find((log) => log.gameId === g3.gameId).playerLines.find((l) => l.playerId === signedPlayerId)
    assert(line !== undefined && line.stats.secondsPlayed > 0, 'The signed player must have played minutes')
    assert(g3.text.includes('Libre SG-01') || (await has('Libre SG-01')), 'The acta lists the new player')
    await shot('12-acta-with-signing')
    evidence.participation = { gameId: g3.gameId, minutes: Math.round(line.stats.secondsPlayed / 6) / 10 }
    return evidence.participation
  })

  await step(13, 'Historial de operaciones: la firma consta una sola vez, con sus condiciones', async () => {
    await openMarketTab('OPERACIONES')
    const history = await cdp.evaluate(`document.querySelector('[data-testid="market-history"]')?.innerText ?? ''`)
    assert((history.match(/FICHAJE/g) ?? []).length === 1 && history.includes('Libre SG-01') && history.includes('230.000'), `History must list the signing once: ${history}`)
    await shot('13-operations-history')
    return { history: history.replace(/\s+/g, ' ').slice(0, 300) }
  })

  await step(14, 'Guardar, cerrar BDM, cargar: contratos, plantilla, finanzas e historial idénticos', async () => {
    await saveGame()
    const before = readSave()
    const factsBefore = facts(before)
    const hashBefore = normalizedPayloadHash(before)
    await closeApp()
    await launch()
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('17 OCT 2026') || document.body.innerText.includes('UCAM MURCIA')", { timeout: 60000 })
    await sleep(1500)
    await saveGame()
    assert(normalizedPayloadHash(readSave()) === hashBefore, 'The payload must be identical after closing and loading')
    await openMarketTab('OPERACIONES')
    assert((await text()).includes('SIGNED') && (await cdp.evaluate(`document.querySelector('[data-testid="market-history"]').innerText`)).includes('Libre SG-01'), 'Market still shows the operation after loading')
    assert((await budgetText()) === '1.34M', 'The budget margin is the same after loading')
    evidence.afterReload = { payloadSha256: hashBefore, payloadIdenticalAfterRestart: true, ...factsBefore }
    await shot('14-reloaded')
    return { payloadIdentical: true }
  })

  await step(15, 'Continuar varios días sin duplicar operaciones', async () => {
    await continueTo('24 OCT 2026')
    const g4 = await quickSimUserGame(gameIds); gameIds.push(g4.gameId)
    await cdp.click('button', 'CONTINUE'); await sleep(4000)
    await saveGame()
    const f = facts(readSave())
    assert(f.uniqueContractIds === f.contractIds && f.uniqueTransactions === f.transactionCount, 'No contract or transaction duplicated')
    assert(f.signed.length === 1 && f.userContracts === 17 && f.transactions.filter((t) => t.startsWith('signedFreeAgent')).length === 1, 'The signing exists exactly once')
    assert(f.executedEvents <= 1, `At most one EXECUTED signing event, got ${f.executedEvents}`)
    assert(f.completedGames === f.statLogs, 'One stat log per completed game')
    evidence.afterContinue = f
    await shot('15-continued')
    return { completedGames: f.completedGames, userContracts: f.userContracts }
  })

  if (process.env.F3_SKIP_TRANSFER !== '1') {
    // ------------------------------------------------------------------ transfer of a contracted player between two ACB clubs (addendum)
    const save0 = readSave()
    const transferPlayerId = process.env.F3_TRANSFER_PLAYER ?? 'acb-player-vbc-13'
    const nameOf = (id) => { const p = save0.payload.players.find((x) => x.id === id); return `${p.firstName} ${p.lastName}` }
    const transferName = nameOf(transferPlayerId)
    const sellerTeamId = save0.payload.teams.find((t) => t.rosterPlayerIds.includes(transferPlayerId)).id
    const sellerName = save0.payload.teams.find((t) => t.id === sellerTeamId).name
    const FIRST_PROPOSAL = Number(process.env.F3_TRANSFER_FIRST_PROPOSAL ?? 100000)
    const PLAYER_SALARY = Number(process.env.F3_TRANSFER_SALARY ?? 110000)
    const PLAYER_YEARS = Number(process.env.F3_TRANSFER_YEARS ?? 2)
    const cashOf = (save, organizationId) => {
      const accounts = new Map(save.payload.financialAccounts.filter((a) => a.organizationId === organizationId && /cash/i.test(`${a.id} ${a.accountType ?? ''} ${a.role ?? ''}`)).map((a) => [a.id, a]))
      let cash = 0
      for (const t of save.payload.financialTransactions) for (const posting of t.postings) if (accounts.has(posting.accountId)) cash += (posting.direction === 'DEBIT' ? 1 : -1) * posting.amount.minorUnits
      return cash
    }
    const orgOf = (save, teamId) => save.payload.teams.find((t) => t.id === teamId).organizationId
    const transferRecord = (save) => (save.payload.playerTransferNegotiations ?? []).find((n) => n.playerId === transferPlayerId)
    const dateSignature = () => cdp.evaluate(`(document.body.innerText.match(/\\b\\d{2} [A-ZÉÁ]{3,4} \\d{4}\\b/g) ?? []).join('|')`)
    /** Plays the user's game of the day (quick simulation) and continues to the next match day. */
    const playAndContinue = async () => {
      await cdp.click('button', '=Home'); await sleep(1200)
      if ((await cdp.buttons()).includes('MATCH')) { const game = await quickSimUserGame(gameIds); gameIds.push(game.gameId); await cdp.click('button', '=Home'); await sleep(1000) }
      const before = await dateSignature()
      await cdp.click('button', 'CONTINUE')
      await cdp.waitFor(`(document.body.innerText.match(/\\b\\d{2} [A-ZÉÁ]{3,4} \\d{4}\\b/g) ?? []).join('|') !== ${JSON.stringify(before)} && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH')`, { timeout: 300000, label: 'next match day' })
      await sleep(1500)
    }
    const transferRow = (name) => cdp.evaluate(`(() => { const row = [...document.querySelectorAll('article.market-transfers__entry')].find((el) => el.innerText.includes(${JSON.stringify(name)})); return row ? row.innerText.replace(/\\s+/g, ' ').slice(0, 2400) : null })()`)
    let evidenceTransfer = { player: transferName, playerId: transferPlayerId, seller: sellerName }
    evidence.transfer = evidenceTransfer

    await step(16, 'Abrir la partida ACB 2026/27 en curso y consultar el mercado global: jugadores con contrato de toda la liga, con filtros de vencimiento y disposición a negociar', async () => {
      await openMarketTab('BUSCAR JUGADORES')
      await cdp.setField('Contrato', 'ROSTERED'); await sleep(900)
      const body = await text()
      const count = Number(body.match(/BUSCAR JUGADORES · (\d+)/)?.[1] ?? 0)
      assert(count > 100, `The global market must list the contracted players of the whole league, got ${count}`)
      assert(await has('Vence antes de') || (await cdp.evaluate(`!!document.querySelector('[aria-label="Vence antes de"]')`)), 'The contract-expiry filter exists')
      await shot('16-global-market')
      return { jugadoresVisibles: count }
    })

    await step(17, 'Encontrar un jugador contratado por otro equipo (búsqueda por nombre)', async () => {
      await cdp.setField('Buscar', transferName); await sleep(900)
      const body = await text()
      assert(body.includes(transferName) && body.includes(sellerName.split(' ').slice(-1)[0]), `${transferName} (${sellerName}) must be found in the global search`)
      await cdp.click('button', transferName); await sleep(900)
      assert((await text()).includes('COMPRA A OTRO CLUB'), 'The inspector offers the purchase from his club')
      await shot('17-found')
    })

    await step(18, 'Abrir su ficha → Contrato: club propietario y vencimiento conocidos, sin precio del vendedor y sin acciones ficticias', async () => {
      await cdp.click('button', 'Ficha completa'); await sleep(2500)
      await cdp.click('button', '=CONTRACT'); await sleep(1500)
      const body = await text()
      assert(body.includes('COMPRA A OTRO CLUB') && body.includes(sellerName), 'The contract tab shows the owner club and the purchase')
      assert(body.includes('Contrato conocido hasta') && body.includes('Autorización para compensaciones'), 'The known contract end and the compensation authorization are shown')
      assert(!body.includes('PLANNED RPG FEATURE') && !body.includes('PREVIEW ONLY'), 'No action that looks available but is not wired')
      evidence.transferDossier = body.slice(body.indexOf('COMPRA A OTRO CLUB'), body.indexOf('COMPRA A OTRO CLUB') + 700).replace(/\s+/g, ' ')
      await shot('18-player-sheet-contract')
    })

    await step(19, 'Negociar una compensación con su club desde la ficha (oferta ≠ pago: no se mueve nada)', async () => {
      const before = readSave()
      await cdp.setField('Compensación que propones al club', String(FIRST_PROPOSAL)); await sleep(500)
      await cdp.click('button', 'Contactar con el club y proponer'); await sleep(1500)
      assert((await text()).includes('Propuesta enviada al club'), 'The proposal is confirmed to the manager')
      await openMarketTab('OPERACIONES')
      const row = await transferRow(transferName)
      assert(row !== null && row.includes('Esperando la respuesta del club'), `The negotiation with the club is open: ${row}`)
      await shot('19-proposal-sent')
      await saveGame()
      const after = readSave()
      const record = transferRecord(after)
      assert(record?.status === 'IN_PROGRESS' && record.clubRounds[0].fee === FIRST_PROPOSAL, 'The proposal is persisted with its compensation')
      assert(after.payload.contracts.length === before.payload.contracts.length && after.payload.playerTransactions.length === before.payload.playerTransactions.length, 'An offer is not a movement')
      assert(cashOf(after, orgOf(after, 'acb-team-ucm')) === cashOf(before, orgOf(before, 'acb-team-ucm')), 'An offer is not a payment')
    })

    await step(20, 'Disputar el partido; el club responde con una contraoferta; alcanzar el acuerdo entre clubes (aceptar su compensación)', async () => {
      await playAndContinue()
      await openMarketTab('OPERACIONES')
      const row = await transferRow(transferName)
      assert(row !== null && row.includes('El club contraoferta') && row.includes('El club pide'), `The seller must counter with its price: ${row}`)
      await shot('20a-club-counter')
      await clickInRow('article.market-transfers__entry', transferName, 'Aceptar la compensación del club')
      const after = await transferRow(transferName)
      assert(after.includes('Acuerdo entre clubes') && after.includes('Compensación acordada entre clubes'), `The clubs agree: ${after}`)
      await shot('20b-clubs-agree')
      evidenceTransfer.clubCounter = row.slice(0, 500)
    })

    await step(21, 'Negociar el contrato con el jugador: salario, años y rol propios (la fecha de inicio declarada como no soportada)', async () => {
      const row = await transferRow(transferName)
      assert(row.includes('TU OFERTA') && row.includes('no admite otra fecha de inicio'), 'The manager writes his own offer to the player')
      await cdp.evaluate(`(() => { const form = [...document.querySelectorAll('article.market-transfers__entry')].find((el) => el.innerText.includes(${JSON.stringify(transferName)})).querySelector('form'); const set = (label, value) => { const input = [...form.querySelectorAll('label')].find((l) => l.innerText.toUpperCase().startsWith(label)).querySelector('input,select'); const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) }; set('SALARIO', ${JSON.stringify(String(PLAYER_SALARY))}); set('AÑOS', ${JSON.stringify(String(PLAYER_YEARS))}); set('ROL', 'ROTATION') })()`)
      await sleep(900)
      await shot('21a-player-offer')
      await clickInRow('article.market-transfers__entry', transferName, 'Presentar oferta al jugador')
      assert((await text()).includes('Oferta presentada al jugador'), 'The offer to the player is confirmed')
      await shot('21b-player-offer-sent')
    })

    await step(22, 'Disputar el partido; el jugador acepta; solicitar la autorización de Governance', async () => {
      await playAndContinue()
      await openMarketTab('OPERACIONES')
      let row = await transferRow(transferName)
      if (row.includes('El jugador contraoferta')) { await clickInRow('article.market-transfers__entry', transferName, 'Aceptar la contraoferta del jugador'); row = await transferRow(transferName) }
      assert(row.includes('Acuerdo con el jugador') && row.includes('Condiciones acordadas con el jugador') && row.includes('Sin solicitar'), `The player agrees and the authorization is still pending: ${row}`)
      assert(row.includes('Finance la autoriza') && row.includes('VIABILIDAD ECONÓMICA DEL SALARIO'), 'The economic viability of salary and compensation is visible')
      await shot('22a-player-agreed')
      await clickInRow('article.market-transfers__entry', transferName, 'Solicitar autorización')
      assert((await text()).includes('Autorización del traspaso solicitada'), 'The request to the Board is confirmed')
      evidenceTransfer.playerAgreement = row.slice(0, 700)
    })

    let beforeExecution
    await step(23, 'Disputar el partido; el consejo autoriza; completar el traspaso', async () => {
      await playAndContinue()
      await openMarketTab('OPERACIONES')
      const row = await transferRow(transferName)
      assert(row.includes('Autorizada') || row.includes('Completar traspaso'), `The Board must have authorized: ${row}`)
      await shot('23a-board-authorized')
      await saveGame()
      beforeExecution = readSave()
      await clickInRow('article.market-transfers__entry', transferName, 'Completar traspaso')
      assert((await text()).includes('Traspaso completado'), 'The transfer is confirmed')
      await saveGame()
      const record = transferRecord(readSave())
      assert(record?.status === 'EXECUTED', `The transfer is executed and persisted: ${JSON.stringify(record)}`.slice(0, 500))
      evidenceTransfer.record = record
      await shot('23b-transfer-completed')
    })

    await step(24, 'Verificar al jugador en la plantilla del club comprador', async () => {
      await openApp('ROSTER')
      assert((await text()).includes(transferName), 'The signed player appears on the buyer roster')
      await shot('24-buyer-roster')
      const save = readSave()
      assert(save.payload.teams.find((t) => t.id === 'acb-team-ucm').rosterPlayerIds.includes(transferPlayerId), 'The saved roster of the buyer includes him')
    })

    await step(25, 'Verificar que desaparece de la plantilla del club vendedor (y que ya no es un objetivo del mercado)', async () => {
      const save = readSave()
      assert(!save.payload.teams.find((t) => t.id === sellerTeamId).rosterPlayerIds.includes(transferPlayerId), 'He is no longer on the seller roster')
      assert(save.payload.teams.filter((t) => t.rosterPlayerIds.includes(transferPlayerId)).length === 1, 'He belongs to exactly one roster')
      await openMarketTab('BUSCAR JUGADORES')
      await cdp.setField('Buscar', transferName); await sleep(900)
      assert(/BUSCAR JUGADORES · 0/.test(await text()), 'He is no longer listed among the other clubs\' players')
      await shot('25-gone-from-seller')
    })

    await step(26, 'Verificar contratos, presupuesto y movimientos económicos de AMBOS clubes', async () => {
      const after = readSave()
      const record = transferRecord(after)
      const sellerOrg = orgOf(after, sellerTeamId), buyerOrg = orgOf(after, 'acb-team-ucm')
      const oldContract = after.payload.contracts.find((c) => c.id === record.sellerContractId)
      const newContract = after.payload.contracts.find((c) => c.id === record.execution.buyerContractId)
      assert(oldContract.termination?.reason === 'transferred' && oldContract.teamId === sellerTeamId, 'The seller contract is terminated as transferred')
      assert(newContract.teamId === 'acb-team-ucm' && newContract.compensation.annualSalary === PLAYER_SALARY, 'The buyer contract carries the agreed salary')
      assert(after.payload.contracts.filter((c) => c.playerId === transferPlayerId && !c.termination && c.term.expiresOn > after.payload.currentDate).length === 1, 'Exactly one valid contract')
      const movement = after.payload.playerTransactions.filter((t) => t.kind === 'transferred' && t.playerId === transferPlayerId)
      assert(movement.length === 1 && movement[0].fromTeamId === sellerTeamId && movement[0].toTeamId === 'acb-team-ucm', 'One transfer recorded in the history of both clubs')
      const fee = record.agreedFee * 100
      const buyerDelta = cashOf(after, buyerOrg) - cashOf(beforeExecution, buyerOrg)
      const sellerDelta = cashOf(after, sellerOrg) - cashOf(beforeExecution, sellerOrg)
      assert(buyerDelta === -fee && sellerDelta === fee, `Compensation leaves the buyer and reaches the seller, nothing else: ${buyerDelta} / ${sellerDelta} / ${fee}`)
      const expenses = after.payload.expenseRecognitions.filter((e) => e.organizationId === buyerOrg && e.category === 'TRANSFER_FEE')
      const revenues = after.payload.revenueRecognitions.filter((e) => e.organizationId === sellerOrg && e.category === 'TRANSFER_BUYOUT')
      assert(expenses.length === 1 && revenues.length === 1, 'Expense recognised by the buyer, revenue by the seller')
      await openMarketTab('BUSCAR JUGADORES')
      const margin = await budgetText()
      assert(margin === '1.23M', `The salary margin falls by the new salary (1.34M - 110,000), got ${margin}`)
      await openApp('FINANCES', 'GESTIÓN DEL CLUB')
      await sleep(1500)
      await shot('26-finances')
      evidenceTransfer.economics = { feeMinorUnits: fee, buyerCashDelta: buyerDelta, sellerCashDelta: sellerDelta, marginAfter: margin, buyerContract: newContract.id, sellerContract: oldContract.id }
      return evidenceTransfer.economics
    })

    await step(27, 'Ponerlo en una rotación válida (titular de su posición)', async () => {
      await openApp('ROSTER')
      await cdp.click('button', `Rotación ${transferName}`); await sleep(400)
      const position = nameOf(transferPlayerId) && readSave().payload.players.find((p) => p.id === transferPlayerId).basketball.primaryPosition
      await cdp.click('[role=menuitemradio]', `TITULAR ${position}`); await sleep(800)
      await shot('27-rotation')
      await saveGame()
      assert(readSave().payload.lineups.find((l) => l.teamId === 'acb-team-ucm').starters[position] === transferPlayerId, 'The saved lineup starts him')
    })

    await step(28, 'Disputar un partido en el que puede participar y comprobar su participación real (y que ya no juega para su club anterior)', async () => {
      await playAndContinue()
      await cdp.click('button', '=Home'); await sleep(800)
      const save = readSave()
      const lastGame = save.payload.games.filter((g) => g.status === 'completed' && (g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm')).sort((a, b) => b.date.localeCompare(a.date))[0]
      const afterTransferGames = save.payload.games.filter((g) => g.status === 'completed' && (g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm') && g.date >= transferRecord(save).execution.executedOn)
      assert(afterTransferGames.length > 0, 'At least one match after the transfer')
      const played = afterTransferGames.map((g) => save.payload.matchStatLogs.find((log) => log.gameId === g.id).playerLines.find((l) => l.playerId === transferPlayerId)).filter(Boolean)
      assert(played.length > 0 && played.every((l) => l.stats.secondsPlayed > 0), `The transferred player must play minutes for his new club, got ${played.length}`)
      const sellerLines = save.payload.games.filter((g) => g.status === 'completed' && g.date >= transferRecord(save).execution.executedOn && (g.homeTeamId === sellerTeamId || g.awayTeamId === sellerTeamId))
        .map((g) => save.payload.matchStatLogs.find((log) => log.gameId === g.id).playerLines.find((l) => l.playerId === transferPlayerId && l.teamId === sellerTeamId)).filter(Boolean)
      assert(sellerLines.length === 0, 'He does not play for the seller any more')
      evidenceTransfer.participation = { gameId: lastGame.id, minutes: Math.round(played[0].stats.secondsPlayed / 6) / 10 }
      await shot('28-participation')
    })

    await step(29, 'Guardar, cerrar BDM, cargar y verificar continuidad exacta (traspaso, contratos, plantillas, finanzas e historial)', async () => {
      await saveGame()
      const before = readSave()
      const hashBefore = normalizedPayloadHash(before)
      await closeApp()
      await launch()
      await cdp.click('button', 'CONTINUE'); await sleep(3500)
      await saveGame()
      const after = readSave()
      assert(normalizedPayloadHash(after) === hashBefore, 'The payload must be identical after closing and loading')
      assert(transferRecord(after).status === 'EXECUTED', 'The executed transfer survives')
      await openMarketTab('OPERACIONES')
      assert((await text()).includes('Completada') && (await cdp.evaluate(`document.querySelector('[data-testid="market-history"]').innerText`)).includes('TRASPASO'), 'Market still shows the transfer and its history after loading')
      await shot('29-reloaded')
      evidenceTransfer.afterReload = { payloadSha256: hashBefore, payloadIdenticalAfterRestart: true }
    })
  }

  if (JULY !== undefined) {
    // ------------------------------------------------------------------ career 2
    await step(30, 'Segunda carrera (Save V4 generado con el arnés: simulación real hasta el 2 jul 2027): contratos próximos a vencer y ventana de renovación abierta', async () => {
      await closeApp()
      copyFileSync(JULY, SAVE)
      await launch()
      await cdp.click('button', 'CONTINUE')
      await cdp.waitFor("document.body.innerText.includes('JUL 2027')", { timeout: 60000 })
      await sleep(1500)
      const save = readSave()
      const f = facts(save)
      const expiring = save.payload.contracts.filter((c) => c.teamId === 'acb-team-ucm' && !c.termination).sort((a, b) => a.term.expiresOn.localeCompare(b.term.expiresOn))
      evidence.july = { date: f.date, ...f, earliestExpiry: expiring[0].term.expiresOn }
      const names = Object.fromEntries(save.payload.players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]))
      evidence.renewalCandidate = { playerId: expiring[0].playerId, name: names[expiring[0].playerId], contractId: expiring[0].id, expiresOn: expiring[0].term.expiresOn, annualSalary: expiring[0].compensation.annualSalary }
      await openApp('CONTRACTS', 'GESTIÓN DEL CLUB')
      const overview = await text()
      assert(overview.includes('Renewal window open') && /Remaining \d+ a \d+ m/.test(overview) && overview.includes('Renewal window opens'), 'Contracts shows the remaining duration and the renewal window of every contract')
      await selectSection('NEGOTIATIONS', 'Contract negotiations')
      const body = await text()
      assert(body.includes(evidence.renewalCandidate.name) && body.includes('eligible'), `The renewal window of ${evidence.renewalCandidate.name} must be open`)
      await shot('16-contracts-window-open')
      return evidence.renewalCandidate
    })

    await step(31, 'Renovar: abrir negociación, ofrecer, el jugador acepta, el consejo aprueba y se firma el sucesor sin solapar el contrato vigente', async () => {
      const name = evidence.renewalCandidate.name
      await clickInRow('article', name, 'Open negotiation')
      await cdp.setValue(`[aria-label=${JSON.stringify(`${name} retention years`)}]`, 2)
      await sleep(400)
      await clickInRow('article', name, 'Submit offer')
      const answered = await cdp.evaluate(`[...document.querySelectorAll('article')].find((a) => a.innerText.includes(${JSON.stringify(name)}))?.innerText.replace(/\\s+/g, ' ')`)
      assert(/Status: accepted/i.test(answered), `The player must accept: ${answered}`)
      await shot('17a-renewal-accepted')
      await clickInRow('article', name, 'Request signing approval')
      assert(!/SIGNED: accepted terms/.test(await text()), 'An accepted offer is not a signed contract yet')
      await cdp.click('button', '=Home'); await sleep(1000)
      await cdp.click('button', 'CONTINUE')
      await cdp.waitFor("[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH' || b.innerText.trim() === 'CONTINUE')", { timeout: 300000, label: 'Continue returns' })
      await sleep(4000)
      await saveGame()
      const save = readSave()
      const retention = save.payload.retentionNegotiations.find((n) => n.playerId === evidence.renewalCandidate.playerId)
      assert(retention?.execution?.status === 'SIGNED', `The Board-approved renewal must be executed: ${JSON.stringify(retention)}`.slice(0, 600))
      const successor = save.payload.contracts.find((c) => c.id === retention.execution.contractId)
      const predecessor = save.payload.contracts.find((c) => c.id === evidence.renewalCandidate.contractId)
      assert(successor.predecessorContractId === predecessor.id && successor.term.startsOn === predecessor.term.expiresOn, 'The successor is continuous with the current contract')
      await openApp('CONTRACTS', 'GESTIÓN DEL CLUB')
      await selectSection('NEGOTIATIONS', 'Contract negotiations')
      assert((await text()).includes('SIGNED: accepted terms'), 'Contracts shows the signed renewal')
      await shot('17b-renewal-signed')
      evidence.renewal = { successor: successor.id, term: successor.term, annualSalary: successor.compensation.annualSalary }
      return evidence.renewal
    })

    await step(32, 'Liberar a un jugador por el flujo existente: se explican las obligaciones garantizadas que sobreviven', async () => {
      await openApp('CONTRACTS', 'GESTIÓN DEL CLUB')
      await selectSection('RELEASE / RISK', 'Release and risk')
      const releaseName = 'Juani Marcos'
      await cdp.setField('Player', await cdp.evaluate(`(() => { const o = [...document.querySelectorAll('select option')].find((x) => x.textContent.includes(${JSON.stringify(releaseName)})); return o ? o.value : '' })()`))
      await sleep(700)
      const preview = await text()
      assert(preview.includes('Release preview') && preview.includes('Guaranteed Finance schedule'), 'The release preview explains what happens')
      await shot('18a-release-preview')
      await cdp.click('button', 'Execute release'); await sleep(1500)
      await saveGame()
      const f = facts(readSave())
      assert(f.transactions.filter((t) => t.startsWith('released')).length === 1, 'One release recorded')
      await shot('18b-released')
      evidence.release = { player: releaseName, transactions: f.transactions.filter((t) => t.startsWith('released')) }
    })

    await step(33, 'Guardar, cerrar y cargar la segunda carrera; continuar sin duplicar la renovación ni la baja', async () => {
      const before = readSave()
      const hashBefore = normalizedPayloadHash(before)
      await closeApp()
      await launch()
      await cdp.click('button', 'CONTINUE'); await sleep(3000)
      await saveGame()
      const afterRestart = readSave()
      if (normalizedPayloadHash(afterRestart) !== hashBefore && process.env.F3_DIFF_DIR) { writeFileSync(join(process.env.F3_DIFF_DIR, 'before.json'), JSON.stringify(canonical(before.payload))); writeFileSync(join(process.env.F3_DIFF_DIR, 'after.json'), JSON.stringify(canonical(afterRestart.payload))) }
      assert(normalizedPayloadHash(afterRestart) === hashBefore, 'Payload identical after restart')
      // Continue several days: the first fixture of the new season is played with the quick simulation, then the calendar moves on.
      await cdp.click('button', '=Home'); await sleep(1000)
      if ((await cdp.buttons()).includes('MATCH')) {
        const played = afterRestart.payload.games.filter((g) => g.status === 'completed' && (g.homeTeamId === 'acb-team-ucm' || g.awayTeamId === 'acb-team-ucm')).map((g) => g.id)
        await quickSimUserGame(played)
        await cdp.click('button', '=Home'); await sleep(1000)
      }
      await cdp.click('button', 'CONTINUE'); await sleep(10000)
      await saveGame()
      const f = facts(readSave())
      assert(f.retention.filter((n) => n.execution === 'SIGNED').length === 1 && f.transactions.filter((t) => t.startsWith('released')).length === 1, 'Renewal and release exist exactly once')
      assert(f.uniqueContractIds === f.contractIds, 'No duplicated contract')
      evidence.july2 = f
    })
  }

  assert(cdp.consoleErrors.length === 0, `Rendering errors in the console: ${cdp.consoleErrors.slice(0, 3).join(' | ')}`)
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
  const expected = JULY === undefined ? 29 : 33
  console.log(failed.length === 0 && steps.length >= expected ? 'WINDOWS ACCEPTANCE: PASS' : 'WINDOWS ACCEPTANCE: FAIL')
  process.exitCode = failed.length === 0 && steps.length >= expected ? 0 : 1
}
