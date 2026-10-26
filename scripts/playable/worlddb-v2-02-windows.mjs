// Real Tauri acceptance. All gameplay actions use rendered Courtside controls.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {connect,launchApp,sleep} from './cdp.mjs'
const resume=process.env.BDM_NATIVE_PROFILE
const out=resolve('.worlddb-v2','native-market-02-'+Date.now()),profile=resume??'qa-market-02-'+Date.now()
mkdirSync(out,{recursive:true})
const exe=resolve('artifacts/bdm.exe'),savePath=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot','saves','profiles',profile,'main.json')
const original=join(process.env.APPDATA,'com.bdm.app','saves','main.json')
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const canonical=v=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
// This Save V4 transport array represents governanceDecisionEventsById (a map).
// Its insertion order may normalize on load; compare every full record by ID.
const worldTruth=value=>{const copy=structuredClone(value);copy.staffCareerRuntime.governanceDecisionEvents.sort((a,b)=>a.id.localeCompare(b.id));return copy}
const originalHash=existsSync(original)?sha(original):null
let app,c;const steps=[]
const assert=(ok,message)=>{if(!ok)throw Error(message)}
async function field(label,value){
  await c.evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>(l.innerText||'').trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())}));if(!l)throw Error('Missing field '+${JSON.stringify(label)});const e=l.querySelector('input,select,textarea');const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(150)
}
async function open(name,group){await c.click('button','Abrir menú de inicio BDM');if(group)await c.click('button','='+group);await c.click('button','='+name);await sleep(800)}
async function day(){const before=await c.evaluate("document.querySelector('.ng-system-bar__date').innerText");await open('MATCH','Partidos y competición');await c.click('button','AVANZAR UN DÍA');await c.waitFor(`document.querySelector('.ng-system-bar__date')?.innerText!==${JSON.stringify(before)}`,{timeout:120000});await sleep(200)}
async function operations(name){await open('MARKET','Mercado');await c.click('button','=Operaciones');await sleep(200);if(name&&!await c.evaluate(`[...document.querySelectorAll('summary')].find(e=>e.innerText.includes(${JSON.stringify(name)}))?.parentElement.open===true`))await c.click('summary',name);await sleep(150)}
async function search(name){await open('MARKET','Mercado');await c.click('button','=Buscar jugadores');await field('Buscar',name);await c.click('.market-talent__player',name)}
async function simulateUserMatch(){
  await c.click('button.mp-action','=Simulación rápida')
  try{await c.waitFor("document.body?.innerText.includes('Simulando el partido') || !!document.querySelector('[aria-label=\"Acta del partido\"]')",{timeout:5000})}
  catch(error){
    // WebView2 may consume the first click while the newly opened panel takes focus.
    // Retry only after observing that the same enabled prematch control is still present.
    if(!await c.evaluate("[...document.querySelectorAll('button.mp-action')].some(e=>e.textContent==='Simulación rápida'&&!e.disabled)"))throw error
    await c.click('button.mp-action','=Simulación rápida')
  }
  await c.waitFor("!!document.querySelector('[aria-label=\"Acta del partido\"]')",{timeout:300000})
}
async function save(name){await c.click('button','Abrir menú de inicio BDM');await c.click('button','GUARDAR PARTIDA');await c.waitFor("document.body?.innerText.includes('Partida guardada.')",{timeout:60000});await c.click('button','Abrir menú de inicio BDM');const s=JSON.parse(readFileSync(savePath,'utf8'));writeFileSync(join(out,name+'.json'),JSON.stringify(s));return s}
async function step(name,run){const t=Date.now();try{const detail=await run();await c.screenshot(join(out,name+'.png'));steps.push({name,status:'PASS',ms:Date.now()-t,detail});console.log('PASS '+name)}catch(e){steps.push({name,status:'FAIL',error:String(e),text:await c.bodyText().catch(()=>'<closed>')});await c.screenshot(join(out,'failure.png')).catch(()=>{});throw e}finally{writeFileSync(join(out,'acceptance.json'),JSON.stringify({profile,savePath,steps,consoleErrors:c?.consoleErrors??[]},null,2))}}
try{
  app=await launchApp(exe,9544,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,'webview'),BDM_NATIVE_DIAGNOSTICS:'1'});app.child.on('exit',(code,signal)=>console.log('NATIVE EXIT',code,signal));c=await connect(app.page.webSocketDebuggerUrl)
  if(!resume){await step('new-game',async()=>{
    await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=NEW GAME');await field('UNIVERSE','worldDbV2');await field('WORLDDB SOURCE FOLDER',process.env.WORLDDB_SOURCE_ROOT??'C:/BDM_DB/WORLDDB_PBM');await c.waitFor("[...document.querySelectorAll('select')].some(s=>[...s.options].some(o=>o.value==='pbm:DYN_equipe:41'))",{timeout:60000});await field('START DATE','2025-07-01');await field('WORLD SEED','worlddb-v2-market-02');await field('TEAM','pbm:DYN_equipe:41');await field('COACH FIRST NAME','Lucia');await field('COACH LAST NAME','Certificacion');await field('NATIONALITY','ESP');await c.click('button','START CAREER');await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:120000});return (await c.bodyText()).slice(0,250)
  })
  await step('contact-original-free-agent',async()=>{await search('Serge Konan');await c.click('button','Contactar agente libre');await c.click('section[aria-label="Contacto con agente libre"] button','=Contact player');await c.click('summary','Serge Konan');assert((await c.bodyText()).includes('CONTACTED'),'Contact not created');return (await c.bodyText()).slice(-1600)})
  await step('custom-offer',async()=>{await day();await operations('Serge Konan');await field('Salario anual',110000);await field('Años de contrato',1);await field('Rol prometido','ROTATION');await c.click('form.market-custom-offer button[type=submit]');return (await c.bodyText()).slice(-1700)})
  await step('signing-governance',async()=>{await day();await operations('Serge Konan');await c.click('button','Start signing approval');await day();await operations('Serge Konan');await c.click('button','Complete signing');const s=await save('signed');const contract=s.payload.contracts.find(c=>c.playerId==='pbm:DYN_joueur:100027992');assert(contract,'No canonical signed contract');assert(s.payload.teams.find(t=>t.id==='pbm:DYN_equipe:41').rosterPlayerIds.includes(contract.playerId),'Signing absent from roster');return {contract,financeTransactions:s.payload.financialTransactions.length}})
  }else{
    await step('reopen-native-signing',async()=>{const before=JSON.parse(readFileSync(savePath,'utf8'));await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE');await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:60000});const loaded=await save('reopened');assert(equal(loaded.payload.contracts,before.payload.contracts),'Contracts changed on reopen');assert(equal(loaded.payload.financialTransactions,before.payload.financialTransactions),'Financial ledger changed on reopen');return {date:loaded.payload.currentDate,contracts:loaded.payload.contracts.length}})
  }
  if(resume){
    if(!JSON.parse(readFileSync(savePath,'utf8')).payload.contracts.some(c=>c.playerId==='pbm:DYN_joueur:100027992'&&c.predecessorContractId))await step('renew-original-signing',async()=>{
      await open('CONTRACTS','Gestión del club');await c.click('button','=Negotiations');await c.click('article[aria-label="Serge Konan retention"] button','=Open negotiation');await field('Annual salary',110000);await field('Years',2);await c.click('article[aria-label="Serge Konan retention"] button','=Submit offer');await c.click('article[aria-label="Serge Konan retention"] button','Request signing approval');await day();const s=await save('renewed');const predecessor=s.payload.contracts.find(c=>c.playerId==='pbm:DYN_joueur:100027992'&&!c.predecessorContractId);const successor=s.payload.contracts.find(c=>c.predecessorContractId===predecessor.id);assert(successor,'No signed successor');assert(successor.term.startsOn===predecessor.term.expiresOn,'Renewal overlaps');return {predecessor,successor}
    })
    if(!JSON.parse(readFileSync(savePath,'utf8')).payload.playerTransactions.some(t=>t.kind==='released'))await step('release-original-player',async()=>{
      const before=JSON.parse(readFileSync(savePath,'utf8')),team=before.payload.teams.find(t=>t.id==='pbm:DYN_equipe:41'),id=team.rosterPlayerIds.find(id=>id!=='pbm:DYN_joueur:100027992');await open('CONTRACTS','Gestión del club');await c.click('button','=Release / risk');await field('Player',id);const confirm=setTimeout(()=>{void c.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{})},700);await c.click('button','=Execute release');clearTimeout(confirm);const s=await save('released');assert(!s.payload.teams.find(t=>t.id===team.id).rosterPlayerIds.includes(id),'Release did not change roster');assert(s.payload.contracts.some(c=>c.playerId===id&&c.termination?.reason==='released'),'Release not recorded');return {playerId:id}
    })
    if(!JSON.parse(readFileSync(savePath,'utf8')).payload.playerTransferNegotiations.some(t=>t.status==='EXECUTED'))await step('negotiate-club-transfer',async()=>{
      await search('Sander Hollanders');await field('Compensación que propones al club',100000);await c.click('button','Contactar con el club y proponer');await day();await operations('Sander Hollanders');await field('Salario anual',105000);await field('Años de contrato',2);await c.click('button','Presentar oferta al jugador');await day();await operations('Sander Hollanders');await c.click('button','Solicitar autorización');await day();await operations('Sander Hollanders');await c.click('button','Completar traspaso');const s=await save('transferred');const t=s.payload.playerTransferNegotiations.find(t=>t.playerId==='pbm:DYN_joueur:100006654');assert(t?.status==='EXECUTED','Transfer not canonical');assert(!s.payload.teams.find(team=>team.id===t.sellerTeamId).rosterPlayerIds.includes(t.playerId),'Seller retained player');assert(s.payload.teams.find(team=>team.id===t.buyerTeamId).rosterPlayerIds.includes(t.playerId),'Buyer missing player');return t
    })
    if(process.env.BDM_NATIVE_STAGE==='play'){
      await step('advance-managed-career-to-first-game',async()=>{
        for(let days=0;days<110;days++){
          const date=await c.evaluate("document.querySelector('.ng-system-bar__date').innerText")
          if(date==='04 OCT 2025'){await save('prematch');return {date,days}}
          await day();if(days%7===0)console.log('NATIVE DAY',await c.evaluate("document.querySelector('.ng-system-bar__date').innerText"))
        }
        throw Error('First game not reached')
      })
      await step('signed-original-in-native-lineup-and-match-engine',async()=>{
        await open('TACTICS','Equipo');await c.click('button','=ANALIZAR');await c.evaluate(`(()=>{const e=document.querySelector('select[aria-label="Jugador del laboratorio"]');if(!e)throw Error('Missing canonical lineup control');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'pbm:DYN_joueur:100027992');e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
        await c.screenshot(join(out,'signed-player-lineup.png'));await open('MATCH','Partidos y competición');await simulateUserMatch();const s=await save('played');const log=s.payload.matchStatLogs.find(l=>l.playerLines.some(p=>p.playerId==='pbm:DYN_joueur:100027992'&&p.stats.secondsPlayed>0));assert(log,'Signed PBM player did not play');return {gameId:log.gameId,line:log.playerLines.find(p=>p.playerId==='pbm:DYN_joueur:100027992')}
      })
    }
    if(['play','continue'].includes(process.env.BDM_NATIVE_STAGE))await step('close-reopen-managed-career-and-continue',async()=>{
        const before=JSON.parse(readFileSync(savePath,'utf8'));c.close();app.child.kill();await sleep(1800);app=await launchApp(exe,9544,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,'webview')});c=await connect(app.page.webSocketDebuggerUrl);await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE');await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:60000});const loaded=await save('played-reopened');assert(equal(worldTruth(loaded.payload),worldTruth(before.payload)),'Native world changed on reopen');await day();const after=await save('continued');assert(after.payload.currentDate==='2025-10-05','Did not continue after native load');return {date:after.payload.currentDate,contracts:after.payload.contracts.length,completed:after.payload.games.filter(g=>g.status==='completed').length}
      })
  }
}finally{
  if(c){writeFileSync(join(out,'final-ui.txt'),await c.bodyText().catch(()=>'<closed>'));c.close()}
  app?.child.kill()
  assert(!originalHash||sha(original)===originalHash,'Original save changed')
  console.log(JSON.stringify({out,profile,passed:steps.every(s=>s.status==='PASS')}))
}
