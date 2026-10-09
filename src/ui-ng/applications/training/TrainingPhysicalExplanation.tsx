import type { GameWorld } from '@/domain/world'
import type { SportingPhysicalAttempt } from '@/domain/facilities/SportingOperationPhysical'

export function TrainingPhysicalExplanation({ world, attempt }: { readonly world: GameWorld; readonly attempt: SportingPhysicalAttempt }) {
  return <div>
    <p><strong>Physical context</strong> {attempt.status}{' · '}{attempt.operationId}{' · '}{attempt.attemptedOn}</p>
    {attempt.status === 'VERIFIED_UNAVAILABLE' && <p>Session not executed: no development stimulus, session fatigue, morale or cohesion effect. Restore a compatible resource or access in Facilities, then reschedule in Training.</p>}
    {attempt.status === 'UNVERIFIED_PHYSICAL_CONTEXT' && <p>Training continues with existing rules. Physical availability is unverified.</p>}
    <ul>{attempt.resources.map((resource) => <li key={`${resource.componentId}:${resource.capability}`}>
      {world.facilitiesById[resource.facilityId as never]?.canonicalName ?? resource.facilityId}{' · '}{resource.componentId}{' · '}{resource.capability}{' · '}{resource.reason}{' · '}{resource.status}
      {' · '}nominal capacity {resource.nominalCapacity ?? 'unknown'} {resource.capacityUnit ?? '(unit unknown)'}; operational capacity unknown
    </li>)}</ul>
  </div>
}
