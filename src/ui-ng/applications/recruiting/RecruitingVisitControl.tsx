import { useState } from 'react'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { recruitingFacilityOptions } from '@/app/youth/RecruitingFacilitiesReadModel'
import { useGameStore } from '@/stores/gameStore'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

export function RecruitingVisitControl({ world, teamId, cycleId, recruitId, run }: {
  world: GameWorld; teamId: TeamId; cycleId: string; recruitId: string; run: (command: () => string | null) => void
}) {
  const visit = useGameStore(state => state.performRecruitingAction)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [selected, setSelected] = useState('')
  const options = requestId === null ? [] : recruitingFacilityOptions(world, teamId)
  const option = options.find(item => item.key === selected)
  return <div>
    <button className="ng-canon__action" type="button" onClick={() => { setSelected(''); setRequestId(`manager-visit:${cycleId}:${recruitId}:${teamId}:${world.currentDate}:${Object.keys(world.recruitingVisitsById).length}`) }}>Visit</button>
    {requestId !== null && <fieldset aria-label="Confirm recruiting visit">
      <legend>Unofficial same-day visit</legend>
      <label>Optional facility demonstration
        <select aria-label="Optional facility demonstration" value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">No demonstration</option>
          {options.map(item => <option key={item.key} value={item.key}>{item.name}: {item.preview.physical.status}</option>)}
        </select>
      </label>
      {options.length === 0 && <p>Physical context is unknown. The visit can continue without a verified demonstration.</p>}
      {option && <p>{option.preview.physical.status}: {option.preview.physical.resources.map(resource => resource.reason).join(', ')}. This preview is not an executed activity. Physical failure affects only the demonstration.</p>}
      <p>No additional recruiting cost or automatic prospect bonus.</p>
      <button className="ng-canon__action" type="button" onClick={() => {
        run(() => visit(cycleId, recruitId, 'visit', { type: 'unofficial', startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 0, requestId,
          ...(option === undefined ? {} : { facilityDemonstration: option.selection }) }))
        setRequestId(null)
      }}>Confirm visit</button>
      <button className="ng-canon__action" type="button" onClick={() => setRequestId(null)}>Cancel visit</button>
      <button className="ng-canon__action" type="button" onClick={() => syncWorkspaceAppQuery('facilities', 'push')}>Open Facilities</button>
    </fieldset>}
  </div>
}

export function RecruitingVisitDemonstrations({ world, teamId, run }: { world: GameWorld; teamId: TeamId; run: (command: () => string | null) => void }) {
  const retry = useGameStore(state => state.retryRecruitingFacilityDemonstration)
  const visits = Object.values(world.recruitingVisitsById).filter(visit => visit.programTeamId === teamId && visit.facilityDemonstration !== undefined)
  const options = recruitingFacilityOptions(world, teamId)
  return <section aria-label="Recorded recruiting demonstrations">
    <h2>Recorded facility demonstrations</h2>
    {visits.length === 0 && <p>No selected demonstration has been executed or attempted.</p>}
    {visits.map(visit => {
      const demo = visit.facilityDemonstration!
      const last = demo.attempts.at(-1)!
      return <div key={visit.id}>
        <p>Visit {visit.id}; prospect {visit.recruitId}; Team {visit.programTeamId}; Organization {world.teams[visit.programTeamId]?.organizationId}; {demo.capability}</p>
        {demo.attempts.map((attempt, index) => <p key={index}>
          {attempt.physical.attemptedOn}: {attempt.result}; {attempt.physical.status}; {attempt.physical.resources.map(resource => `${resource.facilityId} / ${resource.componentId}: ${resource.reason}`).join(', ') || 'Physical evidence unknown'}
        </p>)}
        {last.result !== 'COMPLETED' && visit.date === world.currentDate && visit.legalStatus === 'allowed' && options.filter(option => option.selection.capability === demo.capability).map(option =>
          <button key={option.key} className="ng-canon__action" type="button" onClick={() => run(() => retry(visit.id, option.selection))}>Retry demonstration: {option.name}</button>)}
      </div>
    })}
  </section>
}
