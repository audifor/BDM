import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
import { acceptOppositionScoutingReport, getGamePlan, updateGamePlan } from './TacticalPlanning'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string) {
  const staffId = staffPersonIdFromString(`accept-report-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Acc', lastName: 'Eptor' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`accept-report-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
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

/** Builds a world with a generated OppositionScoutingReport that has at least one concrete recommendation, by forcing organization knowledge for the opponent roster first. */
function worldWithConcreteReport(): { world: GameWorld; reportId: string; teamId: TeamId } | undefined {
  const base = createNewGame()
  const teamId = teamWithScheduledGame(base)
  if (teamId === undefined) return undefined
  const { world: withStaff, staffId } = withStaffInRole(base, teamId, 'advanceScout')
  const delegated = delegateAdvisoryOppositionScouting(withStaff, teamId, staffId)
  const nextGame = getNextScheduledGame(delegated, teamId)!
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const organizationId = `organization:${teamId}` as never
  const knowledge = delegated.teams[opponentTeamId]!.rosterPlayerIds.map((playerId) => ({
    organizationId,
    subjectPlayerId: playerId,
    dimensions: { shooting: { coverage: 0.9, confidence: 0.9, assessedAt: delegated.currentDate, provenance: 'scoutReport' as const, estimate: 70, uncertainty: 5 } },
  }))
  const withKnowledge = updateGameWorld(delegated, { organizationKnowledge: [...delegated.organizationKnowledge, ...knowledge] })
  const progressed = progressOppositionScoutingReports(withKnowledge)
  const reportId = Object.keys(progressed.oppositionScoutingReportsById)[0]
  if (reportId === undefined) return undefined
  return { world: progressed, reportId, teamId }
}

describe('acceptOppositionScoutingReport', () => {
  it('updates only the expected existing TeamGamePlan.tacticalOverride fields', () => {
    const setup = worldWithConcreteReport()
    if (setup === undefined) return
    const { world, reportId } = setup
    const report = world.oppositionScoutingReportsById[reportId]!
    const accepted = acceptOppositionScoutingReport(world, reportId)
    const plan = getGamePlan(accepted, report.gameId, report.teamId)
    expect(plan).toBeDefined()
    if (report.recommendedPaceAdjustment !== undefined) expect(plan!.tacticalOverride!.pace).toBe(report.recommendedPaceAdjustment)
    if (report.recommendedDefensiveEmphasis !== undefined) expect(plan!.tacticalOverride!.defense![report.recommendedDefensiveEmphasis]).toBeGreaterThan(0)
  })

  it('preserves unrelated existing tactical override values already present on the game plan', () => {
    const setup = worldWithConcreteReport()
    if (setup === undefined) return
    const { world, reportId } = setup
    const report = world.oppositionScoutingReportsById[reportId]!
    const withExistingOverride = updateGamePlan(world, { gameId: report.gameId, teamId: report.teamId, tacticalOverride: { shotProfile: { rim: 1, midRange: -1, threePoint: 2 } } })
    const accepted = acceptOppositionScoutingReport(withExistingOverride, reportId)
    const plan = getGamePlan(accepted, report.gameId, report.teamId)
    expect(plan!.tacticalOverride!.shotProfile).toEqual({ rim: 1, midRange: -1, threePoint: 2 })
  })

  it('never writes flaggedPlayerIds into featuredPlayerId or fabricates a matchup', () => {
    const setup = worldWithConcreteReport()
    if (setup === undefined) return
    const { world, reportId } = setup
    const report = world.oppositionScoutingReportsById[reportId]!
    const accepted = acceptOppositionScoutingReport(world, reportId)
    const plan = getGamePlan(accepted, report.gameId, report.teamId)
    expect(plan?.tacticalOverride?.featuredPlayerId).toBeUndefined()
    expect(plan?.matchups).toBeUndefined()
  })

  it('never touches rotation or matchups implicitly', () => {
    const setup = worldWithConcreteReport()
    if (setup === undefined) return
    const { world, reportId } = setup
    const report = world.oppositionScoutingReportsById[reportId]!
    const withRotation = updateGamePlan(world, { gameId: report.gameId, teamId: report.teamId, rotationOverride: { teamId: report.teamId, instructions: [] } })
    const accepted = acceptOppositionScoutingReport(withRotation, reportId)
    const plan = getGamePlan(accepted, report.gameId, report.teamId)
    expect(plan!.rotationOverride).toEqual({ teamId: report.teamId, instructions: [] })
  })

  it('the report remains advisory (unapplied) in the world until this function is explicitly called: generation alone never mutates gamePlansByKey', () => {
    const setup = worldWithConcreteReport()
    if (setup === undefined) return
    const { world, reportId } = setup
    const report = world.oppositionScoutingReportsById[reportId]!
    expect(getGamePlan(world, report.gameId, report.teamId)).toBeUndefined()
  })

  it('throws for an unknown report id rather than silently no-oping', () => {
    const base = createNewGame()
    expect(() => acceptOppositionScoutingReport(base, 'nonexistent-report')).toThrow()
  })
})
