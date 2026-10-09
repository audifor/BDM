import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { buildYouthFacilitiesContext } from '@/app/youth/YouthFacilitiesReadModel'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'
import { TrainingPhysicalExplanation } from '@/ui-ng/applications/training/TrainingPhysicalExplanation'

export function TalentFacilitiesContext({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const teams = buildYouthFacilitiesContext(world, teamId)
  return <section aria-label="Youth physical context" className="ng-canon__panel ng-holo-panel">
    <h2 className="ng-canon__title">Youth facilities and Training</h2>
    <p>Intake and registration follow existing talent rules. Physical availability applies to the Training operations that require it.</p>
    {teams.length === 0 && <p>No configured youth team in this organization.</p>}
    {teams.map(team => <div key={team.teamId}>
      <h3>{team.teamName}{team.category ? ` (${team.category})` : ''}</h3>
      <p>Physical information as of {team.date}. Operational capacity and occupancy are unknown.</p>
      {team.facilities.length === 0 && <p>Associated infrastructure is unknown. Missing information alone does not restrict intake or Training.</p>}
      <ul>{team.facilities.map(facility => <li key={facility.facilityId}>
        <strong>{facility.name}</strong>{facility.placeName ? ` at ${facility.placeName}` : ''}
        <ul>{facility.rights.map(right => <li key={right.id}>
          {right.teamId === team.teamId ? 'Youth Team right' : 'Organization right; does not grant Team access'}: {right.exclusivity}; {right.validFrom} to {right.validTo ?? 'open-ended'}
        </li>)}</ul>
        <ul>{facility.components.map(component => <li key={component.componentId}>
          {component.type}: {component.physical.status}; Team access: {component.physical.access ? 'verified' : 'unavailable for this component'};
          nominal capacity {component.physical.nominalCapacity ?? 'unknown'} {component.physical.capacityUnit ?? '(unit unknown)'}; operational capacity unknown
        </li>)}</ul>
      </li>)}</ul>
      {team.trainingAttempts.length === 0 ? <p>No recorded physical Training attempt for this youth team.</p> : <div>
        <h4>Recorded Training attempts</h4>
        {team.trainingAttempts.slice(0, 5).map(session => <div key={session.id}>
          <p>{session.definitionId}: {session.status}; scheduled {session.date}</p>
          <TrainingPhysicalExplanation world={world} attempt={session.physicalAttempt!} />
        </div>)}
      </div>}
    </div>)}
    <button className="ng-canon__action" type="button" onClick={() => syncWorkspaceAppQuery('facilities', 'push')}>Open Facilities</button>
  </section>
}
