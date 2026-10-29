// Real Tauri/WebView2 input and native saves. No injected world state or simulated commands.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { launchApp, connect, sleep } from './cdp.mjs'
import { resolveNativeMedical, resolveNativePress } from './worlddb-v2-native-decisions.mjs'
const base = resolve('.worlddb-v2/final-01'), manifest = join(base, 'windows-current.json')
let context, app, c
const assert = (value, message) => { if (!value) throw Error(message) }
async function field(label, value) {
  await c.evaluate(`(()=>{const label=[...document.querySelectorAll('label')].filter(e=>e.getBoundingClientRect().width>0).find(e=>e.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())}));if(!label)throw Error('Field missing');const e=label.querySelector('input,select,textarea');const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await sleep(150)
}
async function open(name, group) {
  await c.send('Page.bringToFront');await sleep(400)
  if(!await c.locate('button','=GUARDAR PARTIDA'))await c.click('button', 'Abrir menú de inicio BDM')
  await c.click('button', '='+group); await c.click('button', '='+name); await sleep(1000)
}
async function save(name) {
  const modified=existsSync(context.savePath)?statSync(context.savePath).mtimeMs:0
  if(!await c.locate('button','=GUARDAR PARTIDA'))await c.click('button', 'Abrir menú de inicio BDM')
  await c.click('button', 'GUARDAR PARTIDA')
  await c.waitFor("document.body.innerText.includes('Partida guardada.')", { timeout: 120000 })
  for(let wait=0;(!existsSync(context.savePath)||statSync(context.savePath).mtimeMs===modified)&&wait<600;wait++)await sleep(200)
  assert(existsSync(context.savePath)&&statSync(context.savePath).mtimeMs!==modified,'Native save was not written')
  if(await c.locate('button','=GUARDAR PARTIDA'))await c.click('button', 'Abrir menú de inicio BDM')
  const data = JSON.parse(readFileSync(context.savePath, 'utf8'))
  writeFileSync(join(context.out, name+'.json'), JSON.stringify(data)); return data
}
async function clickRow(selector, text, button) {
  const point = await c.evaluate(`(()=>{const row=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.innerText.includes(${JSON.stringify(text)}));const b=row&&[...row.querySelectorAll('button')].find(b=>b.innerText.includes(${JSON.stringify(button)}));if(!b)throw Error('Row action missing');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  for (const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],['mouseReleased',{button:'left',clickCount:1}]]) await c.send('Input.dispatchMouseEvent',{type,...point,...extra})
  await sleep(200)
}
async function openOperation(name) {
  await open('MARKET','Mercado');await c.click('button','=OPERACIONES')
  const isOpen=await c.evaluate(`(()=>{const row=[...document.querySelectorAll('article.market-negotiations__entry')].find(e=>e.innerText.includes(${JSON.stringify(name)}));if(!row)throw Error('Operation missing');return row.querySelector('details').open})()`)
  if(!isOpen)await c.click('summary',name)
}
async function advanceDay() {
  for(let attempt=0;attempt<4;attempt++){
    await open('MATCH','Partidos y competición')
    if(await c.locate('button:not([disabled])','=JUGAR PARTIDO')){
      await c.click('button','=SIMULACIÓN RÁPIDA');await c.waitFor("!document.querySelector('button.mp-action:disabled') || !!document.querySelector('p.mp-alert[role=alert]')",{timeout:180000})
      await save('before-day-after-user-match')
    }
    const date=await c.evaluate("document.querySelector('.ng-system-bar__date').innerText")
    await c.click('button','=AVANZAR UN DÍA')
    await c.waitFor(`document.querySelector('.ng-system-bar__date').innerText!==${JSON.stringify(date)} || !!document.querySelector('p.mp-alert[role=alert]')`,{timeout:180000})
    const error=await c.evaluate("document.querySelector('p.mp-alert[role=alert]')?.innerText")
    if(!error)return save('advance-'+Date.now())
    if(/medic|return|alta/i.test(error))await resolveNativeMedical(c,open,context.out)
    else if(/media|press|prensa/i.test(error))await resolveNativePress(c,open,context.out)
    else throw Error(error)
  }
  throw Error('Required decisions did not resolve')
}
const steps = []
async function step(name, action) {
  try { const result=await action(); await c.screenshot(join(context.out,name+'.png')); steps.push({name,status:'PASS',result}); console.log('PASS '+name) }
  catch(error) { steps.push({name,status:'FAIL',error:String(error),body:await c.bodyText().catch(()=>'<closed>')}); await c.screenshot(join(context.out,name+'-failed.png')).catch(()=>{}); throw error }
  finally { writeFileSync(join(context.out,'functional-'+(process.env.BDM_FINAL01_PHASE??'initial')+'.json'),JSON.stringify({steps,consoleErrors:c.consoleErrors},null,2)) }
}
try {
  if (process.env.BDM_FINAL01_ATTACH === '1') {
    context=JSON.parse(readFileSync(manifest,'utf8'))
    const pages=await (await fetch(`http://127.0.0.1:${context.port}/json`)).json()
    c=await connect(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
  } else {
    const stamp=Date.now(),profile='final01-windows-'+stamp,out=join(base,'windows-'+stamp)
    mkdirSync(out,{recursive:true});context={profile,out,port:9596,savePath:join(process.env.APPDATA,'com.bdm.worlddbv2.pilot/saves/profiles',profile,'main.json')}
    app=await launchApp(resolve('artifacts/bdm.exe'),context.port,{BDM_SAVE_PROFILE:profile,WEBVIEW2_USER_DATA_FOLDER:join(out,'webview')});c=await connect(app.page.webSocketDebuggerUrl)
    await c.waitFor("document.body?.innerText.includes('NEW GAME')",{timeout:60000});await c.click('button','=NEW GAME')
    await field('UNIVERSE','worldDbV2');await field('WORLDDB SOURCE FOLDER','C:/BDM_DB/WORLDDB_PBM')
    await c.waitFor("[...document.querySelectorAll('select option')].some(o=>o.value==='pbm:DYN_equipe:41')",{timeout:60000})
    await field('TEAM','pbm:DYN_equipe:41');await field('START DATE','2025-10-04');await field('WORLD SEED','bdm-final-01');await field('COACH FIRST NAME','Final');await field('COACH LAST NAME','Windows');await c.click('button','START CAREER')
    writeFileSync(manifest,JSON.stringify(context))
  }
  await c.waitFor("!!document.querySelector('[aria-label=\"Abrir menú de inicio BDM\"]')",{timeout:180000})
  if ((process.env.BDM_FINAL01_PHASE??'initial')==='initial') {
    const initial=await save('01-new-career'),teamId='pbm:DYN_equipe:41'
    await step('01-new-career',async()=>{
      assert(initial.payload.teams.length===70&&initial.payload.competitions.length===4,'Incomplete universe')
      assert(new Set(initial.payload.expenseRecognitions.map(e=>e.organizationId)).size===70,'Initial payroll date skipped a club')
      assert(initial.payload.staffPeople.length>200,'Original supporting staff missing')
      return {clubs:70,competitions:4,staff:initial.payload.staffPeople.length,initialExpenses:initial.payload.expenseRecognitions.length}
    })
    await step('02-roster-rotations',async()=>{
      await open('ROSTER','Equipo');await c.screenshot(join(context.out,'roster.png'))
      await open('TACTICS','Equipo');await c.click('button,[role=tab]','=ROTACIONES')
      for(let n=0;n<12&&await c.locate('button[aria-label^="Convocar "]:not([disabled])');n++)await c.click('button[aria-label^="Convocar "]:not([disabled])')
      await c.click('button','=Profunda');await c.click('button','=GUARDAR ROTACIÓN')
      const saved=await save('02-roster-rotations');return {lineup:saved.payload.lineups.find(l=>l.teamId===teamId)}
    })
    await step('03-training',async()=>{
      await open('TRAINING','Equipo')
      const previous=JSON.parse(readFileSync(context.savePath,'utf8')).payload
      if(!previous.scheduledTrainingSessions.some(s=>s.teamId===teamId&&s.date==='2025-10-05')){await field('Ejercicio','activeRecovery');await field('Intensidad','light');await field('Fecha','2025-10-05');await c.click('button','=PROGRAMAR')}
      const saved=await save('03-training');assert(saved.payload.scheduledTrainingSessions.some(s=>s.teamId===teamId&&s.date==='2025-10-05'),'Training action did not persist')
      return {scheduled:saved.payload.scheduledTrainingSessions.filter(s=>s.teamId===teamId)}
    })
    const hired=[]
    for(const [department,roleId] of [['coaching','assistantCoach'],['medical','physiotherapist'],['performance','strengthConditioningCoach'],['scouting','regionalScout']]){
      await step('04-hire-'+roleId,async()=>{
        const saved=JSON.parse(readFileSync(context.savePath,'utf8')).payload
        const employed=new Set(saved.staffCareerRuntime.staffEmployment.filter(e=>e.employment.status==='employed').map(e=>e.staffId))
        const candidate=saved.staffPeople.find(p=>p.marketRole===roleId&&!employed.has(p.id)&&saved.staffPeople.filter(q=>q.identity.firstName+' '+q.identity.lastName===p.identity.firstName+' '+p.identity.lastName).length===1)
        assert(candidate,'No original unemployed specialist: '+roleId)
        const name=candidate.identity.firstName+' '+candidate.identity.lastName
        await open('STAFF','Equipo');await c.click('button,[role=tab]','=CONSTRUYE TU STAFF')
        await c.setValue('select[aria-label="Departamento de contratación"]',department);await c.setValue('select[aria-label="Puesto a contratar"]',roleId);await c.click('button','ABRIR VACANTE')
        await c.setValue('input[aria-label="Buscar candidato de staff"]',name)
        for(const action of ['IDENTIFICAR','ENTREVISTAR','COMPLETAR ENTREVISTA','PREPARAR OFERTA','CONFIRMAR CONTRATO']){
          await c.click('.cs-staff-candidate button','='+action)
          const error=await c.evaluate("document.querySelector('.cs-staff-message.is-error')?.innerText");assert(!error,error)
        }
        const after=await save('04-hire-'+roleId)
        assert(after.payload.staffCareerRuntime.staffEmployment.some(e=>e.staffId===candidate.id&&e.employment.roleId===roleId&&e.employment.teamId===teamId),'No employment after confirmation')
        assert(after.payload.persons.length===initial.payload.persons.length,'Hiring duplicated an identity')
        hired.push({id:candidate.id,name,roleId});writeFileSync(join(context.out,'hired-staff.json'),JSON.stringify(hired));return hired.at(-1)
      })
    }
    await step('05-delegation',async()=>{
      await c.click('button,[role=tab]','=ASIGNACIONES');await c.click('button','=MODO SENCILLO')
      await clickRow('.cs-staff-simple-assignment__row','Create Team Training Plan','ASIGNAR')
      await c.click('button.sa-candidate',hired.find(h=>h.roleId==='assistantCoach').name)
      const saved=await save('05-delegation'),responsibility=saved.payload.responsibilities.find(r=>r.teamId===teamId&&r.kind==='createTeamTrainingPlan')
      assert(responsibility?.mode==='delegated','Responsibility did not change');return responsibility
    })
    await open('TACTICS','Equipo');writeFileSync(join(context.out,'tactics-ui.txt'),await c.bodyText());await c.screenshot(join(context.out,'tactics-ui.png'))
    await save('initial-operations')
  }
  if(['match','match-continue'].includes(process.env.BDM_FINAL01_PHASE)){
    if(process.env.BDM_FINAL01_PHASE==='match'){
    await step('06-tactics',async()=>{
      await open('TACTICS','Equipo');await c.click('button,[role=tab]','=PLAN DE PARTIDO')
      await c.setValue('select[aria-label="Ritmo del plan de partido"]','1');await c.setValue('select[aria-label="Cobertura Pick and Roll"]','hedge');await c.click('button','=APLICAR AL PARTIDO')
      const saved=await save('06-tactics'),plan=saved.payload.gamePlans.find(p=>p.teamId==='pbm:DYN_equipe:41'&&p.tacticalOverride?.pace===1)
      assert(plan?.tacticalOverride?.defense.pickAndRollCoverage==='hedge','Tactical instructions did not persist');return plan
    })
    }
    await step('07-full-match',async()=>{
      if(!await c.locate('[data-ng-region="match-live"]')){await open('MATCH','Partidos y competición');await c.click('button','=JUGAR PARTIDO')}
      await c.waitFor("!!document.querySelector('[data-ng-region=\"match-live\"]')",{timeout:60000})
      await c.click('button','=Pausar partido');await c.screenshot(join(context.out,'match-paused.png'));await c.click('button','=Reanudar partido');await sleep(10000)
      await c.click('button','=Simular final');await c.waitFor("[...document.querySelectorAll('button')].some(b=>b.innerText.trim().toUpperCase()==='CONTINUAR')",{timeout:180000});await c.click('button','=CONTINUAR')
      const saved=await save('07-full-match'),full=saved.payload.matchStatLogs.filter(log=>log.resolution==='FULL')
      assert(full.length===1,'Exactly one complete FULL acta expected');return {gameId:full[0].gameId,date:saved.payload.currentDate}
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='market-start'){
    for(const name of ['Andrea Assoni','David De Blas'])await step('08-contact-'+name.replaceAll(' ','-'),async()=>{
      const saved=JSON.parse(readFileSync(context.savePath,'utf8')).payload,player=saved.players.find(p=>p.firstName+' '+p.lastName===name)
      assert(player,'Original public candidate missing')
      if(!saved.marketRuntime.negotiations.some(n=>n.playerId===player.id)){
        await open('MARKET','Mercado');await c.click('button','=BUSCAR JUGADORES');await field('POSICIÓN','ALL');await field('CONTRATO','FREE');await field('BUSCAR',name);await c.click('button',name)
        await c.click('button','Contactar agente libre');await c.click('button','=Contact player')
      }
      const after=await save('08-contact-'+name.replaceAll(' ','-'))
      const operation=after.payload.marketRuntime.negotiations.find(n=>n.playerId===player.id);assert(operation,'Contact did not persist');return operation
    })
    await step('09-transfer-proposal',async()=>{
      await open('MARKET','Mercado');await c.click('button','=BUSCAR JUGADORES');await field('POSICIÓN','ALL');await field('CONTRATO','ROSTERED');await field('BUSCAR','Aaron Ganal');await c.click('button','Aaron Ganal')
      await field('Compensación que propones al club','500000');await c.click('button','Contactar con el club y proponer')
      const saved=await save('09-transfer-proposal'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Aaron Ganal')
      const negotiation=saved.payload.playerTransferNegotiations.find(n=>n.playerId===player.id);assert(negotiation,'Club proposal did not persist');return negotiation
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='advance'){
    for(let day=0;day<Number(process.env.BDM_FINAL01_DAYS??1);day++)await step('10-advance-'+day,async()=>{
      const saved=await advanceDay(),hired=JSON.parse(readFileSync(join(context.out,'hired-staff.json'),'utf8'))
      for(const employee of hired){
        const contract=saved.payload.staffCareerRuntime.staffContracts.find(contract=>contract.staffId===employee.id)
        assert(saved.payload.expenseRecognitions.some(e=>e.dimensions?.reference?.kind==='STAFF_CONTRACT'&&e.dimensions.reference.id===contract.id),'First payroll skipped after hiring '+employee.name)
      }
      return {date:saved.payload.currentDate,actas:saved.payload.matchStatLogs.length,expenses:saved.payload.expenseRecognitions.length}
    })
    await open('MARKET','Mercado');await c.click('button','=OPERACIONES');writeFileSync(join(context.out,'market-operations-ui.txt'),await c.bodyText());await c.screenshot(join(context.out,'market-operations.png'))
    await save('after-native-advance')
  }
  if(process.env.BDM_FINAL01_PHASE==='market-offer'){
    await step('11-free-agent-offer',async()=>{
      await openOperation('Andrea Assoni')
      await clickRow('article.market-negotiations__entry','Andrea Assoni','Presentar oferta')
      const saved=await save('11-free-agent-offer'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Andrea Assoni')
      const negotiation=saved.payload.marketRuntime.negotiations.find(n=>n.playerId===player.id);assert(negotiation.offerSubmittedOn,'Formal offer did not persist');return negotiation
    })
    await step('12-revised-club-proposal',async()=>{
      await open('MARKET','Mercado');await c.click('button','=BUSCAR JUGADORES');await field('POSICIÓN','ALL');await field('CONTRATO','ROSTERED');await field('BUSCAR','Aaron Ganal');await c.click('button','Aaron Ganal')
      await field('Compensación que propones al club','900000');await c.click('button','Contactar con el club y proponer')
      const saved=await save('12-revised-club-proposal'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Aaron Ganal')
      const negotiation=saved.payload.playerTransferNegotiations.find(n=>n.playerId===player.id&&n.status==='IN_PROGRESS');assert(negotiation,'Revised club proposal did not persist');return negotiation
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='market-approval'){
    await step('13-free-agent-approval-request',async()=>{
      await openOperation('Andrea Assoni');await clickRow('article.market-negotiations__entry','Andrea Assoni','Start signing approval')
      const saved=await save('13-free-agent-approval-request');return {date:saved.payload.currentDate,notice:await c.bodyText()}
    })
    await step('14-third-club-proposal',async()=>{
      await open('MARKET','Mercado');await c.click('button','=BUSCAR JUGADORES');await field('POSICIÓN','ALL');await field('CONTRATO','ROSTERED');await field('BUSCAR','Aaron Ganal');await c.click('button','Aaron Ganal')
      await field('Compensación que propones al club','1400000');await c.click('button','Contactar con el club y proponer')
      const saved=await save('14-third-club-proposal'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Aaron Ganal')
      const negotiation=saved.payload.playerTransferNegotiations.find(n=>n.playerId===player.id&&n.status==='IN_PROGRESS');assert(negotiation,'Third proposal did not persist');return negotiation
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='market-sign-agent'){
    await step('15-sign-free-agent',async()=>{
      await openOperation('Andrea Assoni');await clickRow('article.market-negotiations__entry','Andrea Assoni','Complete signing')
      const saved=await save('15-sign-free-agent'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Andrea Assoni')
      assert(saved.payload.teams.find(t=>t.id==='pbm:DYN_equipe:41').rosterPlayerIds.includes(player.id),'Signed free agent missing from roster')
      assert(saved.payload.marketRuntime.negotiations.some(n=>n.playerId===player.id&&n.status==='SIGNED'),'Signing operation not completed');return {playerId:player.id,contracts:saved.payload.contracts.filter(c=>c.playerId===player.id)}
    })
    await step('16-agree-club-and-offer-player',async()=>{
      await clickRow('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aaron Ganal','Aceptar la compensación del club')
      await field('Salario anual','1200000');await field('Años de contrato','3');await clickRow('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aaron Ganal','Presentar oferta al jugador')
      const saved=await save('16-offer-transfer-player'),transfer=saved.payload.playerTransferNegotiations.find(n=>n.status==='IN_PROGRESS')
      assert(transfer?.agreedFee===1725000&&transfer.playerStatus==='AWAITING_PLAYER_RESPONSE','Club or player stage missing');return transfer
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='market-alternative'){
    await step('17-withdraw-unaffordable-and-contact-alternative',async()=>{
      await open('MARKET','Mercado');await c.click('button','=OPERACIONES');await clickRow('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aaron Ganal','Retirar la operación')
      await c.click('button','=BUSCAR JUGADORES');await field('POSICIÓN','ALL');await field('CONTRATO','ROSTERED');await field('BUSCAR','Aaron Best');await c.click('button','Aaron Best')
      await field('Compensación que propones al club','1000000');await c.click('button','Contactar con el club y proponer')
      const saved=await save('17-alternative-transfer'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Aaron Best')
      const transfer=saved.payload.playerTransferNegotiations.find(n=>n.playerId===player.id&&n.status==='IN_PROGRESS');assert(transfer,'Alternative club proposal missing');return transfer
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='market-contact-target'){
    const name=process.env.BDM_FINAL01_TARGET??'Jordan Sakho'
    await step('18-club-contact-'+name.replaceAll(' ','-'),async()=>{
      await open('MARKET','Mercado');await c.click('button','=BUSCAR JUGADORES');await field('POSICIÓN','ALL');await field('CONTRATO','ROSTERED');await field('BUSCAR',name);await c.click('button',name)
      await field('Compensación que propones al club','1000000');await c.click('button','Contactar con el club y proponer')
      const saved=await save('18-target-transfer'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName===name)
      const transfer=saved.payload.playerTransferNegotiations.find(n=>n.playerId===player.id&&n.status==='IN_PROGRESS');assert(transfer,'Club proposal missing');return transfer
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='transfer-player-offer'){
    await step('19-transfer-player-offer',async()=>{
      await open('MARKET','Mercado');await c.click('button','=OPERACIONES')
      await field('Salario anual','900000');await field('Años de contrato','3')
      await clickRow('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aleksandar Zecevic','Presentar oferta al jugador')
      const saved=await save('19-transfer-player-offer'),transfer=saved.payload.playerTransferNegotiations.find(n=>n.status==='IN_PROGRESS')
      assert(transfer?.playerStatus==='AWAITING_PLAYER_RESPONSE','Player offer not registered');return transfer
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='transfer-approval'){
    await step('20-transfer-approval',async()=>{
      await open('MARKET','Mercado');await c.click('button','=OPERACIONES')
      if(await c.locate('button','Aceptar la contraoferta del jugador'))await c.click('button','Aceptar la contraoferta del jugador')
      await clickRow('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aleksandar Zecevic','Solicitar autorización')
      const saved=await save('20-transfer-approval');return {date:saved.payload.currentDate,body:await c.bodyText()}
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='transfer-complete'){
    await step('21-transfer-complete',async()=>{
      await open('MARKET','Mercado');await c.click('button','=OPERACIONES')
      if(await c.locate('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aleksandar Zecevic'))await clickRow('article.market-transfers__entry[data-transfer-status="IN_PROGRESS"]','Aleksandar Zecevic','Completar traspaso')
      const saved=await save('21-transfer-complete'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName==='Aleksandar Zecevic')
      const transfer=saved.payload.playerTransferNegotiations.find(n=>n.playerId===player.id&&n.status==='EXECUTED')
      assert(transfer?.execution,'Transfer not executed')
      assert(saved.payload.teams.find(t=>t.id===transfer.buyerTeamId).rosterPlayerIds.includes(player.id),'Buyer roster missing player')
      assert(!saved.payload.teams.find(t=>t.id===transfer.sellerTeamId).rosterPlayerIds.includes(player.id),'Seller roster still owns player')
      assert(saved.payload.players.filter(p=>p.id===player.id).length===1,'Duplicated player identity');return transfer
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='renewal'){
    const name=process.env.BDM_FINAL01_RENEW_PLAYER??'Bojan Dubljevic'
    await step('24-contract-renewal',async()=>{
      await open('CONTRACTS','Gestión del club');await c.click('button,[role=tab]','=Negotiations')
      const row=`article[aria-label="${name} retention"]`
      await c.click(row+' button','=Open negotiation')
      await c.setValue(`input[aria-label="${name} retention annual salary"]`,process.env.BDM_FINAL01_RENEW_SALARY??'200000')
      await c.setValue(`input[aria-label="${name} retention years"]`,'1');await c.click(row+' button','=Submit offer')
      if(await c.locate(row+' button','Respond to counter'))await c.click(row+' button','Respond to counter')
      await c.click(row+' button','Request signing approval')
      const saved=await save('24-contract-renewal'),player=saved.payload.players.find(p=>p.firstName+' '+p.lastName===name)
      const negotiation=saved.payload.retentionNegotiations.find(n=>n.playerId===player.id&&n.status==='ACCEPTED')
      assert(negotiation,'Renewal was not accepted in principle');return negotiation
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='release'){
    const name=process.env.BDM_FINAL01_RELEASE_PLAYER??'Erik Stevenson'
    await step('25-release-player',async()=>{
      const before=JSON.parse(readFileSync(context.savePath,'utf8')).payload,player=before.players.find(p=>p.firstName+' '+p.lastName===name)
      await open('CONTRACTS','Gestión del club');await c.click('button,[role=tab]','=Release / risk');await field('Player',player.id)
      const action=c.click('button','=Execute release');await sleep(600);await c.send('Page.handleJavaScriptDialog',{accept:true});await action
      const saved=await save('25-release-player')
      assert(!saved.payload.teams.find(t=>t.id==='pbm:DYN_equipe:41').rosterPlayerIds.includes(player.id),'Released player remains on roster')
      assert(saved.payload.contracts.some(c=>c.playerId===player.id&&c.termination),'Release did not terminate contract');return {playerId:player.id,date:saved.payload.currentDate}
    })
  }
  if(process.env.BDM_FINAL01_PHASE==='season-views'){
    await step('26-four-competition-views',async()=>{
      await open('COMPETITION','Partidos y competición')
      const leagues=await c.evaluate("[...document.querySelector('select[aria-label=\"Competición\"]').options].map(o=>({id:o.value,name:o.text}))")
      assert(leagues.length===4,'Missing selectable competition')
      for(const league of leagues){
        await c.setValue('select[aria-label="Competición"]',league.id);await sleep(800);await c.click('button,[role=tab]','=Clasificación');await sleep(800)
        await c.screenshot(join(context.out,'final-league-'+league.id.replaceAll(':','-')+'.png'))
        writeFileSync(join(context.out,'final-league-'+league.id.replaceAll(':','-')+'.txt'),await c.bodyText())
      }
      return leagues
    })
    await step('27-fiscal-closure-visible',async()=>{
      await open('FINANCES','Gestión del club');await c.click('summary','Ejercicios y cierres')
      const text=await c.bodyText();assert(text.includes('Cerrado')&&text.includes('Abierto'),'Old closure or new fiscal period not visible')
      writeFileSync(join(context.out,'final-fiscal-ui.txt'),text);return {date:JSON.parse(readFileSync(context.savePath,'utf8')).payload.currentDate}
    })
    await open('TRAINING','Equipo');await c.click('button,[role=tab]','=RESULTADOS');await c.screenshot(join(context.out,'final-training-results.png'))
    writeFileSync(join(context.out,'final-training-results.txt'),await c.bodyText())
  }
} finally { c?.close(); if(app&&process.env.BDM_FINAL01_KEEP_OPEN!=='1')app.child.kill() }
