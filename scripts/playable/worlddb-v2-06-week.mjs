// Controlled six-day native advance from the same certified Sunday; no sports work is skipped.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'
const label=process.env.BDM_WEEK_LABEL??'week-baseline',out=resolve('.worlddb-v2/v2-06',label)
const exe=resolve(process.env.BDM_WEEK_EXE??'artifacts/bdm-baseline.exe')
const initial=resolve('.worlddb-v2/v2-06/baseline-profiled-8/world-1.json')
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const hash=p=>{const v=structuredClone(p);v.staffCareerRuntime.governanceDecisionEvents.sort((a,b)=>a.id.localeCompare(b.id));return createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}
mkdirSync(out,{recursive:true});const runs=[]
for(let rep=1;rep<=Number(process.env.BDM_WEEK_REPETITIONS??3);rep++){
  const profile=`v2-06-${label}-${Date.now()}-${rep}`,save=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot/saves/profiles',profile,'main.json')
  mkdirSync(dirname(save),{recursive:true});copyFileSync(initial,save)
  let app,c
  try{
    app=await launchApp(exe,9586,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,profile,'webview')});c=await connect(app.page.webSocketDebuggerUrl)
    await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:120000})
    await c.click('button','Abrir menú de inicio BDM');await c.click('button','=Partidos y competición');await c.click('button','=MATCH')
    const days=[]
    for(let day=0;day<6;day++){
      await sleep(400)
      await c.evaluate(`(()=>{const m=window.__week={};const date=document.querySelector('.ng-system-bar__date').innerText;document.addEventListener('click',m.click=e=>{if(e.target.closest('button')?.innerText.trim().toUpperCase()==='AVANZAR UN DÍA')m.start=performance.now()},true);m.observer=new MutationObserver(()=>{if(!m.end&&document.querySelector('.ng-system-bar__date').innerText!==date)requestAnimationFrame(()=>requestAnimationFrame(()=>{m.end=performance.now()}))});m.observer.observe(document.body,{subtree:true,childList:true,characterData:true})})()`)
      await c.click('button','AVANZAR UN DÍA');await c.waitFor('!!window.__week.end',{timeout:120000})
      days.push(await c.evaluate("(()=>{const m=window.__week;m.observer.disconnect();document.removeEventListener('click',m.click,true);return{date:document.querySelector('.ng-system-bar__date').innerText,elapsedMs:m.end-m.start}})()"))
    }
    await c.click('button','Abrir menú de inicio BDM');await c.click('button','GUARDAR PARTIDA');await c.waitFor("document.body.innerText.includes('Partida guardada.')",{timeout:120000})
    const text=readFileSync(save,'utf8'),p=JSON.parse(text).payload,payloadSha256=hash(p)
    if(p.currentDate!=='2025-10-11'||p.matchStatLogs.length!==35)throw Error('Incorrect week')
    if(process.env.BDM_WEEK_REFERENCE&&payloadSha256!==JSON.parse(readFileSync(process.env.BDM_WEEK_REFERENCE,'utf8')).runs[0].payloadSha256)throw Error('Complete persistent week differs')
    if(runs.length&&payloadSha256!==runs[0].payloadSha256)throw Error('Week is not repeatable')
    writeFileSync(join(out,`world-${rep}.json`),text);await c.screenshot(join(out,`week-${rep}.png`))
    runs.push({rep,days,totalMs:days.reduce((sum,d)=>sum+d.elapsedMs,0),payloadSha256});writeFileSync(join(out,'benchmark.json'),JSON.stringify({label,exeSha256:createHash('sha256').update(readFileSync(exe)).digest('hex'),runs},null,2));console.log(JSON.stringify(runs.at(-1)))
  }catch(error){writeFileSync(join(out,'failure.json'),JSON.stringify({error:String(error),body:await c?.bodyText().catch(()=>'<closed>')}));throw error}
  finally{c?.close();app?.child.kill();await sleep(1000)}
}
