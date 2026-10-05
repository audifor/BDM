import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { advanceDay } from '@/engine/calendar'
import {
  cohesionUnitsByScope, conflictsByParticipant, contractsByPlayer, eligibilityProfileIndex, eligibilityProfileKey, eligibilityRestrictionsByPlayer,
  liveStaffContextByStaff, responsibilityIndex, staffAssignmentIndex, staffContractsByStaff, teamIndex, teamsByRosterPlayer,
} from './collectionIndexes'
import { updateGameWorld, type GameWorld } from './GameWorld'

/** WSR2: every index answers exactly what the world scan it replaced answered (same elements, same order, the same first match). */
function expectIndexesMatchScans(world: GameWorld): void {
  const assignments = Object.values(world.teamStaffAssignmentsById)
  const staffIds = [...new Set(assignments.map((item) => item.staffPersonId as string)), 'missing-staff']
  const teamIds = [...Object.keys(world.teams), 'missing-team']
  const assignmentIndex = staffAssignmentIndex(world.teamStaffAssignmentsById)
  for (const staffId of staffIds) {
    expect(assignmentIndex.byStaff.get(staffId as never)).toBe(assignments.find((item) => item.staffPersonId === staffId))
    expect(assignmentIndex.allByStaff.get(staffId as never) ?? []).toEqual(assignments.filter((item) => item.staffPersonId === staffId))
  }
  for (const teamId of teamIds) expect(assignmentIndex.byTeam.get(teamId as never) ?? []).toEqual(assignments.filter((item) => item.teamId === teamId))

  const responsibilities = Object.values(world.responsibilitiesById)
  const responsibilityByTeam = responsibilityIndex(world.responsibilitiesById).byTeam
  for (const teamId of teamIds) expect(responsibilityByTeam.get(teamId as never) ?? []).toEqual(responsibilities.filter((item) => item.teamId === teamId))

  const teams = Object.values(world.teams)
  const teamsIndex = teamIndex(world.teams)
  for (const team of teams) if (team.coachId !== undefined) expect(teamsIndex.byCoach.get(team.coachId)).toBe(teams.find((item) => item.coachId === team.coachId))
  expect([...teamsIndex.organizations].sort()).toEqual([...new Set(teams.map((team) => team.organizationId as string))].sort())

  const contracts = Object.values(world.contractsById)
  const contractIndex = contractsByPlayer(world.contractsById)
  const rosterIndex = teamsByRosterPlayer(world.teams)
  for (const playerId of [...Object.keys(world.players), 'missing-player']) {
    expect(contractIndex.get(playerId as never) ?? []).toEqual(contracts.filter((item) => item.playerId === playerId))
    expect(rosterIndex.get(playerId as never) ?? []).toEqual(teams.filter((team) => team.rosterPlayerIds.includes(playerId as never)))
  }

  const contexts = Object.values(world.staffHumanContextsById)
  const staffContracts = Object.values(world.staffContractsById)
  for (const staffId of staffIds) {
    expect(liveStaffContextByStaff(world.staffHumanContextsById).get(staffId)).toBe(contexts.find((item) => item.staffId === staffId && item.endedOn === undefined))
    expect(staffContractsByStaff(world.staffContractsById).get(staffId) ?? []).toEqual(staffContracts.filter((item) => item.staffId === staffId))
    expect(conflictsByParticipant(world.staffConflictsById).get(staffId) ?? []).toEqual(Object.values(world.staffConflictsById).filter((item) => item.participants.some((participant) => participant.actorId === staffId)))
  }
  for (const teamId of teamIds) {
    expect(cohesionUnitsByScope(world.staffUnitCohesionStatesByUnitKey).get(teamId) ?? []).toEqual(Object.values(world.staffUnitCohesionStatesByUnitKey).filter((unit) => unit.scopeKey === teamId))
  }

  const profiles = Object.values(world.eligibilityProfilesById)
  for (const profile of profiles) {
    expect(eligibilityProfileIndex(world.eligibilityProfilesById).get(eligibilityProfileKey(profile.playerId, profile.ecosystemId, profile.programTeamId)))
      .toBe(profiles.find((item) => item.playerId === profile.playerId && item.ecosystemId === profile.ecosystemId && item.programTeamId === profile.programTeamId))
  }
  const restrictions = Object.values(world.eligibilityRestrictionsById)
  for (const playerId of Object.keys(world.players)) expect(eligibilityRestrictionsByPlayer(world.eligibilityRestrictionsById).get(playerId) ?? []).toEqual(restrictions.filter((item) => item.playerId === playerId))
}

describe('WSR2 collection indexes', () => {
  it('answer exactly what the world scans answered, before and after the world changes', () => {
    const world = createNewGame()
    expectIndexesMatchScans(world)
    let next = world
    for (let day = 0; day < 8; day += 1) next = advanceDay(next)
    expectIndexesMatchScans(next)
  })

  it('are tied to the collection object: a replaced collection is re-indexed, an untouched one is reused', () => {
    const world = createNewGame()
    const before = staffAssignmentIndex(world.teamStaffAssignmentsById)
    const sameCollection = updateGameWorld(world, { currentDate: world.currentDate })
    expect(staffAssignmentIndex(sameCollection.teamStaffAssignmentsById)).toBe(before)
    const [first, ...rest] = Object.values(world.teamStaffAssignmentsById)
    const reordered = updateGameWorld(world, { teamStaffAssignments: [...rest, first!] })
    const after = staffAssignmentIndex(reordered.teamStaffAssignmentsById)
    expect(after).not.toBe(before)
    expect(after.byTeam.get(first!.teamId)?.at(-1)).toEqual(first)
  })
})
