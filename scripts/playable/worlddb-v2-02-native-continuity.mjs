// Reopen a certified Save V4 through Tauri, including multileague successors.
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {connect,launchApp,sleep} from './cdp.mjs'
import {resolveNativeMedical,resolveNativePress} from './worlddb-v2-native-decisions.mjs'
const root=resolve('.worlddb-v2')
mkdirSync(root,{recursive:true})
const run=readdirSync(root).filter(n=>n.startsWith('continuity-02-')).sort().reverse().find(n=>existsSync(join(root,n,'continued.json')))
if(!run&&!process.env.BDM_WORLDDB_NATIVE_SUCCESSOR)throw Error('A certified second-season save is required; do not recreate the universe')
const source=process.env.BDM_WORLDDB_NATIVE_SUCCESSOR??join(root,run,'continued.json')
const initial=JSON.parse(readFileSync(source,'utf8')),version=process.env.BDM_WORLDDB_NATIVE_SUCCESSOR?'03':'02'
const country=initial.payload.worldDbCompetitionRuntime.worldDbV2.nativeCompetitionId.split(':')[1]
const out=join(root,'native-continuity-'+version+'-'+country+'-'+Date.now()),profile='qa-continuity-'+version+'-'+country+'-'+Date.now()
const folder=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot','saves','profiles',profile),savePath=join(folder,'main.json')
if(existsSync(savePath))throw Error('Acceptance profile must be new')
mkdirSync(out,{recursive:true});mkdirSync(folder,{recursive:true});copyFileSync(source,savePath)
const canonical=v=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const truth=v=>{const x=structuredClone(v);x.staffCareerRuntime.governanceDecisionEvents.sort((a,b)=>a.id.localeCompare(b.id));return canonical(x)}
const same=(a,b)=>JSON.stringify(truth(a))===JSON.stringify(truth(b))
let app,c,checkpoint;const steps=[]
async function launch(){app=await launchApp(resolve('artifacts/bdm.exe'),9546,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,'webview')});c=await connect(app.page.webSocketDebuggerUrl);await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE');await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:60000})}
async function menu(){await c.click('button','Abrir menú de inicio BDM');await sleep(300);if(!await c.locate('button','GUARDAR PARTIDA')){await c.click('button','Abrir menú de inicio BDM');await sleep(300)}}
async function open(name,group='Partidos y competición'){await menu();await c.click('button','='+group);await c.click('button','='+name);await sleep(800)}
async function day(){await resolveNativeMedical(c,open,out);await resolveNativePress(c,open,out);const before=await c.evaluate("document.querySelector('.ng-system-bar__date').innerText");await open('MATCH');await c.click('button','AVANZAR UN DÍA');await c.waitFor(`!!document.querySelector('.ng-system-bar__date')&&document.querySelector('.ng-system-bar__date').innerText!==${JSON.stringify(before)}`,{timeout:120000})}
async function save(name){await menu();await c.click('button','GUARDAR PARTIDA');await c.waitFor("document.body?.innerText.includes('Partida guardada.')",{timeout:60000});await c.click('button','Abrir menú de inicio BDM');const value=JSON.parse(readFileSync(savePath,'utf8'));writeFileSync(join(out,name+'.json'),JSON.stringify(value));return value}
async function step(name,fn){try{const detail=await fn();await c.screenshot(join(out,name+'.png'));steps.push({name,status:'PASS',detail});console.log('PASS '+country+' '+name)}catch(e){steps.push({name,status:'FAIL',error:String(e),text:await c.bodyText().catch(()=>'<closed>')});throw e}finally{writeFileSync(join(out,'acceptance.json'),JSON.stringify({profile,source,savePath,steps,consoleErrors:c?.consoleErrors??[]},null,2))}}
try{
 await launch()
 await step('load-certified-second-edition',async()=>{const loaded=await save('loaded');if(!same(loaded.payload,initial.payload))throw Error('Native load changed the certified state');await open('COMPETITION');await c.click('button,[role=tab]','=Clasificación');return {currentSeasonId:loaded.payload.currentSeasonId,previousChampion:loaded.payload.seasonHistoryBySeasonId[0].championTeamId,oldGames:loaded.payload.games.filter(g=>g.seasonId!==loaded.payload.currentSeasonId).length,newCompleted:loaded.payload.games.filter(g=>g.seasonId===loaded.payload.currentSeasonId&&g.status==='completed').length,date:loaded.payload.currentDate}})
 await step('advance-second-edition-and-save',async()=>{await day();checkpoint=await save('continued');return {date:checkpoint.payload.currentDate,clubs:checkpoint.payload.teams.length}})
 c.close();app.child.kill();await sleep(1800);await launch()
 await step('close-reopen-and-continue-second-edition',async()=>{const loaded=await save('reopened');if(!same(loaded.payload,checkpoint.payload))throw Error('Second native reload changed the world');await day();const after=await save('final');return {date:after.payload.currentDate,history:after.payload.seasonHistoryBySeasonId.length}})
}finally{c?.close();app?.child.kill();console.log(JSON.stringify({out,profile}))}
