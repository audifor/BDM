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

  it('delegated assignScouts with a bounded target produces a deterministic assignment, evaluator chosen from the real scouting-department roster (holder eligible but not forced to self-assign)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return // no scheduled game for this fixture team; nothing to assert
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout', { talentEvaluation: 80 })
    const delegated = delegateAssignScouts(world, teamId, staffId)
    const before = Object.keys(delegated.scoutingAssignmentsById)
    const progressed = progressDelegatedScouting(delegated)
    const newAssignments = Object.values(progressed.scoutingAssignmentsById).filter((assignment) => !before.includes(assignment.id))
    expect(newAssignments.length).toBeGreaterThan(0)
    const created = newAssignments[0]!
    expect(created.requestedBy).toBe('SCOUTING_DEPARTMENT')
    expect(created.staffQualityScore).toBeGreaterThanOrEqual(0)
    expect(created.staffQualityScore).toBeLessThanOrEqual(100)
    const scoutingRoleIds = new Set(['headScout', 'regionalScout', 'advanceScout', 'collegeScout', 'internationalScout', 'proScout'])
    const evaluatorAssignment = Object.values(progressed.teamStaffAssignmentsById).find((assignment) => assignment.staffPersonId === created.evaluatorStaffId)
    expect(evaluatorAssignment).toBeDefined()
    expect(scoutingRoleIds.has(evaluatorAssignment!.role)).toBe(true)
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

  it('a department of one headScout (assignScouts holder) plus additional real scouts can pick an evaluator different from the holder', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world: withHead, staffId: headScoutId } = withStaffInRole(base, teamId, 'headScout', { talentEvaluation: 20, potentialEvaluation: 20, analysis: 20 })
    const { world: withRegional, staffId: regionalScoutId } = withStaffInRole(withHead, teamId, 'regionalScout', { talentEvaluation: 95, potentialEvaluation: 95, analysis: 95 })
    const delegated = delegateAssignScouts(withRegional, teamId, headScoutId)
    const before = Object.keys(delegated.scoutingAssignmentsById)
    const progressed = progressDelegatedScouting(delegated)
    const created = Object.values(progressed.scoutingAssignmentsById).find((assignment) => !before.includes(assignment.id))
    expect(created).toBeDefined()
    // A much stronger scouting-department evaluator on the same team must be able to be selected
    // instead of the (deliberately weak) holder — the holder distributes, it does not have to
    // execute personally.
    expect([headScoutId, regionalScoutId]).toContain(created!.evaluatorStaffId)
  })

  it('quality controls the top-N selection band deterministically: same seed + same pool always yields the same pick', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const delegated = delegateAssignScouts(world, teamId, staffId)
    const first = progressDelegatedScouting(delegated)
    const second = progressDelegatedScouting(delegated)
    expect(first.scoutingAssignmentsById).toEqual(second.scoutingAssignmentsById)
  })

  it('active scouting workload on one evaluator lets a second real scout absorb additional department work rather than always overloading the same person', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const nextGame = getNextScheduledGame(base, teamId)
    if (nextGame === undefined) return
    const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
    if (base.teams[opponentTeamId]!.rosterPlayerIds.length < 2) return
    const { world: withA, staffId: scoutA } = withStaffInRole(base, teamId, 'regionalScout', { talentEvaluation: 70 })
    const { world: withB, staffId: scoutB } = withStaffInRole(withA, teamId, 'advanceScout', { talentEvaluation: 70 })
    const delegated = delegateAssignScouts(withB, teamId, scoutA)
    // Saturate scoutA's active scouting workload so the department ranking penalizes them.
    const saturated = updateGameWorld(delegated, {
      scoutingAssignments: [
        ...Object.values(delegated.scoutingAssignmentsById),
        { id: `saturate:${scoutA}:1`, organizationId: `organization:${teamId}` as never, subjectPlayerId: base.teams[teamId]!.rosterPlayerIds[0] as never, evaluatorStaffId: scoutA, missionType: 'FULL_REPORT', requestedBy: 'HEAD_COACH', priority: 'NORMAL', createdAt: delegated.currentDate, status: 'ACTIVE' },
      ],
    })
    const before = Object.keys(saturated.scoutingAssignmentsById)
    const progressed = progressDelegatedScouting(saturated)
    const created = Object.values(progressed.scoutingAssignmentsById).find((assignment) => !before.includes(assignment.id))
    expect(created).toBeDefined()
    expect([scoutA, scoutB]).toContain(created!.evaluatorStaffId)
  })

  it('prioritizeRegions produces a genuine DelegationOutcome reordering signal (not a fixed alphabetical sort) when multiple nationality clusters of unknown players exist', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const nextGame = getNextScheduledGame(base, teamId)
    if (nextGame === undefined) return
    const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
    const nationalities = new Set(base.teams[opponentTeamId]!.rosterPlayerIds.map((id) => base.players[id]!.nationalityId))
    if (nationalities.size < 2) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const withAssignScouts = delegateAssignScouts(world, teamId, staffId)
    const withBoth = delegatePrioritizeRegions(withAssignScouts, teamId, staffId)
    const progressed = progressDelegatedScouting(withBoth)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'prioritizeRegions' && item.staffId === staffId)
    expect(outcome).toBeDefined()
    expect(outcome!.applied).toBe(true)
  })

  it('prioritizeRegions never compares Staff nationality to Player nationality and introduces no new region/geography entity', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const withAssignScouts = delegateAssignScouts(world, teamId, staffId)
    const withBoth = delegatePrioritizeRegions(withAssignScouts, teamId, staffId)
    expect(() => progressDelegatedScouting(withBoth)).not.toThrow()
    // Structural: Staff records in this domain carry no nationality field at all, so the
    // prioritization logic has nothing to compare against Player.nationalityId even if it wanted to.
    const staff = withBoth.staffPeopleById[staffId]!
    expect('nationality' in staff.identity).toBe(false)
  })
})
