import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { ensureStaffContractStructure, ensureStaffEmploymentStructure, ensureStaffReputationStructure } from './StaffCareerEnrichment'

describe('ensureStaffEmploymentStructure', () => {
  it('is a no-op when every Staff person already has employment state', () => {
    const world = createNewGame()
    const result = ensureStaffEmploymentStructure(world)
    expect(result).toBe(world)
  })

  it('backfills employed status + one initialAppointment history entry for a Staff person missing employment but with a live assignment', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffEmploymentByStaffId: {}, staffCareerHistoryByStaffId: {}, staffContracts: [] })
    const enriched = ensureStaffEmploymentStructure(stripped)
    for (const assignment of Object.values(world.teamStaffAssignmentsById)) {
      const employment = enriched.staffEmploymentByStaffId[assignment.staffPersonId]!
      expect(employment.status).toBe('employed')
      expect(employment.teamId).toBe(assignment.teamId)
      expect(employment.roleId).toBe(assignment.role)
      expect(enriched.staffCareerHistoryByStaffId[assignment.staffPersonId]).toEqual([{ kind: 'appointment', staffId: assignment.staffPersonId, teamId: assignment.teamId, roleId: assignment.role, date: assignment.assignedOn, reason: 'initialAppointment' }])
    }
  })

  it('backfills unemployed status for a Staff person with no live assignment', () => {
    const world = createNewGame()
    const unassignedStaffId = Object.keys(world.staffPeopleById).find((id) => !Object.values(world.teamStaffAssignmentsById).some((a) => a.staffPersonId === id))
    if (unassignedStaffId === undefined) return
    const stripped = updateGameWorld(world, { staffEmploymentByStaffId: {}, staffCareerHistoryByStaffId: {}, staffContracts: [] })
    const enriched = ensureStaffEmploymentStructure(stripped)
    expect(enriched.staffEmploymentByStaffId[unassignedStaffId as never]).toEqual({ status: 'unemployed' })
  })

  it('does not duplicate on repeated calls', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffEmploymentByStaffId: {}, staffCareerHistoryByStaffId: {}, staffContracts: [] })
    const once = ensureStaffEmploymentStructure(stripped)
    const twice = ensureStaffEmploymentStructure(once)
    expect(twice).toEqual(once)
  })
})

describe('ensureStaffContractStructure', () => {
  it('is a no-op when every employed Staff person already has an active contract', () => {
    const world = createNewGame()
    const result = ensureStaffContractStructure(world)
    expect(result).toBe(world)
  })

  it('backfills one deterministic default contract for an employed Staff person missing an active one', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffContracts: [] })
    const enriched = ensureStaffContractStructure(stripped)
    const employedStaffIds = Object.entries(world.staffEmploymentByStaffId).filter(([, e]) => e.status === 'employed').map(([id]) => id)
    for (const staffId of employedStaffIds) {
      const active = Object.values(enriched.staffContractsById).filter((c) => c.staffId === staffId && c.termination === undefined)
      expect(active).toHaveLength(1)
      expect(active[0]!.compensation.annualSalary).toBeGreaterThan(0)
    }
  })

  it('stable id/seed based on Staff/team/role: repeated backfill produces the same contract id', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffContracts: [] })
    const first = ensureStaffContractStructure(stripped)
    const second = ensureStaffContractStructure(updateGameWorld(first, { staffContracts: [] }))
    const staffId = Object.keys(first.staffContractsById).length > 0 ? Object.values(first.staffContractsById)[0]!.staffId : undefined
    if (staffId === undefined) return
    const firstId = Object.values(first.staffContractsById).find((c) => c.staffId === staffId)!.id
    const secondId = Object.values(second.staffContractsById).find((c) => c.staffId === staffId)!.id
    expect(firstId).toBe(secondId)
  })

  it('does not duplicate on repeated calls', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffContracts: [] })
    const once = ensureStaffContractStructure(stripped)
    const twice = ensureStaffContractStructure(once)
    expect(twice).toEqual(once)
  })
})

describe('ensureStaffReputationStructure', () => {
  it('is a no-op when every Staff person already has a reputation profile', () => {
    const world = createNewGame()
    const result = ensureStaffReputationStructure(world)
    expect(result).toBe(world)
  })

  it('backfills a default profile for every Staff person missing one, deterministically', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffReputationProfilesByStaffId: {} })
    const enriched = ensureStaffReputationStructure(stripped)
    for (const staffId of Object.keys(world.staffPeopleById)) {
      expect(enriched.staffReputationProfilesByStaffId[staffId as never]).toBeDefined()
    }
  })

  it('does not duplicate on repeated calls', () => {
    const world = createNewGame()
    const stripped = updateGameWorld(world, { staffReputationProfilesByStaffId: {} })
    const once = ensureStaffReputationStructure(stripped)
    const twice = ensureStaffReputationStructure(once)
    expect(twice).toEqual(once)
  })
})
