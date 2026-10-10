import { allocationOwnerKey, allPhysicalAllocations, equippedMedicalActs } from '@/domain/facilities/PhysicalConsumer'
import { physicalComponentsOverlap } from '@/domain/facilities/PhysicalComponentScope'
import { activePhysicalSessions } from '@/domain/world/GameWorld'
import { addDays } from '@/domain/date'
import type { FacilityComponentId } from '@/domain/ids'
import { createPhysicalAllocation, physicalIntervalsOverlap, type PhysicalAllocation, type PhysicalAllocationStatus } from '@/domain/facilities/PhysicalAllocation'
import type { SportingPhysicalRequirement } from '@/domain/facilities/SportingOperationPhysical'
import type { ScheduledTrainingSession } from '@/domain/training'
import { findCollidingSession, trainingDefinitionById } from '@/domain/training'
import { canTeamTrainOnDate } from '@/engine/training/TrainingEngine'
import { createScheduledTrainingSession } from '@/domain/training/TrainingSchedule'
import { updateGameWorld, updateScheduledTrainingSessionRecord, type GameWorld } from '@/domain/world'
import { componentPhysicalAvailabilityAt } from './FacilityPhysicalOperations'
import { resolveSportingOperation } from '@/integration/facilitiesSporting/SportingOperationResolver'
import { trainingPhysicalRequirements } from '@/engine/training/TrainingPhysicalRequirements'

