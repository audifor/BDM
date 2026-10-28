// Controlled real viewer benchmark: every engine tick and the complete acta survive Simular final.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'
const label=process.env.BDM_LIVE_LABEL??'live-baseline',out=resolve('.worlddb-v2/v2-06',label)
const exe=resolve(process.env.BDM_LIVE_EXE??'artifacts/bdm-baseline.exe')
const initial=resolve('.worlddb-v2/v2-06/opening.json'),runs=[]
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const hash=p=>{const v=structuredClone(p);v.staffCareerRuntime.governanceDecisionEvents.sort((a,b)=>a.id.localeCompare(b.id));return createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}
mkdirSync(out,{recursive:true})
for(let rep=1;rep<=Number(process.env.BDM_LIVE_REPETITIONS??3);rep++){
  const profile=`v2-06-${label}-${Date.now()}-${rep}`,save=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot/saves/profiles',profile,'main.json')
  mkdirSync(dirname(save),{recursive:true});copyFileSync(initial,save)
  let app,c
  try{
    app=await launchApp(exe,9596,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,profile,'webview')});c=await connect(app.page.webSocketDebuggerUrl)
    await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE')
    await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:120000})
    await c.click('button','Abrir menú de inicio BDM');await c.click('button','=Partidos y competición');await c.click('button','=MATCH')
    await c.evaluate(`(()=>{const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=151617;crypto.getRandomValues=original;return array}return original(array)}})()`)
    await c.click('button','=JUGAR PARTIDO')
    await c.waitFor("!!document.querySelector('select[aria-label=\"Velocidad del partido\"]')",{timeout:3000}).catch(()=>{})
    if(!await c.locate('select[aria-label="Velocidad del partido"]')&&await c.locate('button:not([disabled])','=JUGAR PARTIDO')){await c.send('Page.bringToFront');await c.click('button','=JUGAR PARTIDO')}
    await c.waitFor("!!document.querySelector('select[aria-label=\"Velocidad del partido\"]')",{timeout:120000})
    if(!(await c.bodyText()).includes('151617'))throw Error('Viewer seed was not controlled')
    await c.click('button','=Pausar partido')
    const footer=await c.evaluate("document.querySelector('.ng-taskbar__status')?.innerText")
    await c.screenshot(join(out,`live-${rep}.png`))
    await c.evaluate(`(()=>{const m=window.__liveBenchmark={frames:[]};const frame=at=>{if(!m.end){m.frames.push(at);requestAnimationFrame(frame)}};requestAnimationFrame(frame);document.addEventListener('click',m.click=e=>{if(e.target.closest('button')?.innerText.trim().toUpperCase()==='SIMULAR FINAL')m.start=performance.now()},true);m.observer=new MutationObserver(()=>{if(m.start&&!m.ending&&[...document.querySelectorAll('button')].some(b=>b.innerText.trim().toUpperCase()==='CONTINUAR')){m.ending=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{m.end=performance.now()}))}});m.observer.observe(document.body,{subtree:true,childList:true,characterData:true})})()`)
    await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});await c.send('Profiler.start')
    await c.click('button','=Simular final');await c.waitFor('!!window.__liveBenchmark.end',{timeout:600000})
    const{profile:cpu}=await c.send('Profiler.stop');writeFileSync(join(out,`viewer-${rep}.cpuprofile`),JSON.stringify(cpu))
    const metrics=await c.evaluate("(()=>{const m=window.__liveBenchmark;m.observer.disconnect();document.removeEventListener('click',m.click,true);const frames=m.frames.filter(t=>t>=m.start&&t<=m.end);return{elapsedMs:m.end-m.start,maxFrameGapMs:Math.max(0,...frames.slice(1).map((t,i)=>t-frames[i])),frames:frames.length}})()")
    await c.screenshot(join(out,`final-${rep}.png`));await c.click('button','=Continuar')
    await c.click('button','Abrir menú de inicio BDM');await c.click('button','GUARDAR PARTIDA')
    await c.waitFor("document.body.innerText.includes('Partida guardada.')",{timeout:120000})
    const saved=readFileSync(save,'utf8'),p=JSON.parse(saved).payload,payloadSha256=hash(p)
    if(p.matchStatLogs.length!==1||p.teams.length!==70||p.competitions.length!==4)throw Error('Incomplete shared world')
    if(process.env.BDM_LIVE_REFERENCE&&payloadSha256!==JSON.parse(readFileSync(process.env.BDM_LIVE_REFERENCE,'utf8')).runs[0].payloadSha256)throw Error('Complete FULL result, acta or persistent state differs')
    if(runs.length&&payloadSha256!==runs[0].payloadSha256)throw Error('Viewer is not repeatable')
    writeFileSync(join(out,`world-${rep}.json`),saved);runs.push({rep,...metrics,payloadSha256,footer,consoleErrors:c.consoleErrors})
    writeFileSync(join(out,'benchmark.json'),JSON.stringify({label,exeSha256:createHash('sha256').update(readFileSync(exe)).digest('hex'),runs},null,2));console.log(JSON.stringify(runs.at(-1)))
  }catch(error){writeFileSync(join(out,`failure-${rep}.json`),JSON.stringify({error:String(error),body:await c?.bodyText().catch(()=>'<closed>')}));throw error}
  finally{c?.close();app?.child.kill();await sleep(1000)}
}
