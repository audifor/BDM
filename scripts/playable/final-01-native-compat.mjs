// Load previous real saves in isolated native QA profiles; never touch their originals.
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { launchApp, connect, sleep } from './cdp.mjs'
const out=resolve('.worlddb-v2/final-01/native-compat');mkdirSync(out,{recursive:true})
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
const truth=p=>{const x=structuredClone(p);x.staffCareerRuntime.governanceDecisionEvents.sort((a,b)=>a.id.localeCompare(b.id));return JSON.stringify(canonical(x))}
const results=[]
for(const [kind,input] of [['v206','C:/BasketballTycoonWorld/outputs/worlddb-v2-06/universe-certified-v4.json'],['counter','docs/playable/evidence/final-01/counter-fee-refused.save.json.gz']]){
  const profile='final01-compat-'+kind+'-'+Date.now(),folder=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot/saves/profiles',profile)
  mkdirSync(folder,{recursive:true});const savePath=join(folder,'main.json')
  const bytes=readFileSync(input),raw=input.endsWith('.gz')?gunzipSync(bytes):bytes;writeFileSync(savePath,raw)
  const before=JSON.parse(raw),app=await launchApp(resolve('artifacts/bdm.exe'),9600,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,profile)})
  const c=await connect(app.page.webSocketDebuggerUrl)
  try{
    await c.waitFor("[...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='CONTINUE')",{timeout:60000});await c.click('button','=CONTINUE')
    await c.waitFor("!!document.querySelector('.ng-system-bar__date')",{timeout:180000})
    if(kind==='counter'){
      await c.click('button','Abrir menú de inicio BDM');await c.click('button','=Mercado');await c.click('button','=MARKET');await sleep(1000);await c.click('button','=OPERACIONES')
      const correct=await c.evaluate(`(()=>{const row=[...document.querySelectorAll('article.market-transfers__entry')].find(e=>e.innerText.includes('Aaron Ganal')&&e.dataset.transferStatus==='IN_PROGRESS');return row?.innerText.includes('Margen disponible para compensaciones')&&row.innerText.includes('Finance no autoriza esta compensación')&&[...row.querySelectorAll('button')].find(b=>b.innerText==='Aceptar la compensación del club')?.disabled})()`)
      if(!correct)throw Error('Native counter fee viability is missing')
    }
    await c.screenshot(join(out,kind+'.png'));writeFileSync(join(out,kind+'-ui.txt'),await c.bodyText())
    const modified=statSync(savePath).mtimeMs
    await c.click('button','Abrir menú de inicio BDM');await c.click('button','=GUARDAR PARTIDA')
    for(let n=0;statSync(savePath).mtimeMs===modified&&n<600;n++)await sleep(200)
    const after=JSON.parse(readFileSync(savePath,'utf8'))
    if(truth(before.payload)!==truth(after.payload))throw Error('Save changed persistent state on native load: '+kind)
    results.push({kind,passed:true,profile,date:after.payload.currentDate,exactFullPayloadRoundTrip:true});console.log('PASS '+kind)
  }finally{c.close();app.child.kill();await sleep(1000)}
}
writeFileSync(join(out,'acceptance.json'),JSON.stringify({passed:true,results},null,2))
