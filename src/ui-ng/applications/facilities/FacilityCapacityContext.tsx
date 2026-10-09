import { useMemo } from 'react'
import { buildFacilityCapacityContext } from '@/app/facilities/FacilityCapacityReadModel'
import type { GameWorld } from '@/domain/world'
import type { FacilityId, TeamId } from '@/domain/ids'

export function FacilityCapacityContext({ world, teamId, facilityId }: {
  readonly world: GameWorld; readonly teamId: TeamId; readonly facilityId?: FacilityId
}) {
  const context = useMemo(() => buildFacilityCapacityContext(world, teamId, facilityId), [world, teamId, facilityId])
  return <section className="ng-canon__panel ng-holo-panel" aria-label="Capacity and shared Training timetable">
    <h3>Capacity and shared Training timetable</h3>
    <p>Operating capacity: unverified. Simultaneous demand and resource assignments are not recorded. Availability is not guaranteed by nominal capacity.</p>
    <p>Physical facts as of {context.asOf}. Scheduled Training: {context.asOf} to {context.weekEnd}.</p>
    {context.components.length === 0 ? <p>No component is recorded in this scope.</p> : <ul>
      {context.components.map(component => <li key={component.componentId}>
        {component.name}: nominal capacity {component.nominalCapacity ?? 'unknown'}; unit {component.capacityUnit ?? 'unknown'};
        {' '}physical state {component.status}; Team access {component.access ? 'valid' : 'not recorded'}.
        {component.affectedProjectIds.length > 0 && ` Affected work: ${component.affectedProjectIds.join(', ')}.`}
      </li>)}
    </ul>}
    <p>Training venues are unassigned. Listed rights establish access only; priorities do not allocate sessions.</p>
    {context.sessions.length === 0 ? <p>No pending session in this seven-day window.</p> : <ul>
      {context.sessions.map(session => <li key={session.sessionId}>
        {session.teamName}: {session.date} {session.startTime}, {session.durationMinutes} minutes;
        {' '}{session.scope} / {session.definitionId} ({session.sessionId}).
        {session.targetPlayerId !== null && ` Target PlayerId: ${session.targetPlayerId}.`}
        {' '}Components covered by dated Team rights: {session.entitledComponentIds.join(', ') || 'none recorded'}.
      </li>)}
    </ul>}
    <p>Potential shared-use overlaps are timetable observations, not confirmed resource conflicts or reservations.</p>
    <ul>{context.overlaps.map(overlap => <li key={overlap.sessionIds.join('|')}>
      Timetable overlap: {overlap.sessionIds.join(' / ')}; common access: {overlap.entitledComponentIds.join(', ')}. Resource conflict unverified.
    </li>)}</ul>
    <p>Quantitative allocation requires approved demand, operating capacity, assignment and conflict-resolution rules.</p>
  </section>
}
