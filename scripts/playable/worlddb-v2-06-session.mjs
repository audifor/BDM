// Real Windows session: production Courtside controls, native Save V4, no injected world state.
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'
import { resolveNativeMedical, resolveNativePress } from './worlddb-v2-native-decisions.mjs'

const out = resolve('.worlddb-v2/v2-06', 'session-' + Date.now())
const profile = 'v2-06-session-' + Date.now()
const savePath = join(process.env.APPDATA, 'com.bdm.worlddbv2.pilot/saves/profiles', profile, 'main.json')
mkdirSync(out, { recursive: true })
const steps = [], started = Date.now()
let app, c, dayNumber=0
const assert = (ok, message) => { if (!ok) throw Error(message) }
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const truth = p => { const v = structuredClone(p); v.staffCareerRuntime.governanceDecisionEvents.sort((a,b) => a.id.localeCompare(b.id)); return JSON.stringify(canonical(v)) }
async function launch() {
  app = await launchApp(resolve('artifacts/bdm.exe'), 9576, { BDM_SAVE_PROFILE: profile, WEBVIEW2_USER_DATA_FOLDER: join(out, 'webview') })
  c = await connect(app.page.webSocketDebuggerUrl)
  await c.waitFor("document.body?.innerText.includes('NEW GAME')", { timeout: 60000 })
}
async function field(label, value) {
  await c.evaluate(`(() => { const l = [...document.querySelectorAll('label')].filter(l => l.getBoundingClientRect().width > 0).find(l => l.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!l) throw Error('Missing field '+${JSON.stringify(label)}); const e=l.querySelector('input,select,textarea'); const p=e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await sleep(200)
}
async function open(name, group) {
  await c.click('button', 'Abrir menú de inicio BDM'); await c.click('button', '='+group); await c.click('button', '='+name); await sleep(600)
}
async function save(name) {
  await c.send('Page.bringToFront')
  await c.click('button', 'Abrir menú de inicio BDM'); await c.click('button', 'GUARDAR PARTIDA')
  await c.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 3000 }).catch(()=>{})
  if(!await c.evaluate("document.body.innerText.includes('Partida guardada.')") && (await c.locate('button','GUARDAR PARTIDA'))?.disabled===false){
    await c.send('Page.bringToFront'); await c.click('button','GUARDAR PARTIDA')
  }
  await c.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 120000 })
  await c.click('button', 'Abrir menú de inicio BDM')
  const saved = JSON.parse(readFileSync(savePath, 'utf8'))
  writeFileSync(join(out, name+'.json'), JSON.stringify(saved)); return saved
}
async function step(name, action) {
  try { const detail = await action(); steps.push({ name, elapsedMs: Date.now()-started, status:'PASS', detail }); await c.screenshot(join(out,name+'.png')); console.log('PASS '+name) }
  catch(error) { steps.push({name,status:'FAIL',error:String(error),text:await c.bodyText().catch(()=>'<closed>')}); await c.screenshot(join(out,'failure.png')).catch(()=>{}); throw error }
  finally { writeFileSync(join(out,'session.json'),JSON.stringify({passed:steps.length===9&&steps.every(s=>s.status==='PASS'),profile,savePath,out,elapsedMs:Date.now()-started,steps,consoleErrors:c?.consoleErrors??[]},null,2)) }
}
async function day(inspectOtherLeague=false) {
  await open('MATCH','Partidos y competición')
  const date=await c.evaluate("document.querySelector('.ng-system-bar__date').innerText")
  await c.evaluate(`(()=>{const m=window.__sessionProgress={states:[]};m.observer=new MutationObserver(()=>{const text=document.querySelector('.ng-taskbar__status')?.innerText;if(text!==m.states.at(-1)?.text)m.states.push({at:performance.now(),text})});m.observer.observe(document.body,{subtree:true,childList:true,characterData:true})})()`)
  await c.click('button','AVANZAR UN DÍA')
  await sleep(1200)
  if(await c.evaluate(`document.querySelector('.ng-system-bar__date').innerText===${JSON.stringify(date)} && !document.querySelector('[data-simulation-phase]') && !document.querySelector('p.mp-alert[role=alert]')`)) await c.click('button','AVANZAR UN DÍA')
  if(inspectOtherLeague && await c.locate('[data-simulation-phase]')){
    await open('COMPETITION','Partidos y competición')
    await c.evaluate(`(()=>{const e=document.querySelector('select[aria-label="Competición"]');const option=[...e.options].find(o=>o.value.includes(':FRA:'));if(!option)throw Error('France missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,option.value);e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await c.click('button,[role=tab]','=Clasificación')
    await c.screenshot(join(out,'france-during-world-advance.png'))
  }
  await c.waitFor(`document.querySelector('.ng-system-bar__date').innerText!==${JSON.stringify(date)} || !!document.querySelector('p.mp-alert[role=alert]')`,{timeout:600000})
  const progress=await c.evaluate('(()=>{window.__sessionProgress.observer.disconnect();return window.__sessionProgress.states})()')
  writeFileSync(join(out,`day-progress-${dayNumber++}.json`),JSON.stringify({date,inspectOtherLeague,progress},null,2))
  if(inspectOtherLeague)assert(progress.some(p=>/partidos [1-9][0-9]*\/[0-9]+/i.test(p.text)),'No real completed-match progress was visible')
  const advisories=await c.evaluate("[...document.querySelectorAll('ul.mp-alert[role=alert]')].map(e=>e.innerText)")
  if(advisories.length)appendFileSync(join(out,'rotation-advisories.jsonl'),JSON.stringify({date,advisories})+'\n')
  const alert=await c.evaluate("document.querySelector('p.mp-alert[role=alert]')?.innerText")
  if(alert){
    if(/medic|return|alta/i.test(alert)) await resolveNativeMedical(c,open,out)
    else if(/media|press|prensa/i.test(alert)) await resolveNativePress(c,open,out)
    else throw Error(alert)
    return day()
  }
}
try {
  await launch()
  await step('01-new-career',async()=>{
    await c.click('button','=NEW GAME'); await field('UNIVERSE','worldDbV2')
    assert(await c.evaluate("document.querySelectorAll('fieldset input[type=checkbox]:checked').length===4"),'Expected four active leagues')
    await field('WORLDDB SOURCE FOLDER','C:/BDM_DB/WORLDDB_PBM')
    await c.waitFor("[...document.querySelectorAll('select option')].some(o=>o.value==='pbm:DYN_equipe:41')",{timeout:60000})
    await field('TEAM','pbm:DYN_equipe:41'); await field('START DATE','2025-10-04'); await field('WORLD SEED','worlddb-v2-universe-06')
    await field('COACH FIRST NAME','Fluidez'); await field('COACH LAST NAME','Windows')
    await c.click('button','START CAREER')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:180000})
    const v=await save('opening'); assert(v.payload.teams.length===70&&v.payload.competitions.length===4,'Incomplete universe')
    return {teams:70,competitions:4}
  })
  await step('02-roster',async()=>{ await open('ROSTER','Equipo'); return {text:await c.bodyText()} })
  await step('03-tactics',async()=>{
    await open('TACTICS','Equipo'); await c.click('button,[role=tab]','=ROTACIONES')
    for(let n=0;n<12;n++){
      if(!await c.locate('button[aria-label^="Convocar "]:not([disabled])'))break
      await c.click('button[aria-label^="Convocar "]:not([disabled])')
    }
    await c.click('button','=Profunda'); await c.click('button','=GUARDAR ROTACIÓN')
    return {decision:'Profunda: saved canonical rotation minutes',text:await c.bodyText()}
  })
  await step('04-training',async()=>{
    await open('TRAINING','Equipo')
    await field('Ejercicio','activeRecovery'); await field('Intensidad','light'); await field('Fecha','2025-10-05'); await c.click('button','=PROGRAMAR')
    await field('Ejercicio','defensiveSystem'); await field('Intensidad','normal'); await field('Fecha','2025-10-06'); await c.click('button','=PROGRAMAR')
    assert((await c.bodyText()).includes('Sesión creada'),'Training command not acknowledged')
    return {decisions:['2025-10-05 activeRecovery light','2025-10-06 defensiveSystem normal'],text:await c.bodyText()}
  })
  await step('05-market',async()=>{ await open('MARKET','Mercado'); await c.click('button','=Buscar jugadores'); return {text:await c.bodyText()} })
  await step('06-live-match',async()=>{
    await open('MATCH','Partidos y competición'); await c.click('button','=JUGAR PARTIDO')
    await c.waitFor("!!document.querySelector('select[aria-label=\"Velocidad del partido\"]')",{timeout:3000}).catch(()=>{})
    if(!await c.locate('select[aria-label="Velocidad del partido"]') && await c.locate('button:not([disabled])','=JUGAR PARTIDO') && !await c.locate('[role=alert]')){
      await c.send('Page.bringToFront'); await c.click('button','=JUGAR PARTIDO')
    }
    await c.waitFor("!!document.querySelector('select[aria-label=\"Velocidad del partido\"]')",{timeout:120000})
    await c.evaluate("(()=>{const e=document.querySelector('select[aria-label=\"Velocidad del partido\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('change',{bubbles:true}))})()")
    const liveStarted=Date.now(), samples=[]
    // Fifteen minutes of real 2x playback, then the existing full-engine finish control; no padded waits.
    for(let minute=0;minute<28;minute++){
      const text=await c.bodyText(); samples.push({atMs:Date.now()-liveStarted,text})
      await c.screenshot(join(out,`live-${String(minute).padStart(2,'0')}.png`))
      writeFileSync(join(out,'live-observations.json'),JSON.stringify(samples,null,2))
      if(!await c.locate('select[aria-label="Velocidad del partido"]'))break
      if(minute===2){await c.click('button','=Pausar partido');await c.screenshot(join(out,'live-paused.png'));await c.click('button','=Reanudar partido')}
      if(minute===15){
        await c.click('button','=Simular final')
        await c.waitFor("!document.querySelector('select[aria-label=\"Velocidad del partido\"]')",{timeout:120000})
        await c.screenshot(join(out,'live-finished-with-full-engine.png'));break
      }
      await sleep(30000); await sleep(30000)
    }
    assert(!await c.locate('select[aria-label="Velocidad del partido"]'),'Match did not finish in observation window')
    await c.click('button','=Continuar')
    const checkpoint=await save('after-live-match')
    assert(checkpoint.payload.matchStatLogs.length===1 && checkpoint.payload.matchStatLogs[0].resolution==='FULL','The watched match was not saved exactly once with its FULL acta')
    return {elapsedMs:Date.now()-liveStarted,samples:samples.length,text:await c.bodyText()}
  })
  await step('07-consequences-and-next-week',async()=>{
    for(let n=0;n<7;n++)await day(n===0)
    await open('TRAINING','Equipo'); await c.click('button','=RESULTADOS'); await c.screenshot(join(out,'training-results.png'))
    const training=await c.bodyText()
    await open('Medical','Equipo'); await c.screenshot(join(out,'medical.png'))
    await open('Finances','Gestión del club'); await c.screenshot(join(out,'finances.png'))
    const finances=await c.bodyText()
    await open('Coach','Mi carrera'); await c.screenshot(join(out,'coach.png'))
    const v=await save('week'); assert(v.payload.matchStatLogs.length>=35,'Universe did not advance')
    return {date:v.payload.currentDate,actas:v.payload.matchStatLogs.length,training,finances}
  })
  await step('08-other-leagues',async()=>{
    await open('COMPETITION','Partidos y competición')
    const leagues=await c.evaluate("[...document.querySelector('select[aria-label=\"Competición\"]').options].map(o=>({id:o.value,name:o.text}))")
    assert(leagues.length===4,'Missing leagues')
    for(const league of leagues){await c.evaluate(`(()=>{const e=document.querySelector('select[aria-label="Competición"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(league.id)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await c.click('button,[role=tab]','=Clasificación');await sleep(300);await c.screenshot(join(out,league.id.replaceAll(':','-')+'.png'))}
    return leagues
  })
  await step('09-save-close-load-continue',async()=>{
    const before=await save('before-close'); c.close();app.child.kill();await sleep(1500);await launch();await c.click('button','=CONTINUE')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:120000})
    const restored=await save('restored'); assert(truth(restored.payload)===truth(before.payload),'Save V4 universe changed')
    await day();const after=await save('continued');assert(after.payload.currentDate!==before.payload.currentDate,'Reload did not continue')
    return {exactRoundTrip:true,date:after.payload.currentDate,teams:after.payload.teams.length,competitions:after.payload.competitions.length,actas:after.payload.matchStatLogs.length}
  })
} finally { c?.close();app?.child.kill() }
