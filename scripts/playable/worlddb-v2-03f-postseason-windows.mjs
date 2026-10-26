// Real Tauri controls on a copied, certified phase Save V4. Never inject a world.
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {connect,launchApp,sleep} from './cdp.mjs'
const source=process.env.BDM_FRANCE_NATIVE_PHASE
if(!source)throw Error('BDM_FRANCE_NATIVE_PHASE must name a real certified phase save')
const initial=JSON.parse(readFileSync(source,'utf8')),phase=initial.payload.currentDate
const profile='qa-france-03f-'+Date.now(),out=resolve('.worlddb-v2/native-france-03f-'+Date.now())
const folder=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot/saves/profiles',profile),savePath=join(folder,'main.json')
if(existsSync(savePath))throw Error('Profile exists')
mkdirSync(out,{recursive:true});mkdirSync(folder,{recursive:true});copyFileSync(source,savePath)
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const truth=v=>{const x=structuredClone(v);x.staffCareerRuntime.governanceDecisionEvents.sort((a,b)=>a.id.localeCompare(b.id));return canonical(x)}
const same=(a,b)=>JSON.stringify(truth(a))===JSON.stringify(truth(b))
function verifyLoaded(payload){
 const marker='BDM_V2_03F_DOCUMENTED_BINDING',comparison=structuredClone(payload)
 for(const season of comparison.seasons){
  const original=initial.payload.seasons.find(s=>s.id===season.id),before=original?.worldCompetitionFormat,after=season.worldCompetitionFormat
  if(!before||before.notes?.includes(marker)||before.competitionSeasonId!=='edition:FRA:betclic-elite:2025-26')continue
  assert(after.notes?.startsWith(before.notes+' | '+marker),'Missing documented upgrade marker')
  assert(after.sources.length===before.sources.length+4&&JSON.stringify(canonical(after.sources.slice(0,before.sources.length)))===JSON.stringify(canonical(before.sources)),'Source provenance was replaced')
  after.notes=before.notes;after.sources=before.sources
  for(const variant of after.variants)for(const node of variant.nodes){
   const old=before.variants.find(v=>v.key===variant.key).nodes.find(n=>n.key===node.key)
   if(['QUARTERFINALS','SEMIFINALS','FINAL'].includes(node.key)){
    assert(node.hosting.ruleType==='SERIES_PATTERN'&&node.hosting.pattern===(node.key==='QUARTERFINALS'?'HAH':'HHAAH')&&node.hosting.priorityBasis==='HIGHER_SEED','Wrong documented series binding');node.hosting=old.hosting
   }
   if(node.key==='PLAY_IN_FINAL'){assert(node.hosting.ruleType==='ASSIGNED_HOST'&&node.hosting.priorityBasis==='FIRST_PARTICIPANT','Wrong play-in host binding');node.hosting=old.hosting}
   if(node.key==='SEMIFINALS'){assert(JSON.stringify(node.pairing.payload.paths)===JSON.stringify(['WINNER_1_VS_8_VS_WINNER_4_VS_5','WINNER_2_VS_7_VS_WINNER_3_VS_6']),'Wrong semifinal paths');node.pairing=old.pairing}
  }
 }
 assert(same(comparison,initial.payload),'Load changed facts outside the documented format upgrade')
}
let app,c;const steps=[]
const assert=(value,message)=>{if(!value)throw Error(message)}
async function launch(){app=await launchApp(resolve('artifacts/bdm.exe'),9560,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,'webview')});c=await connect(app.page.webSocketDebuggerUrl);await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE');await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:60000})}
async function open(name,group='Partidos y competición'){await c.click('button','Abrir menú de inicio BDM');await c.click('button','='+group);await c.click('button','='+name);await sleep(800)}
async function save(name){await c.click('button','Abrir menú de inicio BDM');await c.click('button','GUARDAR PARTIDA');await c.waitFor("document.body?.innerText.includes('Partida guardada.')",{timeout:60000});await c.click('button','Abrir menú de inicio BDM');const value=JSON.parse(readFileSync(savePath,'utf8'));writeFileSync(join(out,name+'.json'),JSON.stringify(value));return value}
async function press(){await open('Press','Mundo y narrativa');for(let n=0;n<10&&await c.locate('button','=Delegate answer');n++)await c.click('button','=Delegate answer')}
async function day(){
 await press();await open('MATCH')
 if(await c.locate('button','=SIMULACIÓN RÁPIDA')){
  await c.click('button','=SIMULACIÓN RÁPIDA')
  await c.waitFor("![...document.querySelectorAll('button')].some(b=>b.innerText.trim().toUpperCase()==='SIMULACIÓN RÁPIDA')",{timeout:300000})
  // A played match can create a new mandatory post-match Press interaction.
  await press();await open('MATCH')
 }
 const before=await c.evaluate("document.querySelector('.ng-system-bar__date').innerText")
 await c.click('button','AVANZAR UN DÍA')
 await c.waitFor(`document.querySelector('.ng-system-bar__date')?.innerText!==${JSON.stringify(before)}`,{timeout:180000})
}
async function step(name,fn){try{const detail=await fn();await c.screenshot(join(out,name+'.png'));steps.push({name,status:'PASS',detail});console.log('PASS '+phase+' '+name)}catch(e){steps.push({name,status:'FAIL',error:String(e),text:await c.bodyText().catch(()=>'<closed>')});await c.screenshot(join(out,'failure.png')).catch(()=>{});throw e}finally{writeFileSync(join(out,'acceptance.json'),JSON.stringify({source,profile,savePath,steps,consoleErrors:c?.consoleErrors??[]},null,2))}}
try{
 await launch()
 await step('load-certified-phase',async()=>{const v=await save('loaded');verifyLoaded(v.payload);await open('COMPETITION');await c.click('button,[role=tab]','=Clasificación');return {date:v.payload.currentDate,clubs:v.payload.teams.length,regularCompleted:v.payload.games.filter(g=>g.stakes==='regular'&&g.status==='completed').length}})
 await step('native-decisive-match-acta',async()=>{await press();await open('MATCH');await c.click('button.mp-action--primary');try{await c.waitFor("!!document.querySelector('[data-ng-region=\"match-live\"]')",{timeout:5000})}catch{await c.click('button.mp-action--primary');await c.waitFor("!!document.querySelector('[data-ng-region=\"match-live\"]')",{timeout:60000})}await c.screenshot(join(out,'live.png'));await c.click('button','Simular final');await c.waitFor("[...document.querySelectorAll('button')].some(b=>b.innerText.trim().toLowerCase()==='continuar')",{timeout:300000});await c.click('button','=Continuar');await c.waitFor("!!document.querySelector('[aria-label=\"Acta del partido\"]')",{timeout:60000});const v=await save('played');const added=v.payload.games.filter(g=>g.status==='completed'&&!initial.payload.games.some(old=>old.id===g.id&&old.status==='completed'));assert(added.length===1,'Expected exactly one native user result');assert(v.payload.matchStatLogs.some(l=>l.gameId===added[0].id),'Missing acta');return added[0]})
 await step('progress-and-project-fixtures',async()=>{await day();await day();const v=await save('progressed');assert(v.payload.games.filter(g=>g.status==='completed').length>initial.payload.games.filter(g=>g.status==='completed').length,'No progression');await open('COMPETITION');await c.click('button,[role=tab]','=Resultados');return {date:v.payload.currentDate,postseason:v.payload.games.filter(g=>g.postseasonFixtureId),actas:v.payload.matchStatLogs.length}})
 const checkpoint=await save('before-close');c.close();app.child.kill();await sleep(1800);await launch()
 await step('close-reopen-continue',async()=>{const v=await save('reopened');assert(same(v.payload,checkpoint.payload),'Native reload changed state');await day();const after=await save('continued');return {date:after.payload.currentDate,completed:after.payload.games.filter(g=>g.status==='completed').length}})
}finally{c?.close();app?.child.kill();console.log(JSON.stringify({out,profile}))}
