// The valid assistant appointment and delegation are also exercised through real Courtside controls.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { connect, launchApp, sleep } from './cdp.mjs'
const out=resolve('.worlddb-v2/v2-06','staff-windows-'+Date.now()),profile='v2-06-staff-'+Date.now()
const path=join(process.env.APPDATA,'com.bdm.worlddbv2.pilot/saves/profiles',profile,'main.json')
const initial=JSON.parse(readFileSync('.worlddb-v2/v2-06/baseline-profiled-8/world-1.json','utf8'))
mkdirSync(out,{recursive:true});mkdirSync(dirname(path),{recursive:true})
copyFileSync('.worlddb-v2/v2-06/baseline-profiled-8/world-1.json',path)
let app,c
const assert=(v,m)=>{if(!v)throw Error(m)}
async function save(name){
 await c.send('Page.bringToFront');await c.click('button','Abrir menú de inicio BDM');await c.click('button','GUARDAR PARTIDA')
 await c.waitFor("document.body.innerText.includes('Partida guardada.')",{timeout:3000}).catch(()=>{})
 if(!await c.evaluate("document.body.innerText.includes('Partida guardada.')")&&(await c.locate('button','GUARDAR PARTIDA'))?.disabled===false)await c.click('button','GUARDAR PARTIDA')
 await c.waitFor("document.body.innerText.includes('Partida guardada.')",{timeout:120000})
 await c.click('button','Abrir menú de inicio BDM')
 const saved=JSON.parse(readFileSync(path,'utf8'));writeFileSync(join(out,name+'.json'),JSON.stringify(saved));return saved
}
try{
 app=await launchApp(resolve('artifacts/bdm.exe'),9606,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,'webview')});c=await connect(app.page.webSocketDebuggerUrl)
 await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=CONTINUE')
 await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:120000})
 await c.click('button','Abrir menú de inicio BDM');await c.click('button','=Equipo');await c.click('button','=STAFF')
 await c.click('button,[role=tab]','=CONSTRUYE TU STAFF');await c.click('button','ABRIR VACANTE')
 await c.setValue('input[aria-label="Buscar candidato de staff"]','Jesus Ramirez')
 assert(await c.evaluate("document.querySelectorAll('.cs-staff-candidate').length===1"),'Expected the one existing original candidate')
 for(const action of ['IDENTIFICAR','ENTREVISTAR','COMPLETAR ENTREVISTA','PREPARAR OFERTA','CONFIRMAR CONTRATO']){
  await c.click('.cs-staff-candidate button','='+action)
  const error=await c.evaluate("document.querySelector('.cs-staff-message.is-error')?.innerText")
  assert(!error,error)
 }
 await c.waitFor("document.body.innerText.toLowerCase().includes('contratación registrada')",{timeout:10000});await c.screenshot(join(out,'hired.png'))
 const hired=await save('hired'),staffId='pbm:DYN_person:58609'
 assert(hired.payload.staffCareerRuntime.staffEmployment.find(s=>s.staffId===staffId)?.employment.roleId==='assistantCoach','No canonical assistant appointment')
 assert(hired.payload.persons.length===initial.payload.persons.length&&hired.payload.staffPeople.length===initial.payload.staffPeople.length,'Hiring duplicated a person or profile')
 await c.click('button,[role=tab]','=ASIGNACIONES');await c.click('button','=MODO SENCILLO')
 const target=await c.evaluate(`(()=>{const rows=[...document.querySelectorAll('.cs-staff-simple-assignment__row')].filter(e=>/training/i.test(e.innerText)&&/plan/i.test(e.innerText));if(rows.length!==1)throw Error('Expected one training-plan responsibility');const b=rows[0].querySelector('button');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`)
 for(const[type,extra]of[['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],['mouseReleased',{button:'left',clickCount:1}]])await c.send('Input.dispatchMouseEvent',{type,...target,...extra})
 await c.click('button.sa-candidate','Jesus Ramirez');await sleep(300);await c.screenshot(join(out,'delegated.png'))
 const delegated=await save('delegated'),responsibility=delegated.payload.responsibilities.find(r=>r.teamId==='pbm:DYN_equipe:41'&&r.kind==='createTeamTrainingPlan')
 assert(responsibility?.mode==='delegated'&&responsibility.holderStaffId===staffId,'The UI did not delegate the canonical responsibility')
 writeFileSync(join(out,'acceptance.json'),JSON.stringify({passed:true,profile,date:delegated.payload.currentDate,staffId,personCountUnchanged:true,responsibility,consoleErrors:c.consoleErrors},null,2));console.log(JSON.stringify({passed:true,out,staffId}))
}catch(error){writeFileSync(join(out,'failure.json'),JSON.stringify({error:String(error),text:await c?.bodyText().catch(()=>'<closed>')},null,2));await c?.screenshot(join(out,'failure.png')).catch(()=>{});throw error}
finally{c?.close();app?.child.kill()}
