import { useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import type { TeamId, StaffPersonId } from '@/domain/ids'
import { ASSIGNABLE_STAFF_ROLE_IDS, calculateStaffRoleProficiencyByRoleId, STAFF_DEPARTMENTS, staffRoleDefinition, type StaffRoleId, type StaffDepartment } from '@/domain/staff'
import { STAFF_DEPARTMENT_LABELS, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { createStaffJobOpeningForTeam, closeStaffJobOpening, identifyStaffCandidate, startStaffInterview,
  completeStaffInterview, createStaffJobOffer, acceptStaffJobOffer, withdrawStaffJobOffer,
  rankStaffCandidates, getStaffMarketRole } from '@/app/staffCareer'
import { navigateToStaff } from '@/ui-ng/workspace/workspaceApps'

type MarketStep='idle'|'identified'|'interviewing'|'completed'|'offered'|'hired'
function name(world:GameWorld,id:StaffPersonId):string {
  const p=world.staffPeopleById[id];return p?p.identity.firstName+' '+p.identity.lastName:String(id)
}
export function StaffCourtsideMarket({world,teamId,onWorldChange}:{
  readonly world:GameWorld;readonly teamId:TeamId;readonly onWorldChange:(next:GameWorld)=>void
}){
  const [department,setDepartment]=useState<StaffDepartment>('coaching')
  const [role,setRole]=useState<StaffRoleId>('assistantCoach')
  const [search,setSearch]=useState('')
  const [selectedOpening,setSelectedOpening]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const roles=ASSIGNABLE_STAFF_ROLE_IDS.filter(id=>staffRoleDefinition(id).department===department)
  const selectedRole=roles.some(id=>id===role)?role:roles[0]!
  const jobs=Object.values(world.staffJobOpeningsById).filter(job=>job.teamId===teamId&&job.status==='open')
  const opening=jobs.find(j=>j.id===selectedOpening)??jobs.find(j=>j.roleId===selectedRole)
  const ranked=useMemo(()=>opening===undefined?[]:rankStaffCandidates(world,opening.id),[world,opening])
  const candidates=ranked.filter(id=>{
    const p=world.staffPeopleById[id]
    return p!==undefined&&(name(world,id).toLowerCase().includes(search.toLowerCase())||
      (getStaffMarketRole(world,id)??'').toLowerCase().includes(search.toLowerCase()))
  }).slice(0,60)
  const execute=(operation:()=>GameWorld, success:string)=>{
    try{const next=operation();onWorldChange(next);setError('');setNotice(success)}
    catch(e){setError(e instanceof Error?e.message:'Esta operación no está disponible en la situación actual.');setNotice('')}
  }
  const selectOpen=(id:string)=>{setSelectedOpening(id);setError('');setNotice('')}
  const openVacancy=()=>{
    try{const next=createStaffJobOpeningForTeam(world,{teamId,roleId:selectedRole});
      onWorldChange(next.world);setSelectedOpening(next.opening.id);setNotice('Vacante abierta en el mundo de juego.');setError('')}
    catch(e){setError(e instanceof Error?e.message:'No se pudo abrir la vacante.')}
  }
  return <div className="cs-staff-market">
    <div className="cs-staff-operational-head">
      <div className="cs-staff-operational-head__identity">
        <div className="cs-staff-eyebrow">MERCADO PROFESIONAL / DIRECCIÓN DEPORTIVA</div>
        <h1>CONSTRUYE TU STAFF</h1>
        <p>Busca especialistas, entrevista y contrata con las reglas reales del club.</p>
      </div>
      <button className="cs-staff-primary" type="button" onClick={openVacancy}>+ ABRIR VACANTE</button>
    </div>
    {error&&<p className="cs-staff-message is-error" role="alert">{error}</p>}
    {notice&&<p className="cs-staff-message" role="status">{notice}</p>}
    <div className="cs-staff-market-layout">
      <section className="cs-staff-market-main" aria-label="Mercado de personal">
        <div className="cs-staff-filters">
          <label>DEPARTAMENTO<select value={department} aria-label="Departamento de contratación"
            onChange={e=>setDepartment(e.target.value as StaffDepartment)}>
            {STAFF_DEPARTMENTS.map(x=><option key={x} value={x}>{STAFF_DEPARTMENT_LABELS[x]}</option>)}</select></label>
          <label>PUESTO<select value={selectedRole} aria-label="Puesto a contratar" onChange={e=>setRole(e.target.value as StaffRoleId)}>
            {roles.map(x=><option value={x} key={x}>{STAFF_ROLE_LABELS[x]}</option>)}</select></label>
          <label>BUSCAR<input aria-label="Buscar candidato de staff" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre o especialidad"/></label>
        </div>
        {opening===undefined?<div className="cs-staff-empty">Abre una vacante en este puesto o selecciona una existente para iniciar el proceso. No hay candidatos elegidos automáticamente.</div>:<>
          <div className="cs-staff-section-heading"><h2>CANDIDATOS PARA {STAFF_ROLE_LABELS[opening.roleId]}</h2>
            <span>{ranked.length} elegibles · se muestran hasta 60 coincidencias</span></div>
          {ranked.length===0?<p className="cs-staff-empty">No hay candidatos elegibles con reputación registrada para esta vacante.</p>:null}
          <div className="cs-staff-candidate-list">
            {candidates.map(id=>{
              const staff=world.staffPeopleById[id]!
              const score=calculateStaffRoleProficiencyByRoleId(staff,opening.roleId)
              const employment=world.staffEmploymentByStaffId[id]
              const candidacy=Object.values(world.staffJobCandidaciesById).find(c=>c.jobOpeningId===opening.id&&c.staffId===id)
              const offer=Object.values(world.staffJobOffersById).find(o=>o.jobOpeningId===opening.id&&o.staffId===id&&o.status==='pending')
              const interview=candidacy===undefined?undefined:world.staffInterviewsByCandidacyId[candidacy.id]
              const step:MarketStep=offer?'offered':candidacy?.status==='hired'?'hired':
                candidacy?.status==='offered'?'offered':interview?.status==='completed'?'completed':
                candidacy?.status==='interviewing'?'interviewing':candidacy?.status==='identified'?'identified':'idle'
              return <article className="cs-staff-candidate" key={id}>
                <div className="cs-staff-candidate__identity">
                  <button type="button" onClick={()=>navigateToStaff(id)}>{name(world,id)} ↗</button>
                  <span>{employment?.status==='employed'?'Con contrato en otro club':'Sin club'} · {STAFF_ROLE_LABELS[getStaffMarketRole(world,id)??opening.roleId]}</span>
                </div>
                <div className="cs-staff-candidate__score"><strong>{score}</strong><span>AJUSTE AL PUESTO</span></div>
                <div className="cs-staff-candidate__action">
                  {step==='idle'&&<button type="button" onClick={()=>{
                    try{const result=identifyStaffCandidate(world,{openingId:opening.id,staffId:id});onWorldChange(result.world);setNotice('Candidato identificado.');setError('')}
                    catch(e){setError(e instanceof Error?e.message:'Candidato no elegible')}
                  }}>IDENTIFICAR</button>}
                  {step==='identified'&&<button type="button" onClick={()=>execute(()=>startStaffInterview(world,candidacy!.id),'Entrevista iniciada.')}>ENTREVISTAR</button>}
                  {step==='interviewing'&&<button type="button" onClick={()=>execute(()=>completeStaffInterview(world,candidacy!.id),'Entrevista completada.')}>
                    {interview?.status==='completed'?'ENTREVISTA LISTA':'COMPLETAR ENTREVISTA'}</button>}
                  {step==='completed'&&<button type="button" onClick={()=>{
                    try{const result=createStaffJobOffer(world,{candidacyId:candidacy!.id});onWorldChange(result.world);
                      setNotice('Oferta creada con presupuesto verificado.');setError('')}
                    catch(e){setError(e instanceof Error?e.message:'La oferta no pudo crearse')}
                  }}>PREPARAR OFERTA</button>}
                  {step==='offered'&&offer&&<div className="cs-staff-candidate__offer">
                    <span>{offer.annualSalary===undefined?'Salario no especificado':offer.annualSalary.toLocaleString('es-ES')+' / año'}</span>
                    <button type="button" className="is-accent" onClick={()=>execute(()=>acceptStaffJobOffer(world,offer.id),'Contratación registrada. El empleado ya pertenece al club.')}>CONFIRMAR CONTRATO</button>
                    <button type="button" onClick={()=>execute(()=>withdrawStaffJobOffer(world,offer.id),'Oferta retirada.')}>RETIRAR</button>
                  </div>}
                  {step==='hired'&&<span>CONTRATADO</span>}
                </div>
              </article>
            })}
          </div>
        </>}
      </section>
      <aside className="cs-staff-market-side" aria-label="Vacantes y operaciones">
        <div className="cs-staff-kpis cs-staff-kpis--side cs-staff-kpis--market">
      <div><strong>{jobs.length}</strong><span>VACANTES ABIERTAS</span></div>
      <div><strong>{Object.values(world.staffJobCandidaciesById).filter(c=>jobs.some(j=>j.id===c.jobOpeningId)&&['identified','interviewing','offered'].includes(c.status)).length}</strong><span>CANDIDATURAS EN CURSO</span></div>
      <div><strong>{Object.values(world.staffJobOffersById).filter(o=>o.teamId===teamId&&o.status==='pending').length}</strong><span>OFERTAS PENDIENTES</span></div>
    </div>
        <div className="cs-staff-section-heading"><h2>VACANTES EN EL CLUB</h2></div>
        {jobs.length===0?<p className="cs-staff-empty">Aún no hay vacantes abiertas. Los objetivos visuales por puesto no cuentan como vacantes.</p>:null}
        {jobs.map(job=><div className={'cs-staff-job'+(job.id===opening?.id?' is-active':'')} key={job.id}>
          <button type="button" onClick={()=>selectOpen(job.id)}>{STAFF_ROLE_LABELS[job.roleId]}<span>VER CANDIDATOS ↗</span></button>
          <button type="button" aria-label={'Cerrar vacante '+STAFF_ROLE_LABELS[job.roleId]}
            onClick={()=>execute(()=>closeStaffJobOpening(world,job.id),'Vacante cerrada.')}>CERRAR</button>
        </div>)}
        <div className="cs-staff-market-notice"><strong>CÓMO SE CONTRATA</strong>
          <p>Identificar → entrevistar → completar entrevista → oferta → confirmar contratación.</p>
          <p>Las reglas de elegibilidad y presupuesto se comprueban mediante StaffCareerService. Una oferta no equivale a un fichaje hasta confirmar.</p>
        </div>
      </aside>
    </div>
  </div>
}