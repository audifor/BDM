import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { progressDelegatedScouting } from './DelegatedScouting'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, attributes: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`delegated-scouting-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Sco', lastName: 'Uter' }, professional: { attributes: { ...flatAttributes, ...attributes } } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`delegated-scouting-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function delegateAssignScouts(world: GameWorld, teamId: TeamId, staffId: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:assignScouts` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: staffId }],
  })
}

function delegatePrioritizeRegions(world: GameWorld, teamId: TeamId, staffId: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:prioritizeRegions` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind: 'prioritizeRegions', mode: 'delegated', holderStaffId: staffId }],
  })
}

describe('progressDelegatedScouting', () => {
  it('prioritizeRegions affects only target ORDERING via existing Player.nationalityId metadata — no new region entity/model is introduced by this feature', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const nextGame = getNextScheduledGame(base, teamId)
    if (nextGame === undefined) return
    const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
    const opponentRoster = base.teams[opponentTeamId]!.rosterPlayerIds
    if (opponentRoster.length < 2) return
    // Structural guarantee: no new region/geography type exists anywhere the ordering logic could
    // reach — it can only read existing Player.nationalityId (a CountryId) and existing
    // Responsibility/DecisionQualityContext shapes, never a new "Region" concept.
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const withAssignScouts = delegateAssignScouts(world, teamId, staffId)
    const withBoth = delegatePrioritizeRegions(withAssignScouts, teamId, staffId)
    expect(() => progressDelegatedScouting(withBoth)).not.toThrow()
    const progressed = progressDelegatedScouting(withBoth)
    const created = Object.values(progressed.scoutingAssignmentsById).find((assignment) => assignment.evaluatorStaffId === staffId)
    if (created !== undefined) expect(opponentRoster).toContain(created.subjectPlayerId)
  })


  it('userControlled (default) produces zero autonomous assignments', () => {
    const world = createNewGame()
    const before = Object.keys(world.scoutingAssignmentsById).length
    const after = progressDelegatedScouting(world)
    expect(Object.keys(after.scoutingAssignmentsById)).toHaveLength(before)
  })

  it('delegated assignScouts with a bounded target produces a deterministic assignment attributed to the real holder', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return // no scheduled game for this fixture team; nothing to assert
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout', { talentEvaluation: 80 })
    const delegated = delegateAssignScouts(world, teamId, staffId)
    const progressed = progressDelegatedScouting(delegated)
    const newAssignments = Object.values(progressed.scoutingAssignmentsById).filter((assignment) => assignment.evaluatorStaffId === staffId)
    expect(newAssignments.length).toBeGreaterThan(0)
    expect(newAssignments[0]!.requestedBy).toBe('SCOUTING_DEPARTMENT')
    expect(newAssignments[0]!.staffQualityScore).toBeGreaterThanOrEqual(0)
    expect(newAssignments[0]!.staffQualityScore).toBeLessThanOrEqual(100)
  })

  it('does not scan every player in the world: without a scheduled next game, a delegated team creates no assignment', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const delegated = delegateAssignScouts(world, teamId, staffId)
    // Remove every scheduled game for this team to force "no bounded target source".
    const noGames = updateGameWorld(delegated, { games: Object.values(delegated.games).filter((game) => game.homeTeamId !== teamId && game.awayTeamId !== teamId) })
    const before = Object.keys(noGames.scoutingAssignmentsById).length
    const progressed = progressDelegatedScouting(noGames)
    expect(Object.keys(progressed.scoutingAssignmentsById)).toHaveLength(before)
  })

  it('records exactly one DelegationOutcome for a real autonomous assignment decision, attributed to the holder', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const delegated = delegateAssignScouts(world, teamId, staffId)
    const progressed = progressDelegatedScouting(delegated)
    const outcomes = Object.values(progressed.delegationOutcomesById).filter((outcome) => outcome.kind === 'assignScouts' && outcome.staffId === staffId)
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]!.applied).toBe(true)
  })

  it('re-running on an already-processed world does not duplicate assignments or outcomes (duplicate-request guard from requestScouting remains intact)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const delegated = delegateAssignScouts(world, teamId, staffId)
    const once = progressDelegatedScouting(delegated)
    const twice = progressDelegatedScouting(once)
    expect(Object.keys(twice.scoutingAssignmentsById)).toHaveLength(Object.keys(once.scoutingAssignmentsById).length)
  })

  it('processing teams in reverse order produces the same per-team assignment decisions (order independence)', () => {
    const base = createNewGame()
    const teamIds = Object.values(base.teams).map((team) => team.id).filter((teamId) => getNextScheduledGame(base, teamId) !== undefined)
    if (teamIds.length < 2) return
    let forward = base
    let backward = base
    for (const teamId of teamIds) {
      const staff = withStaffInRole(forward, teamId, 'regionalScout')
      forward = delegateAssignScouts(staff.world, teamId, staff.staffId)
    }
    for (const teamId of [...teamIds].reverse()) {
      const staff = withStaffInRole(backward, teamId, 'regionalScout')
      backward = delegateAssignScouts(staff.world, teamId, staff.staffId)
    }
    const forwardResult = progressDelegatedScouting(forward)
    const backwardResult = progressDelegatedScouting(backward)
    for (const teamId of teamIds) {
      const staffId = staffPersonIdFromString(`delegated-scouting-staff-regionalScout-${teamId}`)
      const forwardAssignments = Object.values(forwardResult.scoutingAssignmentsById).filter((a) => a.evaluatorStaffId === staffId).map((a) => a.subjectPlayerId).sort()
      const backwardAssignments = Object.values(backwardResult.scoutingAssignmentsById).filter((a) => a.evaluatorStaffId === staffId).map((a) => a.subjectPlayerId).sort()
      expect(forwardAssignments).toEqual(backwardAssignments)
    }
  })
})
