// Actual Tauri/WebView2 workflow. Uses the repository's existing CDP UI harness.
// No synthetic world injection and no replacement of native Tauri commands.
import {createHash} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {connect,launchApp,sleep} from './cdp.mjs'

const exe=process.env.BDM_EXE??resolve('src-tauri/target/debug/bdm.exe')
const root=process.env.WORLDDB_SOURCE_ROOT??'C:/BDM_DB/WORLDDB_PBM'
const out=resolve('.worlddb-v2','windows-'+Date.now())
const profile='acceptance-'+Date.now()
const saveFor=p=>join(process.env.APPDATA,'com.bdm.worlddbv2.pilot','saves','profiles',p,'main.json')
const master=join(root,'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite')
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const canonical=v=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const masterBefore=sha(master),originalSave=join(process.env.APPDATA,'com.bdm.app','saves','main.json')
const originalBefore=existsSync(originalSave)?sha(originalSave):null
mkdirSync(out,{recursive:true})
const steps=[];let app,cdp,activeProfile=profile
const assert=(ok,message)=>{if(!ok)throw new Error(message)}
async function launch(p=profile){
  activeProfile=p;app=await launchApp(exe,9538,{BDM_SAVE_PROFILE:p});cdp=await connect(app.page.webSocketDebuggerUrl)
  await cdp.waitFor("document.body.innerText.includes('NEW GAME')",{timeout:60000})
}
async function close(){cdp?.close();app?.child.kill();await sleep(1800)}
const shot=name=>cdp.screenshot(join(out,name+'.png'))
async function field(label,value){
  await cdp.evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>(l.innerText||'').trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())}));if(!l)throw Error('Missing field '+${JSON.stringify(label)});const e=l.querySelector('input,select,textarea');e.scrollIntoView({block:'center'});const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await sleep(200)
}
async function open(label,group){
  await cdp.click('button','Abrir menú de inicio BDM')
  if(group)await cdp.click('button','='+group)
  await cdp.click('button','='+label);await sleep(800)
}
async function save(){
  await cdp.click('button','Abrir menú de inicio BDM')
  await cdp.click('button','GUARDAR PARTIDA')
  await cdp.waitFor("document.body.innerText.includes('Partida guardada.')",{timeout:60000})
  await cdp.click('button','Abrir menú de inicio BDM')
  return JSON.parse(readFileSync(saveFor(activeProfile),'utf8'))
}
async function newGame(team,day='2025-10-04'){
  await cdp.click('button','NEW GAME');await field('UNIVERSE','worldDbV2')
  await field('WORLDDB SOURCE FOLDER',root)
  await cdp.waitFor("document.querySelectorAll('select')[2]?.options.length>10 || [...document.querySelectorAll('select')].some(s=>[...s.options].some(o=>o.value==='pbm:DYN_equipe:41'))",{timeout:60000,label:'V2 source and 18 real clubs'})
  await field('START DATE',day);await field('WORLD SEED','bdm-ui-v2-pilot')
  await field('TEAM',team);await field('COACH FIRST NAME','Lucia');await field('COACH LAST NAME','WorldDB')
  await field('NATIONALITY','ESP');await field('GENDER','female');await shot('new-game-'+team.split(':').at(-1))
  await cdp.click('button','START CAREER')
  await cdp.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:120000,label:'Courtside main screen'})
}
async function step(name,run){
  const started=Date.now()
  try{const detail=await run();steps.push({name,status:'PASS',ms:Date.now()-started,detail});console.log('PASS '+name)}catch(e){steps.push({name,status:'FAIL',error:String(e)});await shot('FAIL').catch(()=>{});throw e}
}
try{
  await step('Open native BDM, select V2/date/competition/club, enter Courtside',async()=>{await launch();await newGame('pbm:DYN_equipe:41');const body=await cdp.bodyText();assert(body.toUpperCase().includes('CASADEMONT ZARAGOZA'),'PBM club not visible');await shot('home');return body.slice(0,1200)})
  await step('Original PBM roster and attributes in existing player application',async()=>{await open('ROSTER');await shot('roster');const body=await cdp.bodyText();assert(/Rodrig|Slaughter|Dubljev|Yusta|Spissu|Bango|Wright/i.test(body),'PBM players not visible');await cdp.click('button,a','Joaquin Rodriguez');await sleep(700);await cdp.click('button,[role=tab]','=ATTRIBUTES');await shot('player-attributes');return (await cdp.bodyText()).slice(0,2000)})
  await step('Existing competition and schedule applications',async()=>{await open('COMPETITION','Partidos y competición');await shot('competition-before');const text=await cdp.bodyText();assert(text.includes('Liga Endesa'),'Competition missing');await open('SCHEDULE','Partidos y competici\u00f3n');await shot('schedule');return text.slice(0,1200)})
  await step('Real MatchViewer and MatchEngine, final score and statistics',async()=>{
    await cdp.click('button','=MATCH');await cdp.click('button','JUGAR PARTIDO')
    await cdp.waitFor("!!document.querySelector('[data-ng-region=\"match-live\"]')",{timeout:60000})
    await shot('match-live');await cdp.click('button','Simular final',{timeout:30000})
    await cdp.waitFor("[...document.querySelectorAll('button')].some(b=>b.innerText.trim().toLowerCase()==='continuar')",{timeout:300000,label:'real final whistle'})
    await shot('match-final');await cdp.click('button','=Continuar')
    await cdp.waitFor("!!document.querySelector('[aria-label=\"Acta del partido\"]')",{timeout:30000})
    await shot('match-report');return (await cdp.bodyText()).slice(-2500)
  })
  let checkpoint
  await step('Updated standings, calendar and native Save V4',async()=>{
    await open('COMPETITION','Partidos y competición');await cdp.click('button,[role=tab]','=Clasificación');await shot('competition-after')
    const standing=await cdp.evaluate(`(()=>{const root=document.querySelector('.competition-standings');const leaf=[...root.querySelectorAll('button,a,span,div')].find(e=>e.children.length===0&&e.textContent.trim()==='Casademont Zaragoza');let row=leaf;for(let i=0;row&&i<8;i++,row=row.parentElement){const text=row.innerText.replace(/\\s+/g,' ').trim();if(/^\\d+/.test(text)&&text.includes('Casademont Zaragoza '))return text.slice(text.indexOf('Casademont Zaragoza')+'Casademont Zaragoza'.length).trim().split(' ')}return null})()`)
    assert(standing?.[0]==='1','Visible standings must record the completed user game')
    checkpoint=await save();assert(checkpoint.schemaVersion===4,'Not Save V4')
    assert(checkpoint.payload.worldDbCompetitionRuntime.worldDbV2.masterSha256===masterBefore,'Source pin missing')
    const games=Object.values(checkpoint.payload.games);const completed=games.filter(g=>g.status==='completed')
    assert(completed.length>=1,'No completed native game')
    copyFileSync(saveFor(profile),join(out,'partida-a.json'));return {completed:completed.map(g=>({id:g.id,result:g.result})),date:checkpoint.payload.currentDate,visibleStanding:standing}
  })
  await step('Advance next day using Courtside CONTINUE',async()=>{
    await open('MATCH','Partidos y competición');await cdp.click('button','AVANZAR UN DÍA')
    await cdp.waitFor("document.body.innerText.includes('05 OCT 2025')",{timeout:120000,label:'exactly next calendar day'})
    const after=await save();assert(after.payload.currentDate>checkpoint.payload.currentDate,'Calendar did not advance')
    checkpoint=after;copyFileSync(saveFor(profile),join(out,'partida-a.json'));await shot('next-day');return after.payload.currentDate
  })
  await step('Close BDM, reopen, load native save, continue exactly',async()=>{
    const savedHash=sha(saveFor(profile));await close();await launch();await cdp.click('button','=CONTINUE')
    await cdp.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:60000})
    await shot('reopened');assert(sha(saveFor(profile))===savedHash,'Loading modified the native file')
    const reloaded=await save();assert(JSON.stringify(canonical(reloaded.payload))===JSON.stringify(canonical(checkpoint.payload)),'Native payload changed on reload')
    await open('MATCH','Partidos y competición');await cdp.click('button','AVANZAR UN DÍA')
    await cdp.waitFor("document.body.innerText.includes('06 OCT 2025')",{timeout:120000,label:'continued calendar after reload'})
    const next=await save();assert(next.payload.currentDate>checkpoint.payload.currentDate,'Reloaded career cannot continue')
    copyFileSync(saveFor(profile),join(out,'partida-a.json'));return next.payload.currentDate
  })
  await step('Independent second native career, no source or first-save changes',async()=>{
    const firstHash=sha(saveFor(profile));await close();await launch(profile+'-b');await newGame('pbm:DYN_equipe:50','2032-07-01');const second=await save()
    assert(second.payload.currentDate==='2032-07-01','Selected fictional future date was not applied')
    assert(second.payload.worldDbCompetitionRuntime.worldDbV2.masterSha256===masterBefore,'Second source mismatch')
    assert(sha(saveFor(profile))===firstHash,'Second career modified first native save')
    assert(sha(master)===masterBefore,'V2 changed')
    assert((existsSync(originalSave)?sha(originalSave):null)===originalBefore,'Previous BDM save changed')
    copyFileSync(saveFor(profile+'-b'),join(out,'partida-b.json'));return {firstSave:saveFor(profile),secondSave:saveFor(profile+'-b')}
  })
}catch(e){console.error(e);process.exitCode=1}
finally{
  await close().catch(()=>{})
  writeFileSync(join(out,'acceptance.json'),JSON.stringify({passed:steps.every(s=>s.status==='PASS'),steps,exe,masterSha256Before:masterBefore,masterSha256After:sha(master),originalSaveSha256Before:originalBefore,originalSaveSha256After:existsSync(originalSave)?sha(originalSave):null,consoleErrors:cdp?.consoleErrors??[]},null,2))
  console.log('Evidence: '+out)
}
