import { useRef, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import type { TeamId, InjuryId, StaffPersonId, FacilityComponentId } from '@/domain/ids'
import { addDays, parseGameDate } from '@/domain/date'
import { injuryLifecycleStatus } from '@/domain/injury'
import { equippedActs, evaluateEquippedRehabilitation } from '@/engine/injury/EquippedRehabilitation'
import { clinicalAuthorizationAt } from '@/engine/injury/ClinicalAuthorization'
import { useGameStore } from '@/stores/gameStore'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

export function EquippedMedicalPanel({ world, teamId, facilityId }: { world: GameWorld; teamId: TeamId; facilityId?: string }) {
  const indicate = useGameStore(state => state.indicateEquippedMedical)
  const schedule = useGameStore(state => state.scheduleEquippedMedical)
  const cancel = useGameStore(state => state.cancelEquippedMedical)
  const [injuryId, setInjuryId] = useState(''), [staffId, setStaffId] = useState(''), [tags, setTags] = useState('')
  const [selectedId, setSelectedId] = useState(new URL(window.location.href).searchParams.get('requestId') ?? ''), [componentId, setComponentId] = useState(''), [performerId, setPerformerId] = useState('')
  const [date, setDate] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState(''), [message, setMessage] = useState('')
  const indicationIntent = useRef<{ signature: string; id: string } | null>(null)
  const schedulingIntent = useRef<{ signature: string; requestId: string } | null>(null)
  const acts = equippedActs(world).filter(act => act.teamId === teamId && (facilityId === undefined || act.physicalAllocations?.some(item => item.facilityId === facilityId)))
  const clinicians = Object.values(world.staffPeopleById).filter(person => clinicalAuthorizationAt(world, person.id, teamId, 'INDICATE', world.currentDate).ok)
  const performers = Object.values(world.staffPeopleById).filter(person => clinicalAuthorizationAt(world, person.id, teamId, 'PERFORM', world.currentDate).ok)
  const recovering = Object.values(world.injuriesById).filter(injury => world.teams[teamId]?.rosterPlayerIds.includes(injury.playerId) && injury.injuredOn <= world.currentDate && injuryLifecycleStatus(injury, world.currentDate) === 'RECOVERING')
  const components = Object.values(world.facilityComponentsById).filter(item => facilityId === undefined || item.facilityId === facilityId)
  const chosen = acts.find(act => act.id === selectedId)
  const perform = (command: () => void) => { try { command(); setMessage('Solicitud procesada. Consulta el estado y la causa registrados.'); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } }
  return <section className="ng-canon__panel" aria-label="Equipped rehabilitation">
    <h3>Rehabilitación equipada</h3>
    <p>Actuaciones indicadas por Medical. Una reserva no acredita tratamiento realizado; no concede mejoras de recuperación ni RTP.</p>
    {clinicians.length === 0 ? <p role="status">Sin profesional con autorización clínica acreditada para indicar esta actuación. Los cargos y el asesoramiento no conceden permisos clínicos.</p> : null}
    {facilityId === undefined ? <fieldset><legend>Solicitar decisión al profesional autorizado</legend>
      <label>Lesión en recuperación<select aria-label="Lesión en recuperación" value={injuryId} onChange={event => setInjuryId(event.target.value)}><option value="">Seleccionar episodio</option>{recovering.map(injury => <option key={injury.id} value={injury.id}>{world.players[injury.playerId]?.lastName} · {injury.id}</option>)}</select></label>
      <label>Profesional que indica<select aria-label="Profesional que indica" value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">Seleccionar profesional acreditado</option>{clinicians.map(person => <option key={person.id} value={person.id}>{person.identity.firstName} {person.identity.lastName}</option>)}</select></label>
      <label>Referencias de equipamiento requeridas por el profesional<input aria-label="Equipamiento indicado" value={tags} onChange={event => setTags(event.target.value)} placeholder="Referencias explícitas, separadas por comas" /></label>
      <button disabled={!injuryId || !staffId || !tags.trim()} onClick={() => perform(() => {
        const signature = JSON.stringify([injuryId, staffId, tags, world.currentDate])
        if (indicationIntent.current?.signature !== signature) indicationIntent.current = { signature, id: `medical:${injuryId}:${world.currentDate}:${equippedActs(world).length}` }
        indicate({ id: indicationIntent.current.id, injuryId: injuryId as InjuryId, prescribingStaffId: staffId as StaffPersonId, requiredEquipmentTags: tags.split(',').map(value => value.trim()).filter(Boolean) })
      })}>Solicitar indicación clínica</button>
    </fieldset> : null}
    {acts.length === 0 ? <p>No hay actuaciones equipadas registradas.</p> : <ul>{acts.map(act => <li key={act.id}>
      <button onClick={() => { setSelectedId(act.id); setDate(act.interval?.date ?? ''); setStart(act.interval?.startTime ?? ''); setEnd(''); setComponentId(act.physicalAllocations?.at(-1)?.componentId ?? ''); setPerformerId(act.performingStaffId ?? ''); }}>{act.id}</button>
      {' · '}{act.status} · {act.history.at(-1)?.reason} · Indicado: {act.indicatedOn} · {world.staffPeopleById[act.prescribingStaffId]?.identity.lastName}
      <p>Equipo requerido: {act.requiredEquipmentTags.join(', ')}. Cumplimiento: {act.fulfilledOn ?? 'Pendiente'}.</p>
      {act.interval ? <p>Intervalo: {act.interval.date} {act.interval.startTime} · {act.interval.durationMinutes} min. Disponibilidad horaria profesional no verificada.</p> : null}
      {(act.physicalAllocations ?? []).map(item => <p key={item.id}>{item.consumer?.kind} · {item.facilityId} / {item.componentId} · {item.status} · {item.history.at(-1)?.reason}</p>)}
      <button onClick={() => syncWorkspaceAppQuery(facilityId === undefined ? 'facilities' : 'medical', 'push', { requestId: act.id })}>{facilityId === undefined ? 'Ver recurso físico' : 'Abrir actuación Medical'} {act.id}</button>
      <details><summary>Historial</summary>{act.history.map((item, i) => <p key={i}>{item.onDate} · {item.status} · {item.reason}</p>)}</details>
      {!['COMPLETED', 'CANCELLED'].includes(act.status) ? <button onClick={() => perform(() => cancel(act.id))}>Cancelar {act.id}</button> : null}
    </li>)}</ul>}
    {chosen && !['COMPLETED', 'CANCELLED'].includes(chosen.status) && facilityId === undefined ? <fieldset><legend>Programar o reprogramar {chosen.id}</legend>
      <label>Fecha<input aria-label="Fecha Medical" type="date" min={addDays(world.currentDate, 1)} value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Inicio<input aria-label="Inicio Medical" type="time" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Final (puede cruzar medianoche)<input aria-label="Final Medical" type="time" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <label>Profesional que realiza<select aria-label="Profesional que realiza" value={performerId} onChange={event => setPerformerId(event.target.value)}><option value="">Seleccionar profesional acreditado</option>{performers.map(person => <option key={person.id} value={person.id}>{person.identity.firstName} {person.identity.lastName}</option>)}</select></label>
      <label>Componente<select aria-label="Componente Medical" value={componentId} onChange={event => setComponentId(event.target.value)}><option value="">Seleccionar recurso</option>{components.map(item => <option key={item.id} value={item.id}>{item.name ?? item.id} · {item.equipmentTags.join(', ') || 'Equipamiento no documentado'}</option>)}</select></label>
      <button disabled={!date || !start || !end || !performerId || !componentId} onClick={() => perform(() => {
        const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
        const durationMinutes = (minutes(end) - minutes(start) + 1440) % 1440
        const signature = JSON.stringify([chosen.id, date, start, end, componentId, performerId])
        if (schedulingIntent.current?.signature !== signature) schedulingIntent.current = { signature, requestId: `ui:${chosen.history.length}:${signature}` }
        schedule({ actId: chosen.id, interval: { date: parseGameDate(date), startTime: start, durationMinutes }, performingStaffId: performerId as StaffPersonId, componentId: componentId as FacilityComponentId, requestId: schedulingIntent.current.requestId, confirm: true })
      })}>Solicitar / confirmar programación</button>
      <p>Alternativas verificadas para el intervalo registrado; selección manual:</p>
      <ul>{chosen.interval ? components.map(item => ({ item, result: evaluateEquippedRehabilitation(world, chosen, item.id, true) })).map(({ item, result }) => <li key={item.id}>{item.name ?? item.id}: {result.status} · {result.reason}<button onClick={() => setComponentId(item.id)}>Seleccionar {item.id}</button></li>) : <li>Introduce un intervalo explícito para evaluar alternativas.</li>}</ul>
    </fieldset> : null}
    <p role="status">{message}</p>
    <button onClick={() => syncWorkspaceAppQuery(facilityId === undefined ? 'facilities' : 'medical', 'push')}>{facilityId === undefined ? 'Consultar Facilities' : 'Consultar actuaciones Medical'}</button>
  </section>
}
