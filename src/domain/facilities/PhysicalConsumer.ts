import type { GameWorld } from '@/domain/world'
import type { EquippedRehabilitationAct } from '@/domain/injury/EquippedRehabilitationAct'
import type { PhysicalAllocation } from './PhysicalAllocation'

const actCache = new WeakMap<object, readonly EquippedRehabilitationAct[]>()
export function equippedMedicalActs(world: GameWorld) {
  const cached = actCache.get(world.injuriesById)
  if (cached) return cached
  const acts = Object.values(world.injuriesById).flatMap(injury => injury.equippedRehabilitationActs ?? [])
  actCache.set(world.injuriesById, acts)
  return acts
}
const medicalCache = new WeakMap<object, readonly PhysicalAllocation[]>()
function medicalAllocations(world: GameWorld) {
  const cached = medicalCache.get(world.injuriesById)
  if (cached) return cached
  const records = equippedMedicalActs(world).flatMap(act => act.physicalAllocations ?? [])
  medicalCache.set(world.injuriesById, records)
  return records
}
export const allocationOwnerKey = (item: PhysicalAllocation) => `${item.consumer?.kind ?? 'TRAINING'}:${item.sessionId}`
/** Source records only; Facilities remains the single physical ledger. */
export function allPhysicalAllocations(world: GameWorld): readonly PhysicalAllocation[] {
  return [...Object.values(world.scheduledTrainingSessionsById).flatMap(item => item.physicalAllocations ?? []),
    ...medicalAllocations(world)]
}
