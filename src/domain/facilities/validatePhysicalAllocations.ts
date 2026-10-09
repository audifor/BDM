import type { ScheduledTrainingSession } from '@/domain/training'
import type { GameWorld } from '@/domain/world'
import { createPhysicalAllocation, physicalIntervalsOverlap } from './PhysicalAllocation'
import { physicalComponentsOverlap } from './PhysicalComponentScope'

/** Confirmed historical evidence remains valid when current condition/capacity later changes. */
export function validatePhysicalAllocations(world: GameWorld, sessions: readonly ScheduledTrainingSession[]): void {
  const active = sessions.flatMap(session => (session.physicalAllocations ?? []).filter(item => item.status === 'CONFIRMED'))
  if (new Set(active.map(item => item.id)).size !== active.length) throw new RangeError('Duplicate physical allocation identity')
  for (const allocation of active) {
    createPhysicalAllocation(allocation)
    const session = world.scheduledTrainingSessionsById[allocation.sessionId]
    const component = world.facilityComponentsById[allocation.componentId]
    if (session?.status !== 'scheduled' || allocation.teamId !== session.teamId || allocation.date !== session.date || allocation.startTime !== session.startTime || allocation.durationMinutes !== session.durationMinutes || component?.facilityId !== allocation.facilityId) throw new RangeError('Confirmed physical allocation has inconsistent source/resource references')
    const peers = active.filter(item => item.id !== allocation.id && physicalComponentsOverlap(world.facilityComponentsById, item.componentId, allocation.componentId) && physicalIntervalsOverlap(item, allocation))
    if (peers.length > 0 && (allocation.sharingAtConfirmation !== 'SHARED_CAPACITY' || peers.some(item => item.componentId !== allocation.componentId || item.sharingAtConfirmation !== 'SHARED_CAPACITY'))) throw new RangeError('Incompatible confirmed physical allocations')
    // Sweep historical claims; current nominal capacity may legitimately change after booking.
    const minute = (item: typeof allocation) => Date.parse(`${item.date}T${item.startTime}:00Z`) / 60000
    const from = minute(allocation), to = from + allocation.durationMinutes
    const events = [allocation, ...peers].flatMap(item => [{ at: Math.max(from, minute(item)), delta: item.demand! }, { at: Math.min(to, minute(item) + item.durationMinutes), delta: -item.demand! }]).sort((a, b) => a.at - b.at || a.delta - b.delta)
    let usage = 0
    for (const event of events) { usage += event.delta; if (usage > allocation.capacityAtConfirmation!) throw new RangeError('Overbooked confirmed physical allocation evidence') }
  }
}
