import { useMemo } from 'react'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { getTeamStaffPresentation, STAFF_DEPARTMENT_LABELS, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { STAFF_DEPARTMENTS, staffRoleDefinition } from '@/domain/staff'
import { navigateToStaff, navigateToStaffDepartment } from '@/ui-ng/workspace/workspaceApps'

export function StaffCourtsideOverview({world,teamId,onOpenAssignments,onOpenMarket,onOpenAdvisory,onOpenDynamics}:{
  readonly world:GameWorld;readonly teamId:TeamId
  readonly onOpenAssignments:()=>void;readonly onOpenMarket:()=>void
  readonly onOpenAdvisory:()=>void;readonly onOpenDynamics:()=>void
}){
  const staff=useMemo(()=>getTeamStaffPresentation(world,teamId),[world,teamId])
  const positions=Object.values(world.staffJobOpeningsById).filter(job=>job.teamId===teamId&&job.status==='open')
  const overloaded=staff.filter(person=>person.workloadState==='overloaded')
  const pending=Object.values(world.staffCareerRequestsById).filter(request=>request.teamId===teamId&&request.status==='OPEN')
  const departments=STAFF_DEPARTMENTS.map(department=>{
    const people=staff.filter(person=>staffRoleDefinition(person.role).department===department)
    const departmentJobs=positions.filter(job=>staffRoleDefinition(job.roleId).department===department)
    const lead=[...people].sort((a,b)=>b.roleProficiency-a.roleProficiency)[0]
    return {department,people,departmentJobs,lead,overloaded:people.filter(person=>person.workloadState==='overloaded').length}
  })
  return <div className="cs-staff-overview">
    <div className="cs-staff-eyebrow">PERSONAS · TALENTO · RESPONSABILIDAD</div>
    <div className="cs-staff-titlebar"><div>
      <h1>DIRIGE TU CUERPO TÉCNICO</h1>
      <p>Las personas que contratas, las decisiones que delegas y los problemas que debes atender.</p>
    </div><button className="cs-staff-primary" type="button" onClick={onOpenMarket}>+ BUSCAR PERSONAL</button></div>
    <div className="cs-staff-kpis" aria-label="Situación del cuerpo técnico">
      <button type="button" onClick={onOpenAssignments}><strong>{staff.length}</strong><span>PROFESIONALES</span></button>
      <button type="button" onClick={onOpenMarket}><strong>{positions.length}</strong><span>VACANTES ABIERTAS REALES</span></button>
      <button type="button" onClick={onOpenAssignments}><strong>{overloaded.length}</strong><span>EMPLEADOS SOBRECARGADOS</span></button>
      <button type="button" onClick={onOpenDynamics}><strong>{pending.length}</strong><span>SOLICITUDES PROFESIONALES</span></button>
    </div>
    <div className="cs-staff-overview-grid">
      <section className="cs-staff-departments" aria-label="Departamentos de staff">
        <div className="cs-staff-section-heading"><h2>DEPARTAMENTOS</h2><span>Se muestran empleados y vacantes registradas, no objetivos ficticios de plantilla.</span></div>
        <div className="cs-staff-department-grid">
          {departments.map(({department,people,lead,departmentJobs,overloaded:load})=>
            <article className="cs-staff-department" key={department}>
              <div className="cs-staff-department__top"><h3>{STAFF_DEPARTMENT_LABELS[department]}</h3>
                <strong>{people.length}<small>empleados</small></strong></div>
              <div className="cs-staff-department__lead">{lead===undefined?
                <span>Sin responsables registrados</span>:<><button type="button" onClick={()=>navigateToStaff(lead.staffPersonId)}>{lead.name} ↗</button><span>{STAFF_ROLE_LABELS[lead.role]}</span></>}</div>
              <div className="cs-staff-department__facts">
                <span>{departmentJobs.length>0?`${departmentJobs.length} vacante(s) abierta(s)`:'Sin vacantes abiertas'}</span>
                <span className={load>0?'is-warning':''}>{load>0?`${load} con sobrecarga`:'Carga sin alertas'}</span>
              </div>
              <button type="button" onClick={()=>navigateToStaffDepartment(department)}>EXPLORAR EQUIPO ↗</button>
            </article>)}
        </div>
      </section>
      <aside className="cs-staff-agenda" aria-label="Agenda de dirección técnica">
        <div className="cs-staff-section-heading"><h2>EN TU MESA</h2></div>
        <button type="button" onClick={onOpenAssignments}><strong>ORGANIZAR EL TRABAJO</strong><span>Asignación rápida, autoasignación y revisión de carga.</span><b>↗</b></button>
        <button type="button" onClick={onOpenAdvisory}><strong>CONSEJO DEL STAFF</strong><span>Valora las recomendaciones antes de dar una orden.</span><b>↗</b></button>
        <button type="button" onClick={onOpenDynamics}><strong>CLIMA PROFESIONAL</strong><span>Expectativas, relaciones, tensiones y solicitudes.</span><b>↗</b></button>
        <button type="button" onClick={onOpenMarket}><strong>CONSTRUIR EL EQUIPO</strong><span>Contratar, entrevistar y abrir vacantes con presupuesto real.</span><b>↗</b></button>
      </aside>
    </div>
  </div>
}