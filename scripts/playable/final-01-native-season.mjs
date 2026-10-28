// Continue the same real Windows career through Courtside's existing holiday control.
// No world injection, mocked decisions, synthetic injuries, or alternate match runner.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { connect, sleep } from './cdp.mjs'
import { resolveNativeMedical, resolveNativePress } from './worlddb-v2-native-decisions.mjs'
const context = JSON.parse(readFileSync(resolve('.worlddb-v2/final-01/windows-current.json'), 'utf8'))
const targets = await (await fetch(`http://127.0.0.1:${context.port}/json`)).json()
const c = await connect(targets.find(p => p.type === 'page').webSocketDebuggerUrl)
const target = process.env.BDM_FINAL01_UNTIL ?? '2026-10-12'
const open = async (name, group) => {
  await c.send('Page.bringToFront'); await sleep(400)
  if (!await c.locate('button','=GUARDAR PARTIDA')) await c.click('button', 'Abrir menú de inicio BDM')
  await c.click('button', '='+group); await c.click('button', '='+name); await sleep(1000)
}
async function save(name) {
  await sleep(600)
  await c.click('button', 'Abrir menú de inicio BDM'); await c.click('button', '=GUARDAR PARTIDA')
  await c.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 120000 })
  await sleep(600)
  if (await c.locate('button','=GUARDAR PARTIDA')) await c.click('button', 'Abrir menú de inicio BDM')
  const raw = readFileSync(context.savePath, 'utf8'), data = JSON.parse(raw)
  writeFileSync(join(context.out, name+'.json'), raw)
  return data.payload
}
const plusDays = (date, count) => new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10)
try {
  let world = await save('season-native-start'), stalls = 0
  for (let chunk = 0; world.currentDate < target && chunk < 180; chunk++) {
    const before = world.currentDate, until = [plusDays(before, 30), target].sort()[0]
    await c.click('button[aria-label="Simulate until date"]')
    for (let month = 0; !await c.locate(`button[aria-label="Choose ${until}"]`) && month < 15; month++) await c.click('button[aria-label="Next month"]')
    await c.click(`button[aria-label="Choose ${until}"]`); await c.click('.ng-sim-cal__actions button', '=Simulate')
    await sleep(1000)
    for (let poll = 0; await c.locate('[aria-label="Simulation progress"]') && poll < 1800; poll++) {
      if (poll % 10 === 0) {
        const progress = await c.evaluate("document.querySelector('[aria-label=\"Simulation progress\"]')?.innerText")
        writeFileSync(join(context.out, 'season-native-progress.json'), JSON.stringify({ target: until, progress, checkedAt: new Date().toISOString() }))
        if (poll % 60 === 0) { console.log(progress?.replaceAll('\n',' · ')); await c.screenshot(join(context.out,'season-progress.png')) }
      }
      await sleep(2000)
    }
    if (await c.locate('[aria-label="Simulation progress"]')) throw Error('Native holiday exceeded one hour')
    world = await save('season-native-latest')
    const entry = { before, until, date: world.currentDate, actas: world.matchStatLogs.length, injuries: world.injuries.length,
      champions: (world.seasonHistory ?? []).filter(season=>season.championTeamId).length, periods: world.fiscalPeriods?.filter(p=>p.status==='CLOSED').length }
    appendFileSync(join(context.out, 'season-native-chunks.jsonl'), JSON.stringify(entry)+'\n'); console.log(JSON.stringify(entry))
    await c.screenshot(join(context.out,'season-'+world.currentDate+'.png'))
    // Required decisions are acted on through their existing workspaces. Their services retain authority.
    if (world.currentDate < until) {
      writeFileSync(join(context.out, 'season-stop-ui.txt'), await c.bodyText())
      await resolveNativeMedical(c, open, context.out); await resolveNativePress(c, open, context.out)
      if (world.currentDate === before) stalls++; else stalls = 0
      if (stalls > 2) throw Error('Unresolved native decision; inspect season-stop-ui.txt')
    }
  }
  if (world.currentDate < target) throw Error('Native season did not reach target')
  await save('season-native-completed'); await open('FINANCES','Gestión del club')
  writeFileSync(join(context.out,'season-finances-ui.txt'),await c.bodyText()); await c.screenshot(join(context.out,'season-finances.png'))
  console.log('PASS Native season reached '+world.currentDate)
} catch (error) {
  writeFileSync(join(context.out,'season-native-failure.json'),JSON.stringify({error:String(error),body:await c.bodyText().catch(()=>'<closed>')},null,2))
  await c.screenshot(join(context.out,'season-native-failure.png')).catch(()=>{}); throw error
} finally { c.close() }
