// F1 acceptance on the real Windows executable (Tauri debug build with the embedded production frontend, no Vite server).
// It drives the WebView2 of bdm.exe through the DevTools protocol with real mouse/keyboard events and screenshots, from NEW GAME to the
// second match, and writes the evidence to docs/playable/evidence/f1. The user's native save is backed up first and restored at the end.
//
//   npm run tauri -- build --debug --no-bundle -- --offline
//   node scripts/playable/f1-windows-acceptance.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash as hash } from 'node:crypto'
import { join } from 'node:path'
import { connect, launchApp, press, sleep } from './cdp.mjs'

const EXE = process.env.BDM_EXE ?? 'C:/BDM/src-tauri/target/debug/bdm.exe'
const OUT = process.env.F1_EVIDENCE_DIR ?? 'docs/playable/evidence/f1'
const SAVE = join(process.env.APPDATA, 'com.bdm.app', 'saves', 'main.json')
const BACKUP = join(process.env.TEMP ?? '.', 'bdm-f1-user-save-backup.json')
const PORT = 9333
const sha = (path) => hash('sha256').update(readFileSync(path)).digest('hex')

mkdirSync(OUT, { recursive: true })
const steps = []
let cdp
let app
const shot = async (name) => cdp.screenshot(join(OUT, `${name}.png`))
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
const normalizedPayloadHash = (save) => hash('sha256').update(JSON.stringify(save.payload)).digest('hex')

async function openApp(label) {
  await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
  await cdp.click('button', label); await sleep(2000)
}
async function launch() {
  app = await launchApp(EXE, PORT)
  cdp = await connect(app.page.webSocketDebuggerUrl)
  cdp.setField = (label, value) => cdp.evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((l) => (l.innerText || '').trim().toUpperCase().startsWith(${JSON.stringify(label)}))
    const el = label.querySelector('select,input,textarea')
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(1500)
}
/** Menu → GUARDAR PARTIDA, waiting for the native write to be confirmed (the confirmation is cleared by each new save). */
async function saveGame() {
  await cdp.click('button', 'GUARDAR PARTIDA')
  await cdp.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 30000, label: 'save confirmation' })
  await sleep(400)
}
async function closeApp() {
  try { cdp.close() } catch { /* already closed */ }
  app.child.kill()
  await sleep(2500)
}
async function assign(name, item) {
  await cdp.click('button', `Rotación ${name}`); await sleep(300)
  await cdp.click('[role=menuitemradio]', item); await sleep(300)
}
/** Reads the competition-independent facts of the user's career from the native Save V4 file. */
function saveFacts(save) {
  const p = save.payload
  const games = Object.values(p.games ?? {})
  const completed = games.filter((game) => game.status === 'completed')
  return { schemaVersion: save.schemaVersion, completed: completed.map((game) => ({ id: game.id, date: game.date, home: game.homeTeamId, away: game.awayTeamId, result: game.result })), statLogs: Object.keys(p.matchStatLogs ?? p.matchStatLogsByGameId ?? {}).length, lineups: p.lineups?.['acb-team-ucm'] ?? p.lineupsByTeamId?.['acb-team-ucm'] }
}

const PLAN = {
  starters: [['David DeJulius', 'TITULAR PG'], ['Dylan Ennis', 'TITULAR SG'], ['Howard Sant-Roos', 'TITULAR SF'], ['Kaiser Gates', 'TITULAR PF'], ['Emmanuel Cate', 'TITULAR C']],
  bench: [['Jonah Radebaugh', 'BANQUILLO B1'], ['Wilhelm Falk', 'BANQUILLO B2'], ['Sander Raieste', 'BANQUILLO B3'], ['Jean-Marc Pansa', 'BANQUILLO B4']],
}
const starterNames = PLAN.starters.map(([name]) => name)
const benchNames = PLAN.bench.map(([name]) => name)

const evidence = { platform: 'Windows Tauri debug executable, embedded production frontend (no Vite)', exe: EXE }
const userSaveHash = existsSync(SAVE) ? sha(SAVE) : null
if (existsSync(SAVE)) copyFileSync(SAVE, BACKUP)
evidence.userSaveSha256Before = userSaveHash

