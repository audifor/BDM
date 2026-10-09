import type { FacilityComponentId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { activePhysicalSessions } from '@/domain/world/GameWorld'
import type { ScheduledTrainingSession } from '@/domain/training'
import type { SportingPhysicalAttempt, SportingPhysicalRequirement } from '@/domain/facilities/SportingOperationPhysical'
import { physicalIntervalsOverlap } from '@/domain/facilities/PhysicalAllocation'
import { componentsPhysicallyOverlap, evaluatePhysicalAllocation, selectedTrainingDemand } from '@/engine/facilities/PhysicalAllocationEngine'
import { resolveSportingOperation } from '@/integration/facilitiesSporting/SportingOperationResolver'

export interface TrainingPhysicalConsumer {
  readonly session: ScheduledTrainingSession
  readonly requirements: readonly SportingPhysicalRequirement[]
  readonly operationId?: string
}
/** Consumption check only: never selects a resource, confirms a booking or publishes a world. */
export function resolveUnreservedTrainingConsumption(world: GameWorld, consumer: TrainingPhysicalConsumer,
  consumers: readonly TrainingPhysicalConsumer[]): SportingPhysicalAttempt {
  const { session, requirements } = consumer
  const selection = session.physicalAllocations?.at(-1)
  const attempt = resolveSportingOperation(world, { teamId: session.teamId, date: session.date, operationId: consumer.operationId ?? session.definitionId,
    requirements, ...(selection === undefined ? {} : { componentId: selection.componentId }) })
  if (requirements.length === 0) return attempt
  let unknown = false
  const resources = attempt.resources.map(resource => {
    const componentId = resource.componentId as FacilityComponentId
    const result = evaluatePhysicalAllocation(world, session, componentId, requirements)
    if (result.status === 'UNVERIFIED_PHYSICAL_CONTEXT') { unknown = true; return resource }
    let reason = result.reason
    // Pending requests have no iteration priority. Check other actual due consumers, not history.
    if (result.status === 'AVAILABLE') {
      const peers = consumers.filter(peer => peer.session.id !== session.id &&
        !peer.session.physicalAllocations?.some(item => item.status === 'CONFIRMED') &&
        physicalIntervalsOverlap(peer.session, session)).filter(peer => {
        const choice = peer.session.physicalAllocations?.find(item => ['PENDING', 'BLOCKED'].includes(item.status)) ?? peer.session.physicalAllocations?.at(-1)
        return (choice === undefined || componentsPhysicallyOverlap(world, choice.componentId, resource.componentId)) &&
          evaluatePhysicalAllocation(world, peer.session, componentId, peer.requirements).status === 'AVAILABLE'
      })
      const component = world.facilityComponentsById[componentId]!
      const mixedScopes = peers.some(peer => {
        const choice = peer.session.physicalAllocations?.find(item => ['PENDING', 'BLOCKED'].includes(item.status)) ?? peer.session.physicalAllocations?.at(-1)
        return choice !== undefined && choice.componentId !== resource.componentId
      })
      if (peers.length > 0 && (component.occupancySharing !== 'SHARED_CAPACITY' || mixedScopes)) reason = 'PENDING_PRIORITY_DECISION'
      else if (peers.length > 0) {
        const confirmed = activePhysicalSessions(world).flatMap(item => item.physicalAllocations ?? []).filter(item => item.sessionId !== session.id &&
          (item.status === 'CONFIRMED' || item.status === 'RELEASED' && item.history.at(-1)?.reason === 'TRAINING_EXECUTED') &&
          item.componentId === resource.componentId && physicalIntervalsOverlap(item, session))
        const claims = [...[session, ...peers.map(peer => peer.session)].map(item => ({ date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes, demand: selectedTrainingDemand(item)! })),
          ...confirmed.map(item => ({ ...item, demand: selectedTrainingDemand(world.scheduledTrainingSessionsById[item.sessionId]!) ?? item.demand! }))]
        const minute = (item: { date: string; startTime: string }) => Date.parse(`${item.date}T${item.startTime}:00Z`) / 60000
        const from = minute(session), to = from + session.durationMinutes
        const events = claims.flatMap(item => [{ at: Math.max(from, minute(item)), delta: item.demand }, { at: Math.min(to, minute(item) + item.durationMinutes), delta: -item.demand }]).sort((a,b) => a.at-b.at || a.delta-b.delta)
        let usage = 0
        for (const event of events) { usage += event.delta; if (usage > result.capacity!) reason = 'PENDING_PRIORITY_DECISION' }
      }
    }
    return { ...resource, status: reason === 'PENDING_PRIORITY_DECISION' || result.status === 'BLOCKED' ? 'VERIFIED_UNAVAILABLE' as const : result.status === 'AVAILABLE' ? 'VERIFIED_AVAILABLE' as const : 'UNVERIFIED_PHYSICAL_CONTEXT' as const, reason: result.status === 'BLOCKED' && resource.status === 'VERIFIED_UNAVAILABLE' ? resource.reason : reason }
  })
  // Unknown candidates do not prove that the operation must consume an occupied resource.
  const conflict = resources.some(resource => ['RESOURCE_OCCUPIED', 'PENDING_PRIORITY_DECISION'].includes(resource.reason))
  const status = resources.length === 0 || unknown ? attempt.status : conflict ? 'VERIFIED_UNAVAILABLE' : resources.some(resource => resource.status === 'VERIFIED_AVAILABLE') ? 'VERIFIED_AVAILABLE' : 'VERIFIED_UNAVAILABLE'
  return { ...attempt, status, resources }
}
