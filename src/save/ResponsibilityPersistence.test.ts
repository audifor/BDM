import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getTeamResponsibilities, updateGameWorld } from '@/domain/world'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('Responsibility persistence', () => {
  it('round-trips Responsibility rows created for a real world', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as never
    const responsibilities = getTeamResponsibilities(base, teamId)
    expect(responsibilities.length).toBeGreaterThan(0)

    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.responsibilitiesById).toEqual(base.responsibilitiesById)
    expect(loaded.delegationOutcomesById).toEqual(base.delegationOutcomesById)
  })

  it('round-trips a delegated assignment and a DelegationOutcome', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as never
    const staffId = Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const responsibilityId = responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')
    const withAssignment = updateGameWorld(base, {
      responsibilities: [{ ...base.responsibilitiesById[responsibilityId]!, mode: 'delegated', holderStaffId: staffId }],
      delegationOutcomes: [{ id: 'outcome:round-trip' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan', applied: true, qualityScore: 61, payload: { intensity: 'normal' } }],
    })
    const saved = serializeGameWorldV1(withAssignment, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.responsibilitiesById[responsibilityId]).toEqual(withAssignment.responsibilitiesById[responsibilityId])
    expect(Object.values(loaded.delegationOutcomesById)).toEqual(Object.values(withAssignment.delegationOutcomesById))
  })

  it('backward-compatible: a legacy save missing responsibilities/delegationOutcomes fields deterministically backfills userControlled defaults', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const { responsibilities: _responsibilities, delegationOutcomes: _delegationOutcomes, ...legacyPayload } = saved.payload
    const loaded = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const teamId = Object.keys(loaded.teams)[0]! as never
    expect(getTeamResponsibilities(loaded, teamId).length).toBeGreaterThan(0)
    expect(getTeamResponsibilities(loaded, teamId).every((responsibility) => responsibility.mode === 'userControlled' && responsibility.holderStaffId === undefined)).toBe(true)
    expect(Object.keys(loaded.delegationOutcomesById)).toHaveLength(0)
  })

  it('enrichment is idempotent across repeated legacy loads', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const { responsibilities: _responsibilities, ...legacyPayload } = saved.payload
    const first = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const second = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(first.responsibilitiesById).toEqual(second.responsibilitiesById)
  })
})
