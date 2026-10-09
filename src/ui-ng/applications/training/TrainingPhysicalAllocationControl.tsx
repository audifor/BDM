import { useState } from 'react'
import type { GameWorld } from '@/domain/world'
import type { FacilityComponentId, PlayerId, TeamId } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'
import { evaluatePhysicalAllocation, allocationAlternatives, allocationTimeAlternatives } from '@/engine/facilities/PhysicalAllocationEngine'
import type { ScheduledTrainingSession } from '@/domain/training'
import { useGameStore } from '@/stores/gameStore'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

export function TrainingPhysicalAllocationControl({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const sessions = Object.values(world.scheduledTrainingSessionsById).filter(session => session.teamId === teamId && session.status === 'scheduled')
  return <section aria-label="Training physical reservations"><h3>Training physical reservations</h3>
    <p>Select participants and a known resource to request a physical reservation. Unknown information preserves unverified Training continuity.</p>
    {sessions.map(session => <SessionResource key={`${session.id}:${session.date}:${session.startTime}`} world={world} session={session} />)}
    {Object.values(world.scheduledTrainingSessionsById).filter(session => session.teamId === teamId && session.status !== 'scheduled' && session.physicalAllocations !== undefined).map(session => <article key={session.id}>
      <h4>{session.id}: {session.status}</h4>{session.physicalAllocations?.map(item => <p key={item.id}>{item.id}: {item.status}; {item.history.map(event => `${event.onDate} ${event.reason}`).join('; ')}</p>)}
    </article>)}
  </section>
}
function SessionResource({ world, session }: { readonly world: GameWorld; readonly session: ScheduledTrainingSession }) {
  const [componentId, setComponentId] = useState<FacilityComponentId | ''>(session.physicalAllocations?.find(item => item.status === 'CONFIRMED')?.componentId ?? '')
  const [players, setPlayers] = useState<readonly PlayerId[]>(session.selectedPlayerIds ?? [])
  const [date, setDate] = useState<string>(session.date)
  const [time, setTime] = useState(session.startTime)
  const [duration, setDuration] = useState(session.durationMinutes)
  const [notice, setNotice] = useState<string | null>(null)
  const request = useGameStore(state => state.requestPhysicalTrainingResource)
  const release = useGameStore(state => state.releasePhysicalTrainingResource)
  const schedule = useGameStore(state => state.scheduleTrainingSession)
  const cancel = useGameStore(state => state.cancelTrainingSession)
  const focus = useGameStore(state => state.focusFacility)
  const { setActiveApp } = useNgWorkspaceNavigation()
  const result = componentId === '' ? null : evaluatePhysicalAllocation(world, session, componentId)
  const run = (action: () => void) => { try { action(); setNotice(null) } catch (error) { setNotice(error instanceof Error ? error.message : 'Resource command failed') } }
  const components = Object.values(world.facilityComponentsById)
  const alternatives = allocationAlternatives(world, session)
  const alternativeStarts = componentId === '' ? [] : allocationTimeAlternatives(world, session, componentId)
  const requestId = `${componentId}:${session.date}:${session.startTime}:${session.durationMinutes}:${session.selectedPlayerIds?.slice().sort().join(',') ?? session.playerId ?? 'unknown-demand'}`
  return <article aria-label={`Physical resource ${session.id}`}>
    <h4>{session.id}: {session.date} {session.startTime} / {session.durationMinutes} minutes</h4>
    {session.scope === 'team' && <fieldset><legend>Explicit Training participants</legend>
      {world.teams[session.teamId]!.rosterPlayerIds.map(id => <label key={id}><input type="checkbox" checked={players.includes(id)} onChange={event => setPlayers(event.target.checked ? [...players, id] : players.filter(value => value !== id))} />{world.players[id]?.firstName} {world.players[id]?.lastName} ({id})</label>)}
      <button type="button" disabled={players.length === 0 || session.date <= world.currentDate} onClick={() => run(() => schedule({ ...session, selectedPlayerIds: players }))}>Apply participants</button>
    </fieldset>}
    <label>Component<select aria-label={`Component ${session.id}`} value={componentId} onChange={event => setComponentId(event.target.value as FacilityComponentId)}>
      <option value="">Unassigned</option>{components.map(component => <option key={component.id} value={component.id}>{world.facilitiesById[component.facilityId]?.canonicalName} / {component.name ?? component.id}</option>)}
    </select></label>
    {result !== null && <p>Demand {result.demand ?? 'unknown'} SIMULTANEOUS_PLAYERS; operating capacity {result.capacity ?? 'unknown'}; confirmed occupancy {result.occupancy ?? 'unknown'}; {result.status}: {result.reason}</p>}
    <p>Available alternatives: {alternatives.join(', ') || 'none verified'}. Choose an alternative explicitly; no automatic move.</p>
    {alternativeStarts.map(start => <button type="button" key={`${start.date}:${start.startTime}`} onClick={() => { setDate(start.date); setTime(start.startTime) }}>Use proposed start {start.date} {start.startTime}</button>)}
    <button type="button" disabled={componentId === ''} onClick={() => run(() => request({ sessionId: session.id, componentId: componentId as FacilityComponentId, requestId, confirm: false }))}>Request resource</button>
    <button type="button" disabled={componentId === ''} onClick={() => run(() => request({ sessionId: session.id, componentId: componentId as FacilityComponentId, requestId, confirm: true }))}>Confirm resource</button>
    <button type="button" disabled={componentId === ''} onClick={() => { const component = world.facilityComponentsById[componentId as FacilityComponentId]; if (component !== undefined) { focus(component.facilityId); setActiveApp('facilities') } }}>Open selected Facility</button>
    <label>Date<input aria-label={`Date ${session.id}`} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label>Start<input aria-label={`Start ${session.id}`} type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
    <label>Minutes<input aria-label={`Minutes ${session.id}`} type="number" min={1} max={240} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
    <button type="button" onClick={() => run(() => schedule({ ...session, date: parseGameDate(date), startTime: time, durationMinutes: duration }))}>Reprogram session</button>
    <button type="button" onClick={() => run(() => cancel(session.id))}>Cancel session and release</button>
    {session.physicalAllocations?.map(item => <div key={item.id}><p>{item.id}: {item.status}; {item.history.map(event => `${event.onDate} ${event.reason}`).join('; ')}</p>
      {!['RELEASED', 'CANCELLED'].includes(item.status) && <button type="button" onClick={() => run(() => release(session.id, item.id))}>Release {item.id}</button>}
    </div>)}
    {notice !== null && <p role="alert">{notice}</p>}
  </article>
}
