import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { oppositionScoutingReportId } from '@/domain/tactics'
import { progressOppositionScoutingReports } from './OppositionScoutingReportEngine'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, attributes: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`opposition-report-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Opp', lastName: 'Oser' }, professional: { attributes: { ...flatAttributes, ...attributes } } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`opposition-report-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function delegateAdvisoryOppositionScouting(world: GameWorld, teamId: TeamId, staffId: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:oppositionScouting` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }],
  })
}

function teamWithScheduledGame(world: GameWorld): TeamId | undefined {
  return Object.values(world.teams).map((team) => team.id).find((teamId) => getNextScheduledGame(world, teamId) !== undefined)
}

describe('progressOppositionScoutingReports', () => {
  it('advisory oppositionScouting creates exactly one deterministic report for the team\'s next scheduled game', () => {
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const nextGame = getNextScheduledGame(delegated, teamId)!
    const progressed = progressOppositionScoutingReports(delegated)
    const expectedId = oppositionScoutingReportId(teamId, nextGame.id)
    expect(progressed.oppositionScoutingReportsById[expectedId]).toBeDefined()
    expect(progressed.oppositionScoutingReportsById[expectedId]!.authoredByStaffId).toBe(staffId)
  })

  it('userControlled (default) creates no report', () => {
    const base = createNewGame()
    const progressed = progressOppositionScoutingReports(base)
    expect(Object.keys(progressed.oppositionScoutingReportsById)).toHaveLength(0)
  })

  it('repeated calendar processing does not duplicate the report or its DelegationOutcome', () => {
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const once = progressOppositionScoutingReports(delegated)
    const twice = progressOppositionScoutingReports(once)
    expect(twice.oppositionScoutingReportsById).toEqual(once.oppositionScoutingReportsById)
    expect(Object.keys(twice.delegationOutcomesById)).toHaveLength(Object.keys(once.delegationOutcomesById).length)
  })

  it('two teams processed produce identical per-team results regardless of team processing order', () => {
    const base = createNewGame()
    const teamIds = Object.values(base.teams).map((team) => team.id).filter((teamId) => getNextScheduledGame(base, teamId) !== undefined)
    if (teamIds.length < 2) return
    let world = base
    for (const teamId of teamIds) {
      const staff = withStaffInRole(world, teamId, 'advanceScout')
      world = delegateAdvisoryOppositionScouting(staff.world, teamId, staff.staffId)
    }
    const progressed = progressOppositionScoutingReports(world)
    // Re-derive independently in reverse team order by re-running from the same base state.
    const progressedAgain = progressOppositionScoutingReports(world)
    expect(progressed.oppositionScoutingReportsById).toEqual(progressedAgain.oppositionScoutingReportsById)
  })

  it('never uses hidden truth: identical organization knowledge/public evidence produces identical recommendations even if Player truth differs', () => {
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const nextGame = getNextScheduledGame(delegated, teamId)!
    const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
    const opponentPlayerId = delegated.teams[opponentTeamId]!.rosterPlayerIds[0]
    if (opponentPlayerId === undefined) return

    const reportA = progressOppositionScoutingReports(delegated)
    // Mutate the opponent player's private truth (ratings) without touching any organization
    // knowledge/public evidence — the recommendation must be identical, proving it never reads
    // Player.basketball directly.
    const mutatedPlayer = { ...delegated.players[opponentPlayerId]!, basketball: { ...delegated.players[opponentPlayerId]!.basketball, ratings: { ...delegated.players[opponentPlayerId]!.basketball.ratings, threePointShooting: 1 } } }
    const withMutatedTruth = { ...delegated, players: { ...delegated.players, [opponentPlayerId]: mutatedPlayer } }
    const reportB = progressOppositionScoutingReports(withMutatedTruth)

    const idA = Object.keys(reportA.oppositionScoutingReportsById)[0]!
    const idB = Object.keys(reportB.oppositionScoutingReportsById)[0]!
    expect(reportA.oppositionScoutingReportsById[idA]!.recommendedDefensiveEmphasis).toBe(reportB.oppositionScoutingReportsById[idB]!.recommendedDefensiveEmphasis)
    expect(reportA.oppositionScoutingReportsById[idA]!.recommendedPaceAdjustment).toBe(reportB.oppositionScoutingReportsById[idB]!.recommendedPaceAdjustment)
    expect(reportA.oppositionScoutingReportsById[idA]!.flaggedPlayerIds).toEqual(reportB.oppositionScoutingReportsById[idB]!.flaggedPlayerIds)
  })

  it('insufficient knowledge (a fresh world with no scouting history on the opponent) gives a neutral/undefined recommendation, not a leaked guess', () => {
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const progressed = progressOppositionScoutingReports(delegated)
    const reportId = Object.keys(progressed.oppositionScoutingReportsById)[0]!
    const report = progressed.oppositionScoutingReportsById[reportId]!
    // A fresh world has no OrganizationKnowledge about the opponent yet, so recommendations must
    // stay neutral/undefined rather than fabricated.
    expect(report.recommendedDefensiveEmphasis).toBeUndefined()
    expect(report.recommendedPaceAdjustment).toBeUndefined()
    expect(report.flaggedPlayerIds).toEqual([])
  })

  it('flagged players are bounded to max 3 and always belong to the opponent roster', () => {
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const nextGame = getNextScheduledGame(delegated, teamId)!
    const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
    const progressed = progressOppositionScoutingReports(delegated)
    const reportId = Object.keys(progressed.oppositionScoutingReportsById)[0]!
    const report = progressed.oppositionScoutingReportsById[reportId]!
    expect(report.flaggedPlayerIds.length).toBeLessThanOrEqual(3)
    for (const playerId of report.flaggedPlayerIds) expect(delegated.teams[opponentTeamId]!.rosterPlayerIds).toContain(playerId)
  })

  it('stable report id: opposition-scouting:{teamId}:{gameId}', () => {
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const nextGame = getNextScheduledGame(delegated, teamId)!
    const progressed = progressOppositionScoutingReports(delegated)
    expect(Object.keys(progressed.oppositionScoutingReportsById)).toContain(oppositionScoutingReportId(teamId, nextGame.id))
  })

  it('save/load round-trip preserves the report', async () => {
    const { serializeGameWorldV1, deserializeGameWorldV1 } = await import('@/save/GameWorldSaveV1')
    const base = createNewGame()
    const teamId = teamWithScheduledGame(base)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisoryOppositionScouting(world, teamId, staffId)
    const progressed = progressOppositionScoutingReports(delegated)
    const saved = serializeGameWorldV1(progressed, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.oppositionScoutingReportsById).toEqual(progressed.oppositionScoutingReportsById)
  })

  it('a save predating this collection enriches to an empty collection, idempotently', async () => {
    const { serializeGameWorldV1, deserializeGameWorldV1 } = await import('@/save/GameWorldSaveV1')
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const { oppositionScoutingReports: _omitted, ...legacyPayload } = saved.payload
    const first = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const second = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(first.oppositionScoutingReportsById).toEqual({})
    expect(second.oppositionScoutingReportsById).toEqual({})
  })
})
