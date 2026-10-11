import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { addDays } from '@/domain/date'
import { createFacilityMaintenanceAction } from '@/domain/facilities'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { executeScheduledTrainingSessions, scheduleTrainingSessionsBatch } from '@/engine/training/ScheduledTrainingEngine'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { withShortGameFormat } from '@/app/game/testFixtures'

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })

/**
 * A maintenance/repair work in progress occupies the component through the existing physical-availability authority
 * that Training and Medical already read (C1): no second reservation system exists. Completing or stopping the work
 * releases the component; Save/reload keeps both states.
 */
describe('BS17 maintenance works and shared physical occupancy', () => {
  it('blocks a Training session that needs the court while repair work is in progress, and runs it once the work is released', () => {
    const base = createConfiguredGame({ universeId: 'prototype' })
    const team = getUserTeam(base)!
    const organizationId = String(team.organizationId)
    const courtId = `bdm-balance-v1:component:${organizationId}:court`
    const facilityId = `bdm-balance-v1:facility:${organizationId}`
    expect(base.facilityComponentsById[courtId as never]).toBeDefined()
    const date = addDays(base.currentDate, 1)
    const scheduled = scheduleTrainingSessionsBatch(withShortGameFormat(base, 0.1), [
      createScheduledTrainingSession({ id: 'occupancy:session', teamId: team.id, date, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' }),
    ])
    const withSession = updateGameWorld(scheduled, { currentDate: date })
    const inProgress = createFacilityMaintenanceAction({ id: 'occupancy:work', facilityId, componentId: courtId, type: 'REPAIR', startedAt: date })
    const worked = updateGameWorld(withSession, { facilityMaintenanceActions: [inProgress] })
    expect(componentPhysicalAvailabilityAt(worked, courtId as never, date).status).toBe('OUT_OF_SERVICE')

    const blocked = executeScheduledTrainingSessions(worked)
    expect(blocked.scheduledTrainingSessionsById['occupancy:session']).toMatchObject({ status: 'scheduled', physicalAttempt: { status: 'VERIFIED_UNAVAILABLE' } })
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(blocked, '2033-01-01T00:00:00.000Z'))
    expect(reloaded.scheduledTrainingSessionsById['occupancy:session']).toMatchObject({ status: 'scheduled', physicalAttempt: { status: 'VERIFIED_UNAVAILABLE' } })

    // Stopping the work (as cancellation does: closed UNSUCCESSFUL, no restoration) releases the component; the retry runs.
    const released: GameWorld = updateGameWorld(reloaded, { facilityMaintenanceActions: [createFacilityMaintenanceAction({ ...inProgress, completedAt: date, outcome: 'UNSUCCESSFUL' })] })
    expect(componentPhysicalAvailabilityAt(released, courtId as never, date).status).not.toBe('OUT_OF_SERVICE')
    const retried = executeScheduledTrainingSessions(released)
    expect(retried.scheduledTrainingSessionsById['occupancy:session']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'VERIFIED_AVAILABLE' } })
  })
})