export const physicalAllocations = allPhysicalAllocations
export function selectedTrainingDemand(session: ScheduledTrainingSession): number | null {
  return session.scope === 'individual' ? 1 : session.selectedPlayerIds === undefined ? null : new Set(session.selectedPlayerIds).size
}
export function componentsPhysicallyOverlap(world: GameWorld, a: string, b: string): boolean {
  return physicalComponentsOverlap(world.facilityComponentsById, a, b)
}
const startMinute = (item: Pick<PhysicalAllocation, 'date' | 'startTime'>) => Date.parse(`${item.date}T${item.startTime}:00Z`) / 60000
/** Recomputed facts only. Never grants rights, moves a session or confirms a booking. */
export function evaluatePhysicalAllocation(world: GameWorld, session: ScheduledTrainingSession, componentId: FacilityComponentId,
  requirements = trainingPhysicalRequirements(trainingDefinitionById(session.definitionId)), includePending = false) {
  const demand = selectedTrainingDemand(session)
  const component = world.facilityComponentsById[componentId]
  const result = (status: 'AVAILABLE' | 'BLOCKED' | 'UNVERIFIED_PHYSICAL_CONTEXT', reason: string, capacity: number | null = null, occupancy: number | null = null) => ({ status, reason, capacity, occupancy, demand })
  if (requirements.length === 0) return result('UNVERIFIED_PHYSICAL_CONTEXT', 'NO_APPROVED_PHYSICAL_REQUIREMENT')
  if (component === undefined) return result('BLOCKED', 'COMPONENT_NOT_FOUND')
  if (typeof session.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(session.startTime) || !Number.isInteger(session.durationMinutes) || session.durationMinutes < 1) return result('UNVERIFIED_PHYSICAL_CONTEXT', 'UNKNOWN_INTERVAL')
  if (session.selectedPlayerIds?.some(id => !world.teams[session.teamId]!.rosterPlayerIds.includes(id))) return result('BLOCKED', 'PARTICIPANTS_NO_LONGER_ASSIGNED')
  const endMinute = Number(session.startTime.slice(0, 2)) * 60 + Number(session.startTime.slice(3)) + session.durationMinutes
  const endDate = endMinute > 1440 ? addDays(session.date, 1) : session.date
  const physical = componentPhysicalAvailabilityAt(world, componentId, session.date, session.teamId)
  const endPhysical = componentPhysicalAvailabilityAt(world, componentId, endDate, session.teamId)
  if (!physical.access || !endPhysical.access) return result('BLOCKED', 'NO_ACCESS_DURING_INTERVAL')
  if (physical.status === 'OUT_OF_SERVICE' || endPhysical.status === 'OUT_OF_SERVICE') return result('BLOCKED', physical.affectedProjectIds.length > 0 || endPhysical.affectedProjectIds.length > 0 ? 'PHYSICAL_WORK' : 'OUT_OF_SERVICE', 0)
  // A booking of a component overlaps its ancestors/descendants physically, including scoped work.
  const related = Object.values(world.facilityComponentsById).filter(item => item.id !== componentId && componentsPhysicallyOverlap(world, item.id, componentId))
  if (related.some(item => [session.date, endDate].some(date => componentPhysicalAvailabilityAt(world, item.id, date).affectedProjectIds.length > 0))) return result('BLOCKED', 'PHYSICAL_WORK', 0)
  const sporting = resolveSportingOperation(world, { teamId: session.teamId, date: session.date, operationId: session.definitionId, requirements, componentId })
  if (sporting.status === 'VERIFIED_UNAVAILABLE') return result('BLOCKED', sporting.resources[0]?.reason ?? 'INCOMPATIBLE_RESOURCE')
  const knownOccupation = evaluatePhysicalOccupation(world, { ...session, ownerKey: `TRAINING:${session.id}` }, componentId, includePending)
  if (knownOccupation.status === 'BLOCKED') return result('BLOCKED', knownOccupation.reason)
  if (knownOccupation.status === 'UNVERIFIED_PHYSICAL_CONTEXT') return result('UNVERIFIED_PHYSICAL_CONTEXT', knownOccupation.reason)
  if (sporting.status === 'UNVERIFIED_PHYSICAL_CONTEXT' || physical.status !== 'AVAILABLE' || endPhysical.status !== 'AVAILABLE') return result('UNVERIFIED_PHYSICAL_CONTEXT', 'UNKNOWN_OR_LIMITED_OPERATING_CAPACITY')
  if (demand === null) return result('UNVERIFIED_PHYSICAL_CONTEXT', 'UNKNOWN_DEMAND')
  if (physical.capacityUnit !== 'SIMULTANEOUS_PLAYERS' || physical.nominalCapacity === null) return result('UNVERIFIED_PHYSICAL_CONTEXT', physical.capacityUnit === null ? 'UNKNOWN_CAPACITY_UNIT' : 'INCOMPATIBLE_CAPACITY_UNIT')
  const capacity = physical.nominalCapacity
  if (demand > capacity) return result('BLOCKED', 'INSUFFICIENT_CAPACITY', capacity)
  const occupied = (includePending ? physicalAllocations(world).filter(item => item.consumer === undefined) : activePhysicalSessions(world).flatMap(session => session.physicalAllocations ?? [])).map(item => ({ ...item, demand: selectedTrainingDemand(world.scheduledTrainingSessionsById[item.sessionId]!) ?? item.demand })).filter(item => item.sessionId !== session.id && (item.status === 'CONFIRMED' || includePending && item.status === 'PENDING' || item.status === 'RELEASED' && item.history.at(-1)?.reason === 'TRAINING_EXECUTED') && physicalIntervalsOverlap(item, session) && componentsPhysicallyOverlap(world, item.componentId, componentId))
  if (occupied.length > 0 && (component.occupancySharing !== 'SHARED_CAPACITY' || occupied.some(item => item.componentId !== componentId || item.unit !== 'SIMULTANEOUS_PLAYERS'))) return result('BLOCKED', 'RESOURCE_OCCUPIED', capacity)
  const from = startMinute(session), to = from + session.durationMinutes
  const events = occupied.flatMap(item => [
    { at: Math.max(from, startMinute(item)), delta: item.demand! },
    { at: Math.min(to, startMinute(item) + item.durationMinutes), delta: -item.demand! },
  ]).sort((a, b) => a.at - b.at || a.delta - b.delta)
  let usage = 0, peak = 0
  for (const event of events) { usage += event.delta; peak = Math.max(peak, usage) }
  return peak + demand > capacity ? result('BLOCKED', 'RESOURCE_OCCUPIED', capacity, peak) : result('AVAILABLE', 'AVAILABLE', capacity, peak)
}
export function allocationAlternatives(world: GameWorld, session: ScheduledTrainingSession) {
  return Object.values(world.facilityComponentsById).filter(component => evaluatePhysicalAllocation(world, session, component.id, undefined, true).status === 'AVAILABLE').map(component => component.id).sort()
}
/** Suggested starts come only from recorded occupancy endpoints, never invented opening hours. */
export function allocationTimeAlternatives(world: GameWorld, session: ScheduledTrainingSession, componentId: FacilityComponentId) {
  const starts = physicalAllocations(world).filter(item => allocationOwnerKey(item) !== `TRAINING:${session.id}` && (item.status === 'CONFIRMED' || item.status === 'RELEASED' && ['TRAINING_EXECUTED', 'MEDICAL_EXECUTED'].includes(item.history.at(-1)?.reason ?? '')) && physicalIntervalsOverlap(item, session) && componentsPhysicallyOverlap(world, item.componentId, componentId)).map(item => {
    const end = Number(item.startTime.slice(0, 2)) * 60 + Number(item.startTime.slice(3)) + item.durationMinutes
    const date = end >= 1440 ? addDays(item.date, 1) : item.date
    const minutes = end % 1440
    return { date, startTime: `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}` }
  })
  const unique = new Map(starts.map(start => [`${start.date}:${start.startTime}`, start]))
  return [...unique.values()].filter(start => {
    const candidate = { ...session, ...start }
    return start.date > world.currentDate && canTeamTrainOnDate(world, session.teamId, start.date) && findCollidingSession(candidate, Object.values(world.scheduledTrainingSessionsById)) === undefined && evaluatePhysicalAllocation(world, candidate, componentId, undefined, true).status === 'AVAILABLE'
  }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
}
export function transitionPhysicalAllocation(item: PhysicalAllocation, status: PhysicalAllocationStatus, reason: string, world: GameWorld): PhysicalAllocation {
  if (item.status === status && item.history.at(-1)?.reason === reason) return item
  return createPhysicalAllocation({ ...item, status, history: [...item.history, { onDate: world.currentDate, status, reason }] })
}
/** Manager command: evaluation and confirmation use one current world and publish once. */
export function requestTrainingPhysicalAllocation(world: GameWorld, input: { readonly sessionId: string; readonly componentId: FacilityComponentId; readonly requestId: string; readonly confirm?: boolean }) {
  const session = world.scheduledTrainingSessionsById[input.sessionId]
  if (session === undefined || session.status !== 'scheduled' || session.date < world.currentDate || !input.requestId.trim()) throw new RangeError('Physical allocation requires an active Training session and request identity')
  const id = `${session.id}:physical:${input.requestId}`
  const previous = session.physicalAllocations?.find(item => item.id === id)
  if (previous !== undefined && (previous.componentId !== input.componentId || previous.date !== session.date || previous.startTime !== session.startTime || previous.durationMinutes !== session.durationMinutes)) throw new RangeError('Physical request identity cannot be reused for another selection/interval')
  if (previous !== undefined && ['CONFIRMED', 'RELEASED', 'CANCELLED'].includes(previous.status)) return world
  const evaluation = evaluatePhysicalAllocation(world, session, input.componentId)
  const unresolved = evaluation.status === 'AVAILABLE' && physicalAllocations(world).some(item => allocationOwnerKey(item) !== `TRAINING:${session.id}` && item.status === 'PENDING' && physicalIntervalsOverlap(item, session) && componentsPhysicallyOverlap(world, item.componentId, input.componentId)) && evaluatePhysicalAllocation(world, session, input.componentId, undefined, true).status !== 'AVAILABLE'
  const status: PhysicalAllocationStatus = input.confirm !== true ? 'PENDING' : evaluation.status === 'AVAILABLE' && !unresolved ? 'CONFIRMED' : evaluation.status === 'UNVERIFIED_PHYSICAL_CONTEXT' || unresolved ? 'PENDING' : 'BLOCKED'
  const reason = unresolved ? 'PENDING_PRIORITY_DECISION' : evaluation.reason
  if (previous?.status === status && previous.history.at(-1)?.reason === reason && previous.demand === evaluation.demand) return world
  const item = createPhysicalAllocation({ id, sessionId: session.id, teamId: session.teamId, facilityId: world.facilityComponentsById[input.componentId]?.facilityId ?? null,
    componentId: input.componentId, date: session.date, startTime: session.startTime, durationMinutes: session.durationMinutes,
    demand: evaluation.demand, unit: evaluation.demand === null ? null : 'SIMULTANEOUS_PLAYERS', status,
    ...(status === 'CONFIRMED' ? { capacityAtConfirmation: evaluation.capacity!, sharingAtConfirmation: world.facilityComponentsById[input.componentId]!.occupancySharing ?? 'EXCLUSIVE' } : {}),
    history: [...(previous?.history ?? []), { onDate: world.currentDate, status, reason }],
  })
  const allocations = (session.physicalAllocations ?? []).filter(existing => existing.id !== id).map(existing => status === 'CONFIRMED' && ['CONFIRMED', 'PENDING', 'BLOCKED'].includes(existing.status) ? transitionPhysicalAllocation(existing, 'RELEASED', 'MANAGER_REPLACED', world) : existing)
  return updateGameWorld(world, { scheduledTrainingSessionsById: updateScheduledTrainingSessionRecord(world.scheduledTrainingSessionsById, { ...session, physicalAllocations: [...allocations, item] }) })
}
export function releaseTrainingPhysicalAllocation(world: GameWorld, sessionId: string, allocationId: string): GameWorld {
  const session = world.scheduledTrainingSessionsById[sessionId]
  if (session === undefined) throw new RangeError('Training session not found')
  const allocations = session.physicalAllocations?.map(item => item.id === allocationId && !['RELEASED', 'CANCELLED'].includes(item.status) ? transitionPhysicalAllocation(item, 'RELEASED', 'MANAGER_RELEASED', world) : item)
  if (allocations === undefined || allocations.every((item, i) => item === session.physicalAllocations![i])) return world
  return updateGameWorld(world, { scheduledTrainingSessionsById: updateScheduledTrainingSessionRecord(world.scheduledTrainingSessionsById, { ...session, physicalAllocations: allocations }) })
}
/** Caller supplies the canonical sport-scheduled candidate; a failed move leaves old booking intact. */
export function reallocateRescheduledTraining(world: GameWorld, candidate: ScheduledTrainingSession): ScheduledTrainingSession {
  const previous = world.scheduledTrainingSessionsById[candidate.id]
  const confirmed = previous?.physicalAllocations?.find(item => item.status === 'CONFIRMED')
  if (confirmed === undefined) return previous?.physicalAllocations === undefined ? candidate : { ...candidate, physicalAllocations: previous.physicalAllocations }
  const changed = candidate.date !== previous!.date || candidate.startTime !== previous!.startTime || candidate.durationMinutes !== previous!.durationMinutes
  if (!changed) return { ...candidate, physicalAllocations: previous!.physicalAllocations }
  const result = evaluatePhysicalAllocation(world, candidate, confirmed.componentId, undefined, true)
  if (result.status !== 'AVAILABLE') throw new RangeError(`Rescheduling preserves previous reservation: ${result.reason}`)
  const id = `${confirmed.id}:move:${candidate.date}:${candidate.startTime}:${candidate.durationMinutes}`
  return createScheduledTrainingSession({ ...candidate, physicalAllocations: [
    ...previous!.physicalAllocations!.map(item => ['CONFIRMED', 'PENDING', 'BLOCKED'].includes(item.status) ? transitionPhysicalAllocation(item, 'RELEASED', 'RESCHEDULED', world) : item),
    createPhysicalAllocation({ ...confirmed, id, date: candidate.date, startTime: candidate.startTime, durationMinutes: candidate.durationMinutes, demand: result.demand, capacityAtConfirmation: result.capacity!, sharingAtConfirmation: world.facilityComponentsById[confirmed.componentId]!.occupancySharing ?? 'EXCLUSIVE',
      history: [{ onDate: world.currentDate, status: 'CONFIRMED', reason: 'MANAGER_RESCHEDULED' }] }),
  ] })
}

/** Shared C1 occupation check, independent of clinical/sporting material requirements and units. */
export function evaluatePhysicalOccupation(world: GameWorld, interval: { date: import('@/domain/date').GameDate; startTime: string; durationMinutes: number; ownerKey: string }, componentId: FacilityComponentId, includePending = false) {
  const ownConfirmed = allPhysicalAllocations(world).some(item => allocationOwnerKey(item) === interval.ownerKey && item.status === 'CONFIRMED' && item.componentId === componentId && item.date === interval.date && item.startTime === interval.startTime && item.durationMinutes === interval.durationMinutes)
  const claims = allPhysicalAllocations(world).filter(item => allocationOwnerKey(item) !== interval.ownerKey &&
    (item.status === 'CONFIRMED' || item.status === 'RELEASED' && ['TRAINING_EXECUTED', 'MEDICAL_EXECUTED'].includes(item.history.at(-1)?.reason ?? '') || includePending && !ownConfirmed && item.status === 'PENDING') &&
    physicalIntervalsOverlap(item, interval) && componentsPhysicallyOverlap(world, item.componentId, componentId))
  const component = world.facilityComponentsById[componentId]
  const exclusive = claims.some(item => item.sharingAtConfirmation === 'EXCLUSIVE' || world.facilityComponentsById[item.componentId]?.occupancySharing === 'EXCLUSIVE' || item.componentId !== componentId)
  if (claims.length && (component?.occupancySharing === 'EXCLUSIVE' || exclusive)) return { status: 'BLOCKED' as const, reason: includePending && claims.every(item => item.status === 'PENDING') ? 'PENDING_PRIORITY_DECISION' : 'RESOURCE_OCCUPIED' }
  // No priority for unreserved due Medical consumers either; explicit selection remains meaningful after release.
  if (!ownConfirmed && (includePending || interval.date === world.currentDate)) {
    const unreserved = equippedMedicalActs(world).some(act => {
      const selection = act.physicalAllocations?.at(-1)
      return `MEDICAL:${act.id}` !== interval.ownerKey && ['SCHEDULED', 'BLOCKED'].includes(act.status) && act.interval && selection && !act.physicalAllocations?.some(item => item.status === 'CONFIRMED') && physicalIntervalsOverlap(act.interval, interval) && componentsPhysicallyOverlap(world, selection.componentId, componentId) && (component?.occupancySharing === 'EXCLUSIVE' || world.facilityComponentsById[selection.componentId]?.occupancySharing === 'EXCLUSIVE' || selection.componentId !== componentId)
    })
    if (unreserved) return { status: 'BLOCKED' as const, reason: 'PENDING_PRIORITY_DECISION' }
  }
  if (!ownConfirmed && interval.ownerKey.startsWith('MEDICAL:') && (includePending || interval.date === world.currentDate)) {
    const dueTraining = Object.values(world.scheduledTrainingSessionsById).some(session => {
      if (session.status !== 'scheduled' || session.physicalAllocations?.some(item => item.status === 'CONFIRMED') || !physicalIntervalsOverlap(session, interval)) return false
      const selection = session.physicalAllocations?.at(-1)
      const attempt = resolveSportingOperation(world, { teamId: session.teamId, date: session.date, operationId: session.definitionId, requirements: trainingPhysicalRequirements(trainingDefinitionById(session.definitionId)), ...(selection === undefined ? {} : { componentId: selection.componentId }) })
      return attempt.resources.some(resource => ['VERIFIED_AVAILABLE', 'VERIFIED_LIMITED'].includes(resource.status) && componentsPhysicallyOverlap(world, resource.componentId, componentId) && (component?.occupancySharing === 'EXCLUSIVE' || world.facilityComponentsById[resource.componentId as FacilityComponentId]?.occupancySharing === 'EXCLUSIVE' || resource.componentId !== componentId))
    })
    if (dueTraining) return { status: 'BLOCKED' as const, reason: 'PENDING_PRIORITY_DECISION' }
  }
  if (claims.some(item => item.unit === null)) return { status: 'UNVERIFIED_PHYSICAL_CONTEXT' as const, reason: 'QUANTITATIVE_OCCUPANCY_UNVERIFIED' }
  return { status: 'AVAILABLE' as const, reason: 'NO_KNOWN_INCOMPATIBLE_OCCUPANCY' }
}

export function physicalComponentAffectedByWorks(world: GameWorld, componentId: FacilityComponentId, date: import('@/domain/date').GameDate): boolean {
  return Object.values(world.facilityComponentsById).some(item => componentsPhysicallyOverlap(world, item.id, componentId) && componentPhysicalAvailabilityAt(world, item.id, date).affectedProjectIds.length > 0)
}
