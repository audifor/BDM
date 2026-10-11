import { selectedTrainingDemand } from '@/engine/facilities/PhysicalAllocationEngine'
import { addDays } from '@/domain/date'
import type { FacilityId, TeamId } from '@/domain/ids'
import { usableComponentsForTeamAt } from '@/domain/facilities'
import { timeToMinutes } from '@/domain/training/TrainingSchedule'
import type { GameWorld } from '@/domain/world'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'

/** Read-only evidence, not an allocator, reservation or a physical Training requirement. */
export function buildFacilityCapacityContext(world: GameWorld, teamId: TeamId, facilityId?: FacilityId) {
  const allComponents = Object.values(world.facilityComponentsById)
  const rights = Object.values(world.facilityUsageRightsById)
  const weekEnd = addDays(world.currentDate, 6)
  // Training shows recorded Team entitlements during this window; an inspector can also show
  // an explicitly selected Facility without granting the user's Team a right to it.
  const windowAccess = new Set(Array.from({ length: 7 }, (_, day) =>
    usableComponentsForTeamAt(rights, allComponents, teamId, addDays(world.currentDate, day))).flat())
  const scoped = allComponents.filter(component => facilityId === undefined
    ? windowAccess.has(component.id) : component.facilityId === facilityId)
    .sort((a, b) => a.id.localeCompare(b.id))
  const componentIds = new Set(scoped.map(component => component.id))
  const components = scoped.map(component => ({
    componentId: component.id,
    name: component.name ?? component.id,
    facilityId: component.facilityId,
    ...componentPhysicalAvailabilityAt(world, component.id, world.currentDate, teamId),
  }))
  const sessions = Object.values(world.scheduledTrainingSessionsById)
    .filter(session => session.status === 'scheduled' && session.date >= world.currentDate && session.date <= weekEnd)
    .map(session => {
      const entitledComponentIds = usableComponentsForTeamAt(rights, allComponents, session.teamId, session.date)
        .filter(id => componentIds.has(id))
      return {
        sessionId: session.id, teamId: session.teamId,
        teamName: world.teams[session.teamId]?.name ?? session.teamId,
        date: session.date, startTime: session.startTime, durationMinutes: session.durationMinutes,
        scope: session.scope, targetPlayerId: session.playerId ?? null, definitionId: session.definitionId,
        entitledComponentIds,
        // Explicit Training selection is demand; the unselected legacy roster is not attendance.
        simultaneousDemand: selectedTrainingDemand(session), demandUnit: selectedTrainingDemand(session) === null ? null : 'SIMULTANEOUS_PLAYERS', assignedComponentId: session.physicalAllocations?.find(item => item.status === 'CONFIRMED')?.componentId ?? null,
      }
    })
    .filter(session => session.teamId === teamId || session.entitledComponentIds.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.sessionId.localeCompare(b.sessionId))
  const overlaps: { sessionIds: readonly [string, string]; entitledComponentIds: readonly string[] }[] = []
  for (let i = 0; i < sessions.length; i += 1) {
    const a = sessions[i]!
    for (let j = i + 1; j < sessions.length; j += 1) {
      const b = sessions[j]!
      // Domain sessions last at most 240 minutes. Preserve intervals crossing midnight.
      const dayOffset = a.date === b.date ? 0 : addDays(a.date, 1) === b.date ? 1440 : null
      if (dayOffset === null) break
      const aStart = timeToMinutes(a.startTime)
      const bStart = timeToMinutes(b.startTime) + dayOffset
      if (aStart >= bStart + b.durationMinutes || bStart >= aStart + a.durationMinutes) continue
      const shared = a.entitledComponentIds.filter(id => b.entitledComponentIds.includes(id))
      if (shared.length > 0) overlaps.push({ sessionIds: [a.sessionId, b.sessionId], entitledComponentIds: shared })
    }
  }
  return {
    asOf: world.currentDate, weekEnd,
    status: 'UNVERIFIED_PHYSICAL_CONTEXT' as const,
    allocationStatus: 'AVAILABLE_VIA_TRAINING_OWNER' as const,
    components, sessions,
    // Only timetable overlap + common dated entitlements. Neither session has requested or
    // been assigned these components; this does not prove an actual resource conflict.
    overlaps,
  }
}