try {
  await launch()
  await step(1, 'NEW GAME → ACB 2026/27 → entrenador → UCAM Murcia → iniciar el 1 de julio de 2026', async () => {
    await cdp.click('button', 'NEW GAME'); await sleep(500)
    await cdp.setField('UNIVERSE', 'acb-2026-27'); await sleep(400)
    await cdp.setField('TEAM', 'ucm'); await sleep(200)
    await cdp.setField('COACH FIRST NAME', 'Elena'); await cdp.setField('COACH LAST NAME', 'Piloto')
    await cdp.setField('DATE OF BIRTH', '1990-01-01'); await cdp.setField('GENDER', 'female'); await cdp.setField('NATIONALITY', 'ESP')
    await shot('01-coach-club')
    await cdp.click('button', 'START CAREER')
    await cdp.waitFor("document.body.innerText.includes('UCAM MURCIA') && document.body.innerText.includes('01 JUL 2026')", { timeout: 60000 })
    await sleep(1500)
    assert(await has('Casademont Zaragoza') && await has('26 SEPT 2026'), 'Home must show the first fixture against Casademont Zaragoza on 26 SEPT 2026')
    await shot('02-home-july')
  })

  await step(2, 'Continuar hasta el primer encuentro (26 de septiembre de 2026, Casademont Zaragoza)', async () => {
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('26 SEPT 2026') && !!document.querySelector('header') && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH')", { timeout: 240000, label: 'Continue stops on match day' })
    await sleep(1200)
    await shot('03-home-match-day')
  })

  await step(3, 'Roster: modificar quinteto y banquillo', async () => {
    await openApp('ROSTER')
    for (const [name, slot] of [...PLAN.starters, ...PLAN.bench]) await assign(name, slot)
    const head = await cdp.buttons()
    assert(head.includes('5/5 QUINTETO'), `Roster must report 5/5 QUINTETO, got ${head.filter((b) => /QUINTETO|BANQUILLO/.test(b))}`)
    assert(head.includes('4/7 BANQUILLO'), `Roster must report 4/7 BANQUILLO, got ${head.filter((b) => /BANQUILLO/.test(b))}`)
    await shot('04-roster-lineup')
  })

  await step(4, 'Tactics muestra exactamente el mismo quinteto y banquillo', async () => {
    await openApp('TACTICS')
    const labels = await cdp.buttons()
    for (const name of [...starterNames, ...benchNames]) assert(labels.includes(name), `Tactics must list ${name}`)
    const unassigned = await cdp.evaluate(`(() => { const heads = [...document.querySelectorAll('.tactics-board-panel-header')]; return heads.map((h) => h.innerText.replace(/\\s+/g, ' ')) })()`)
    assert(unassigned.some((header) => /BANQUILLO/.test(header) && /4 disp/.test(header)), `Banquillo header must show 4 players: ${unassigned}`)
    await shot('05-tactics-same-lineup')
    return { headers: unassigned }
  })

  await step(5, 'Rotaciones: fijar minutos y guardarlos', async () => {
    await cdp.click('button', 'ROTACIONES'); await sleep(1200)
    await cdp.click('button', 'Corta'); await sleep(500)
    await cdp.click('button', 'GUARDAR ROTACIÓN'); await sleep(600)
    assert(await has('Rotación guardada en la partida.'), 'Rotation must be saved in GameWorld')
    await shot('06-rotation-saved')
  })

  await step(6, 'Pizarra: modificar instrucciones reales (ritmo, triples, esquema defensivo, bloqueo directo)', async () => {
    await cdp.click('button', 'PIZARRA'); await sleep(1000)
    await cdp.click('button', 'GENERAL'); await sleep(400)
    await cdp.focus('input[aria-label="Ritmo"]')
    await press(cdp, 'ArrowRight'); await press(cdp, 'ArrowRight')
    assert(await cdp.evaluate(`document.querySelector('input[aria-label="Ritmo"]').value === '4'`), 'Ritmo slider must reach "Máximo ritmo"')
    await cdp.click('button', 'ATAQUE'); await sleep(400)
    await cdp.focus('input[aria-label="VOLUMEN TRIPLES"]')
    await press(cdp, 'ArrowRight')
    await cdp.click('button', 'DEFENSA'); await sleep(400)
    await cdp.setValue('select[aria-label="Esquema defensivo"]', '1')
    await cdp.setValue('select[aria-label="Defensa del bloqueo directo"]', 'hedge')
    const unconnected = await cdp.evaluate(`document.querySelectorAll('[data-engine-support="none"]').length`)
    assert(unconnected >= 1, 'Settings the engine does not execute must be declared as such')
    await shot('07-pizarra-defense')
    return { unconnectedControlsOnDefense: unconnected }
  })

  await step(7, 'Guardar la partida (Save V4 nativo) y comprobar el fichero', async () => {
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
    await saveGame()
    assert(await has('Partida guardada.'), 'The save must be confirmed')
    const save = readSave()
    assert(save.schemaVersion === 4, 'Native Save V4 expected')
    evidence.saveBeforeMatch = { payloadSha256: normalizedPayloadHash(save), ...saveFacts(save) }
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(300)
    await shot('08-saved-before-match')
  })

  await step(8, 'Cerrar BDM, volver a abrir y CONTINUE: Plantilla y Tácticas se recuperan exactamente', async () => {
    await closeApp()
    await launch()
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('26 SEPT 2026')", { timeout: 60000 })
    await sleep(1500)
    await openApp('ROSTER')
    const head = await cdp.buttons()
    assert(head.includes('5/5 QUINTETO') && head.includes('4/7 BANQUILLO'), 'Reloaded roster must keep 5/5 and 4/7')
    await openApp('TACTICS')
    await cdp.click('button', 'GENERAL'); await sleep(300)
    assert(await cdp.evaluate(`document.querySelector('input[aria-label="Ritmo"]').value === '4'`), 'Reloaded pace must be "Máximo ritmo"')
    await cdp.click('button', 'DEFENSA'); await sleep(300)
    assert(await cdp.evaluate(`document.querySelector('select[aria-label="Defensa del bloqueo directo"]').value === 'hedge'`), 'Reloaded pick-and-roll coverage must be hedge')
    assert(await cdp.evaluate(`document.querySelector('select[aria-label="Esquema defensivo"]').value === '1'`), 'Reloaded defensive scheme must be "Proteger pintura"')
    await shot('09-reloaded-tactics')
    await cdp.click('button', 'ROTACIONES'); await sleep(900)
    assert(await has('Rotación guardada') || await has('LISTA PARA GUARDAR'), 'Reloaded rotation must still be valid')
  })

  await step(9, 'Partido: la presentación usa el quinteto, la rotación y el plan guardados', async () => {
    await cdp.click('button', '=MATCH'); await sleep(2500)
    const body = await text()
    assert(body.includes('TU QUINTETO INICIAL') && body.includes('Elegido por ti'), 'The starting five must be marked as chosen by the user')
    for (const name of starterNames) assert(body.includes(name), `Prep must show starter ${name}`)
    assert(body.includes('Minutos fijados por ti'), 'Rotation minutes must be the user\'s')
    assert(body.includes('Máximo ritmo') && body.includes('Proteger pintura') && body.includes('Hedge'), 'Prep must show the saved tactical plan')
    await shot('10-match-prep')
  })

  await step(10, 'Disputar el encuentro en directo con el MatchViewer hasta el final', async () => {
    await cdp.click('button', 'JUGAR PARTIDO'); await sleep(2500)
    await cdp.waitFor("document.querySelector('[data-ng-region=\"match-live\"]')", { timeout: 20000 })
    assert(await has('GUARDAR PARTIDA') === false, 'No save controls while the live match is open (menu closed)')
    await sleep(4000)
    await shot('11-match-live')
    // Save/Load are refused while a match is being watched.
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
    const blocked = await cdp.evaluate(`[...document.querySelectorAll('button')].filter((b) => /GUARDAR PARTIDA|CARGAR PARTIDA/.test(b.innerText)).map((b) => b.disabled)`)
    assert(blocked.length === 2 && blocked.every(Boolean), 'Save and load must be disabled during a live match')
    assert(await has('Hay un partido en curso'), 'The refusal must be explained')
    await shot('12-save-blocked-live')
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(300)
    await cdp.click('button', 'Simular final', { timeout: 30000 })
    await cdp.waitFor("[...document.querySelectorAll('button')].some((b) => b.innerText.trim().toLowerCase() === 'continuar')", { timeout: 300000, label: 'final whistle' })
    await sleep(1000)
    await shot('13-match-final')
    evidence.liveFinalText = (await text()).split('\n').filter((line) => /FINAL|SEMILLA/.test(line)).slice(0, 4)
    await cdp.click('button', 'Continuar'); await sleep(2000)
  })

  let result
  await step(11, 'Acta: marcador, estadísticas y minutos coherentes', async () => {
    result = await cdp.evaluate(`(() => {
      const report = document.querySelector('[aria-label="Acta del partido"]')
      if (!report) return null
      const score = [...report.querySelectorAll('.mp-report__score b')].map((b) => Number(b.innerText))
      const teams = [...report.querySelectorAll('article')].map((article) => {
        const foot = [...article.querySelectorAll('tfoot td')].map((td) => td.innerText)
        const rows = [...article.querySelectorAll('tbody tr')].map((tr) => ({ name: tr.querySelector('th button')?.innerText, min: tr.children[1].innerText, pts: Number(tr.children[2].innerText), started: /TITULAR/.test(tr.querySelector('th small')?.innerText ?? '') }))
        return { team: article.querySelector('h4').innerText, totals: foot, rows }
      })
      return { score, teams, gameId: report.dataset.gameId, header: report.querySelector('header').innerText.replace(/\\s+/g, ' ') }
    })()`)
    assert(result !== null, 'The acta must be visible after the match')
    const [home, away] = result.score
    assert(Number.isFinite(home) && Number.isFinite(away) && home !== away, `A regulation result with a winner is expected, got ${result.score}`)
    result.teams.forEach((team, index) => {
      const points = team.rows.reduce((sum, row) => sum + row.pts, 0)
      assert(points === result.score[index], `${team.team}: player points ${points} must equal the score ${result.score[index]}`)
      assert(Number(team.totals[1]) === points, `${team.team}: team total row must equal the player points`)
    })
    const ucm = result.teams.find((team) => team.team.toLowerCase() === 'ucam murcia')
    const started = ucm.rows.filter((row) => row.started).map((row) => row.name).sort()
    assert(JSON.stringify(started) === JSON.stringify([...starterNames].sort()), `The user's starters in the acta must be the chosen five, got ${started}`)
    await shot('14-acta')
    evidence.result = { score: result.score, gameId: result.gameId, header: result.header, ucmStarters: started }
  })

  let standingsBefore
  await step(12, 'Competition: clasificación y resultados actualizados desde GameWorld', async () => {
    await cdp.click('button', '=Home'); await sleep(1500)
    await cdp.click('button', 'VER EN COMPETICIÓN'); await sleep(2500)
    await cdp.click('button', '=Clasificación'); await sleep(1200)
    standingsBefore = await cdp.evaluate(String.raw`(() => {
      const out = {}
      const squash = (el) => el.innerText.split(/\s+/).filter(Boolean).join(' ')
      for (const team of ['UCAM Murcia', 'Casademont Zaragoza']) {
        let row = [...document.querySelectorAll('button,a,span,div')].find((el) => el.children.length === 0 && el.textContent.trim() === team && el.getBoundingClientRect().width > 0)
        for (let depth = 0; row && depth < 6 && !(/^[0-9]/.test(squash(row)) && squash(row).includes(team + ' ')); depth += 1) row = row.parentElement
        const text = row ? squash(row) : ''
        out[team] = text === '' ? [] : text.slice(text.indexOf(team) + team.length).trim().split(' ').slice(0, 7) // PJ W L PF PA DIFF PCT
      }
      return out
    })()`)
    const [homeScore, awayScore] = result.score
    const winner = homeScore > awayScore ? 'Casademont Zaragoza' : 'UCAM Murcia'
    const loser = winner === 'UCAM Murcia' ? 'Casademont Zaragoza' : 'UCAM Murcia'
    assert(standingsBefore[winner][0] === '1' && standingsBefore[winner][1] === '1' && standingsBefore[winner][2] === '0', `${winner} must be 1 played, 1 won: ${standingsBefore[winner]}`)
    assert(standingsBefore[loser][0] === '1' && standingsBefore[loser][1] === '0' && standingsBefore[loser][2] === '1', `${loser} must be 1 played, 1 lost: ${standingsBefore[loser]}`)
    assert(standingsBefore[winner][3] === String(Math.max(homeScore, awayScore)) && standingsBefore[winner][4] === String(Math.min(homeScore, awayScore)), `${winner} points for/against must match the acta score ${result.score}: ${standingsBefore[winner]}`)
    await shot('15-competition-standings')
    await cdp.click('button', '=Resultados'); await sleep(1000)
    assert(await has(String(Math.max(homeScore, awayScore))) && await has(String(Math.min(homeScore, awayScore))), 'Resultados must show the final score')
    await shot('16-competition-results')
    evidence.standingsAfterMatch = standingsBefore
  })

  await step(13, 'Home: resultado registrado y calendario avanzado', async () => {
    await cdp.click('button', '=Home'); await sleep(2000)
    const body = await text()
    await shot('17-home-after-match')
    assert(body.includes('Valencia Basket') && body.includes('03 OCT 2026'), 'Home must show the next fixture after the played game')
    assert(/(?:1-0|0-1)\s+BALANCE/.test(body), 'Home must show the new record of the user team')
    const [homeScore, awayScore] = result.score
    const winnerName = homeScore > awayScore ? 'Casademont Zaragoza' : 'UCAM Murcia'
    assert(await cdp.evaluate(`document.body.innerText.includes(${JSON.stringify(String(Math.max(homeScore, awayScore)))})`), 'Home must show the played result')
    evidence.homeAfterMatch = { nextFixture: 'Valencia Basket · 03 OCT 2026', winner: winnerName }
  })

  await step(14, 'Guardar, cerrar, volver a cargar y comprobar la conservación exacta', async () => {
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
    await saveGame()
    assert(await has('Partida guardada.'), 'The save must be confirmed')
    const first = readSave()
    const facts = saveFacts(first)
    assert(facts.completed.length >= 1 && facts.statLogs >= 1, 'The save must contain the completed game and its stat log')
    const firstHash = normalizedPayloadHash(first)
    await closeApp()
    await launch()
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('26 SEPT 2026')", { timeout: 60000 })
    await sleep(1500)
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
    await saveGame()
    const second = readSave()
    assert(normalizedPayloadHash(second) === firstHash, 'The payload re-saved after reloading must be byte-identical (Save V4 roundtrip)')
    evidence.saveAfterMatch = { payloadSha256: firstHash, payloadEqualAfterProcessRestart: true, ...facts }
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(300)
    await cdp.click('button', '=Home'); await sleep(1500)
    await shot('18-reloaded-after-match')
  })

  await step(15, 'Continuar hasta el siguiente encuentro sin duplicar el anterior y jugarlo (simulación rápida)', async () => {
    await cdp.click('button', 'CONTINUE')
    await cdp.waitFor("document.body.innerText.includes('03 OCT 2026') && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'MATCH')", { timeout: 240000, label: 'next user game' })
    await sleep(1200)
    await shot('19-next-match-day')
    await cdp.click('button', '=MATCH'); await sleep(2500)
    assert(await has('Valencia Basket'), 'The next fixture is against Valencia Basket')
    assert(await has('Acta del partido') || await cdp.evaluate(`!!document.querySelector('[aria-label="Acta del partido"]')`), 'The previous acta stays visible')
    const firstGameId = evidence.result.gameId
    await cdp.click('button', 'SIMULACIÓN RÁPIDA')
    await cdp.waitFor(`[...document.querySelectorAll('[aria-label="Acta del partido"]')].some((el) => el.dataset.gameId !== ${JSON.stringify(firstGameId)})`, { timeout: 300000, label: 'second acta' })
    await sleep(800)
    await shot('20-second-match-acta')
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(500)
    await saveGame()
    const save = readSave()
    const facts = saveFacts(save)
    const userGames = facts.completed.filter((game) => game.home === 'acb-team-ucm' || game.away === 'acb-team-ucm')
    assert(userGames.length === 2, `Exactly two user games must be completed, got ${userGames.length}`)
    assert(new Set(facts.completed.map((game) => game.id)).size === facts.completed.length, 'No completed game may be duplicated')
    assert(facts.statLogs === facts.completed.length, 'One stat log per completed game')
    const first = userGames.find((game) => game.id === firstGameId)
    assert(JSON.stringify(first.result) === JSON.stringify({ homeScore: result.score[0], awayScore: result.score[1] }), 'The first result must be unchanged')
    evidence.afterSecondMatch = { completedGames: facts.completed.length, userGames: userGames.length, statLogs: facts.statLogs }
    await cdp.click('button', 'Abrir menú de inicio BDM'); await sleep(300)
  })

  await step(16, 'Courtside: modo claro y ventana compacta, sin textos ilegibles ni errores de renderizado', async () => {
    await cdp.click('button', 'Activar modo claro'); await sleep(800)
    await shot('21-match-light')
    await cdp.size(1280, 720); await sleep(800)
    await shot('22-match-compact-light')
    const overflow = await cdp.evaluate('document.documentElement.scrollWidth > innerWidth + 2')
    assert(!overflow, 'No horizontal page overflow in the compact window')
    await openApp('TACTICS'); await sleep(1000)
    await shot('23-tactics-compact-light')
    await cdp.resetSize()
    await cdp.click('button', 'Activar modo oscuro').catch(() => {})
    assert(cdp.consoleErrors.length === 0, `Rendering errors in the console: ${cdp.consoleErrors.slice(0, 3).join(' | ')}`)
  })
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
  console.log(failed.length === 0 && steps.length === 16 ? 'WINDOWS ACCEPTANCE: PASS' : 'WINDOWS ACCEPTANCE: FAIL')
  process.exitCode = failed.length === 0 && steps.length === 16 ? 0 : 1
}
