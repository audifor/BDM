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
  if (only2 && id < 16) return
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
      assert((await text()).includes('VIABILIDAD ECONÓMICA') && (await text()).includes('Contact readiness: READY_TO_CONTACT'), 'The contact dialog states the economics and that contact is ready')
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
    assert(row.includes('READY_TO_SUBMIT_OFFER') && row.includes('VIABILIDAD ECONÓMICA DE ESTA OPERACIÓN') && row.includes('Viable'), 'The prepared offer is ready and economically viable')
    await shot('06-offer-ready')
    await clickInRow('article.market-negotiations__entry', 'Libre SG-01', 'Submit prepared offer')
    assert((await text()).includes('Oferta presentada'), 'The submission is confirmed to the manager')
    evidence.offer = row.slice(0, 600)
  })

  await step(7, 'Operación inválida por presupuesto: SG-03 acepta hablar pero su precio supera el margen; Finance rechaza la oferta con motivo', async () => {
    const row = await openOperation('Libre SG-03')
    assert(row.includes('No viable') && row.includes('margen salarial'), `SG-03's price must be shown as not viable: ${row.slice(0, 400)}`)
    await shot('07a-not-viable')
    await clickInRow('article.market-negotiations__entry', 'Libre SG-03', 'Submit prepared offer')
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

  if (JULY !== undefined) {
    // ------------------------------------------------------------------ career 2
    await step(16, 'Segunda carrera (Save V4 generado con el arnés: simulación real hasta el 2 jul 2027): contratos próximos a vencer y ventana de renovación abierta', async () => {
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

    await step(17, 'Renovar: abrir negociación, ofrecer, el jugador acepta, el consejo aprueba y se firma el sucesor sin solapar el contrato vigente', async () => {
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

    await step(18, 'Liberar a un jugador por el flujo existente: se explican las obligaciones garantizadas que sobreviven', async () => {
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

    await step(19, 'Guardar, cerrar y cargar la segunda carrera; continuar sin duplicar la renovación ni la baja', async () => {
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
  const expected = JULY === undefined ? 15 : 19
  console.log(failed.length === 0 && steps.length >= expected ? 'WINDOWS ACCEPTANCE: PASS' : 'WINDOWS ACCEPTANCE: FAIL')
  process.exitCode = failed.length === 0 && steps.length >= expected ? 0 : 1
}
