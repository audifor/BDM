import { equippedMedicalActs } from '@/domain/facilities/PhysicalConsumer'
import { usableComponentsForTeamAt } from '@/domain/facilities/FacilityQueries'
import { addDays } from '@/domain/date'
import type { FacilityComponentId, InjuryId, StaffPersonId } from '@/domain/ids'
import { injuryLifecycleStatus, createInjury } from '@/domain/injury'
import { createEquippedRehabilitationAct, type EquippedRehabilitationAct, type EquippedMedicalStatus } from '@/domain/injury/EquippedRehabilitationAct'
import { createPhysicalAllocation } from '@/domain/facilities/PhysicalAllocation'
import { componentSupportsCapability } from '@/domain/facilities/FacilityComponentCapability'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { evaluatePhysicalOccupation, transitionPhysicalAllocation, physicalComponentAffectedByWorks } from '@/engine/facilities/PhysicalAllocationEngine'
import { clinicalAuthorizationAt } from './ClinicalAuthorization'

export const equippedActs = equippedMedicalActs
function store(world: GameWorld, act: EquippedRehabilitationAct): GameWorld {
  const injury = world.injuriesById[act.injuryId]!
  const canonical = createEquippedRehabilitationAct(act)
  return updateGameWorld(world, { injuries: Object.values(world.injuriesById).map(item => item.id === injury.id ? createInjury({ ...injury, equippedRehabilitationActs: [...(injury.equippedRehabilitationActs ?? []).filter(item => item.id !== act.id), canonical] }) : item) })
}
function event(world: GameWorld, act: EquippedRehabilitationAct, status: EquippedMedicalStatus, reason: string) {
  return act.status === status && act.history.at(-1)?.reason === reason ? act : { ...act, status, history: [...act.history, { onDate: world.currentDate, status, reason }] }
}
function find(world: GameWorld, id: string) { const act = equippedActs(world).find(item => item.id === id); if (!act) throw new RangeError('Medical act not found'); return act }
function eligible(world: GameWorld, act: Pick<EquippedRehabilitationAct, 'injuryId' | 'playerId' | 'teamId'>) {
  const injury = world.injuriesById[act.injuryId]
  return injury && injury.injuredOn <= world.currentDate && injuryLifecycleStatus(injury, world.currentDate) === 'RECOVERING' && world.teams[act.teamId]?.rosterPlayerIds.includes(act.playerId)
}
/** Explicit clinician command. Coach access, advisory outcomes and plan modes are insufficient. */
export function indicateEquippedRehabilitation(world: GameWorld, input: { id: string; injuryId: InjuryId; prescribingStaffId: StaffPersonId; requiredEquipmentTags: readonly string[] }): GameWorld {
  const previous = equippedActs(world).find(item => item.id === input.id)
  if (previous) {
    if (previous.injuryId !== input.injuryId || previous.prescribingStaffId !== input.prescribingStaffId || JSON.stringify(previous.requiredEquipmentTags) !== JSON.stringify(input.requiredEquipmentTags)) throw new RangeError('Medical identity cannot be reused')
    return world
  }
  const injury = world.injuriesById[input.injuryId]
  const team = injury && Object.values(world.teams).find(item => item.rosterPlayerIds.includes(injury.playerId))
  if (!injury || !team || !injury.rehabilitation || !eligible(world, { injuryId: injury.id, playerId: injury.playerId, teamId: team.id })) throw new RangeError('No eligible recovering rehabilitation episode')
  const authorization = clinicalAuthorizationAt(world, input.prescribingStaffId, team.id, 'INDICATE', world.currentDate)
  if (!authorization.ok) throw new RangeError(authorization.reason)
  return store(world, { id: input.id, kind: 'EQUIPPED_REHABILITATION_SESSION', injuryId: injury.id, episodeStartedOn: injury.rehabilitation.startedOn, playerId: injury.playerId, teamId: team.id, indicatedOn: world.currentDate, prescribingStaffId: input.prescribingStaffId, prescribingAuthorizationId: authorization.authorizationId, indicationEvidence: authorization.indicationEvidence, requiredEquipmentTags: input.requiredEquipmentTags, status: 'INDICATED', history: [{ onDate: world.currentDate, status: 'INDICATED', reason: 'EXPLICIT_CLINICAL_INDICATION' }] })
}
export function evaluateEquippedRehabilitation(world: GameWorld, act: EquippedRehabilitationAct, componentId: FacilityComponentId, includePending = false) {
  const result = (status: 'VERIFIED_AVAILABLE' | 'VERIFIED_LIMITED' | 'VERIFIED_UNAVAILABLE' | 'UNVERIFIED_PHYSICAL_CONTEXT', reason: string) => ({ status, reason })
  if (!act.interval || !act.performingStaffId) return result('UNVERIFIED_PHYSICAL_CONTEXT', 'EXPLICIT_INTERVAL_AND_PROFESSIONAL_REQUIRED')
  const interval = act.interval, component = world.facilityComponentsById[componentId]
  if (!component || !componentSupportsCapability(component, 'PHYSIOTHERAPY')) return result('VERIFIED_UNAVAILABLE', 'PHYSIOTHERAPY_COMPONENT_REQUIRED')
  const end = Number(interval.startTime.slice(0, 2)) * 60 + Number(interval.startTime.slice(3)) + interval.durationMinutes
  const dates = end > 1440 ? [interval.date, addDays(interval.date, 1)] : [interval.date]
  for (const date of dates) {
    const professional = clinicalAuthorizationAt(world, act.performingStaffId, act.teamId, 'PERFORM', date)
    if (!professional.ok) return result('VERIFIED_UNAVAILABLE', professional.reason)
    const physical = componentPhysicalAvailabilityAt(world, componentId, date, act.teamId)
    const medicalAccess = usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById).filter(right => right.purpose === 'MEDICAL'), Object.values(world.facilityComponentsById), act.teamId, date).includes(componentId)
    if (!physical.access || !medicalAccess) return result('VERIFIED_UNAVAILABLE', 'NO_ACCESS_DURING_INTERVAL')
    if (physical.status === 'OUT_OF_SERVICE') return result('VERIFIED_UNAVAILABLE', physical.affectedProjectIds.length ? 'PHYSICAL_WORK' : 'OUT_OF_SERVICE')
    if (physicalComponentAffectedByWorks(world, componentId, date)) return result('VERIFIED_UNAVAILABLE', 'PHYSICAL_WORK')
    const equipment = component.rehabilitationEquipmentEvidence
    if (!equipment || equipment.validFrom > date || equipment.validTo < date || equipment.functionality === 'UNKNOWN') return result('UNVERIFIED_PHYSICAL_CONTEXT', 'EQUIPMENT_NOT_VERIFIED')
    if (['INCOMPATIBLE', 'OUT_OF_SERVICE'].includes(equipment.functionality) || act.requiredEquipmentTags.some(tag => !component.equipmentTags.includes(tag) || !equipment.equipmentTags.includes(tag))) return result('VERIFIED_UNAVAILABLE', 'INCOMPATIBLE_OR_UNSERVICEABLE_EQUIPMENT')
    if (physical.status === 'LIMITED' && equipment.functionality !== 'LIMITED_COMPATIBLE') return result('UNVERIFIED_PHYSICAL_CONTEXT', 'LIMITED_FUNCTION_NOT_VERIFIED')
    if (physical.status === 'UNKNOWN') return result('UNVERIFIED_PHYSICAL_CONTEXT', 'PHYSICAL_CONTEXT_UNKNOWN')
  }
  const occupation = evaluatePhysicalOccupation(world, { ...interval, ownerKey: `MEDICAL:${act.id}` }, componentId, includePending)
  if (occupation.status === 'BLOCKED') return result('VERIFIED_UNAVAILABLE', occupation.reason)
  return result(component.rehabilitationEquipmentEvidence?.functionality === 'LIMITED_COMPATIBLE' || dates.some(date => componentPhysicalAvailabilityAt(world, componentId, date, act.teamId).status === 'LIMITED') ? 'VERIFIED_LIMITED' : 'VERIFIED_AVAILABLE', 'MATERIAL_REQUIREMENTS_VERIFIED')
}
/** One atomic command; failed reprogramming never releases an earlier confirmed reservation. */
export function scheduleEquippedRehabilitation(world: GameWorld, input: { actId: string; interval: NonNullable<EquippedRehabilitationAct['interval']>; performingStaffId: StaffPersonId; componentId: FacilityComponentId; requestId: string; confirm: boolean }): GameWorld {
  const act = find(world, input.actId)
  const id = `${act.id}:physical:${input.requestId}`
  const previous = act.physicalAllocations?.find(item => item.id === id)
  if (previous && (previous.componentId !== input.componentId || previous.date !== input.interval.date || previous.startTime !== input.interval.startTime || previous.durationMinutes !== input.interval.durationMinutes || act.performingStaffId !== input.performingStaffId)) throw new RangeError('Medical request identity cannot be reused')
  if (previous && ['CONFIRMED', 'RELEASED', 'CANCELLED'].includes(previous.status)) return world
  if (['COMPLETED', 'CANCELLED'].includes(act.status) || !eligible(world, act) || input.interval.date <= world.currentDate || !input.requestId.trim()) throw new RangeError('Medical act cannot be scheduled')
  const candidate = createEquippedRehabilitationAct({ ...event(world, act, 'SCHEDULED', 'MANAGER_SCHEDULE_REQUEST'), interval: input.interval, performingStaffId: input.performingStaffId })
  const selection = act.physicalAllocations?.find(item => item.status === 'CONFIRMED')
  const changed = selection && (selection.componentId !== input.componentId || JSON.stringify(act.interval) !== JSON.stringify(input.interval) || act.performingStaffId !== input.performingStaffId)
  const evaluation = evaluateEquippedRehabilitation(world, candidate, input.componentId, true)
  if (changed && !['VERIFIED_AVAILABLE', 'VERIFIED_LIMITED'].includes(evaluation.status)) throw new RangeError(`Rescheduling preserves previous reservation: ${evaluation.reason}`)
  const component = world.facilityComponentsById[input.componentId]
  const verified = ['VERIFIED_AVAILABLE', 'VERIFIED_LIMITED'].includes(evaluation.status)
  const status = !input.confirm ? 'PENDING' : verified && component?.occupancySharing === 'EXCLUSIVE' ? 'CONFIRMED' : evaluation.status === 'VERIFIED_UNAVAILABLE' ? 'BLOCKED' : 'PENDING'
  const reason = verified && status === 'PENDING' && input.confirm ? 'QUANTITATIVE_CAPACITY_UNVERIFIED' : evaluation.reason
  if (previous?.status === status && previous.history.at(-1)?.reason === reason && JSON.stringify(act.interval) === JSON.stringify(input.interval) && act.performingStaffId === input.performingStaffId) return world
  const allocation = createPhysicalAllocation({ id, consumer: { kind: 'MEDICAL', id: act.id }, sessionId: act.id, teamId: act.teamId, facilityId: component?.facilityId ?? null, componentId: input.componentId, ...input.interval, demand: null, unit: null, status, ...(status === 'CONFIRMED' ? { sharingAtConfirmation: 'EXCLUSIVE' as const } : {}), history: [...(previous?.history ?? []), { onDate: world.currentDate, status, reason }] })
  return store(world, { ...candidate, physicalAllocations: [...(act.physicalAllocations ?? []).filter(item => item.id !== id).map(item => status === 'CONFIRMED' && ['CONFIRMED', 'PENDING', 'BLOCKED'].includes(item.status) ? transitionPhysicalAllocation(item, 'RELEASED', 'MEDICAL_RESCHEDULED', world) : item), allocation] })
}
export function cancelEquippedRehabilitation(world: GameWorld, id: string): GameWorld {
  const act = find(world, id)
  if (['CANCELLED', 'COMPLETED'].includes(act.status)) return world
  return store(world, { ...event(world, act, 'CANCELLED', 'MANAGER_CANCELLED'), physicalAllocations: act.physicalAllocations?.map(item => ['CONFIRMED', 'PENDING', 'BLOCKED'].includes(item.status) ? transitionPhysicalAllocation(item, 'CANCELLED', 'MEDICAL_CANCELLED', world) : item) })
}
export function releaseEquippedMedicalAllocation(world: GameWorld, id: string): GameWorld {
  const act = find(world, id)
  const allocations = act.physicalAllocations?.map(item => ['CONFIRMED', 'PENDING', 'BLOCKED'].includes(item.status) ? transitionPhysicalAllocation(item, 'RELEASED', 'MANAGER_RELEASED', world) : item)
  return !allocations || allocations.every((item, i) => item === act.physicalAllocations![i]) ? world : store(world, { ...act, physicalAllocations: allocations })
}
/** Called only by Calendar. No healing, fatigue, development or RTP mutations. */
export function executeEquippedRehabilitationForDay(world: GameWorld): GameWorld {
  let current = world
  for (const original of equippedActs(world)) {
    if (!['SCHEDULED', 'BLOCKED'].includes(original.status) || original.interval?.date !== world.currentDate) continue
    const act = find(current, original.id), selection = act.physicalAllocations?.at(-1)
    const evaluation = !eligible(current, act) ? { status: 'VERIFIED_UNAVAILABLE', reason: 'EPISODE_NO_LONGER_ELIGIBLE' } : !selection ? { status: 'UNVERIFIED_PHYSICAL_CONTEXT', reason: 'RESOURCE_NOT_SELECTED' } : evaluateEquippedRehabilitation(current, act, selection.componentId, true)
    if (!['VERIFIED_AVAILABLE', 'VERIFIED_LIMITED'].includes(evaluation.status)) {
      const blocked = event(current, act, 'BLOCKED', evaluation.reason)
      if (blocked !== act) current = store(current, { ...blocked, physicalAllocations: act.physicalAllocations?.map(item => item.status === 'CONFIRMED' ? transitionPhysicalAllocation(item, 'BLOCKED', evaluation.reason, current) : item) })
      continue
    }
    current = store(current, { ...event(current, act, 'COMPLETED', 'MEDICAL_EXECUTED'), fulfilledOn: current.currentDate, physicalAllocations: act.physicalAllocations?.map(item => item.id === selection!.id ? transitionPhysicalAllocation(item, 'RELEASED', 'MEDICAL_EXECUTED', current) : item.status === 'CONFIRMED' || item.status === 'PENDING' ? transitionPhysicalAllocation(item, 'RELEASED', 'MEDICAL_COMPLETED', current) : item) })
  }
  return current
}
