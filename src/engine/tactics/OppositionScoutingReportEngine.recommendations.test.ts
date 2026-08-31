import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, organizationIdForTeam, type StaffPersonId, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import type { OrganizationKnowledge } from '@/domain/knowledge'
import { progressOppositionScoutingReports } from './OppositionScoutingReportEngine'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, quality: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`recommend-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Rec', lastName: 'Ommend' }, professional: { attributes: { ...flatAttributes, ...quality } } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`recommend-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function delegateOppositionScouting(world: GameWorld, teamId: TeamId, staffId: StaffPersonId) {
  const id = `responsibility:${teamId}:oppositionScouting` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }],
  })
}

function baseFixture(): { world: GameWorld; teamId: TeamId; opponentTeamId: TeamId; staffId: StaffPersonId } {
  const base = createNewGame()
  const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined)
  if (teamId === undefined) throw new Error('fixture requires a team with a scheduled game')
  const nextGame = getNextScheduledGame(base, teamId)!
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
  const delegated = delegateOppositionScouting(world, teamId, staffId)
  return { world: delegated, teamId, opponentTeamId, staffId }
}

/** Injects strong, high-confidence OrganizationKnowledge for the entire opponent roster in exactly one legitimate offense dimension, MERGING onto any dimensions already set by a prior call so multiple dimensions can be combined for one fixture. */
function withUniformKnowledge(world: GameWorld, teamId: TeamId, opponentTeamId: TeamId, dimension: string, estimate: number): GameWorld {
  const organizationId = organizationIdForTeam(teamId)
  const roster = world.teams[opponentTeamId]!.rosterPlayerIds
  const finding = { coverage: 0.9, confidence: 0.9, assessedAt: world.currentDate, provenance: 'scoutReport' as const, estimate, uncertainty: 4 }
  const existingByPlayer = new Map(world.organizationKnowledge.filter((item) => item.organizationId === organizationId).map((item) => [item.subjectPlayerId, item]))
  const untouched = world.organizationKnowledge.filter((item) => !(item.organizationId === organizationId && roster.includes(item.subjectPlayerId)))
  const knowledge: OrganizationKnowledge[] = roster.map((playerId) => {
    const existing = existingByPlayer.get(playerId)
    return { organizationId, subjectPlayerId: playerId, dimensions: { ...existing?.dimensions, [dimension]: finding } }
  })
  return updateGameWorld(world, { organizationKnowledge: [...untouched, ...knowledge] })
}

describe('OppositionScoutingReport: recommendations derived from OrganizationKnowledge, not a coin flip', () => {
  it('1. clearly superior exterior (shooting/creation) knowledge recommends perimeter emphasis', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withPerimeter = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 90), teamId, opponentTeamId, 'finishing', 20)
    const progressed = progressOppositionScoutingReports(withPerimeter)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.recommendedDefensiveEmphasis).toBe('perimeter')
  })

  it('2. clearly superior interior (finishing/rebounding) knowledge recommends interior emphasis', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withInterior = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'finishing', 90), teamId, opponentTeamId, 'shooting', 20)
    const progressed = progressOppositionScoutingReports(withInterior)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.recommendedDefensiveEmphasis).toBe('interior')
  })

  it('3. balanced/insufficient knowledge yields undefined rather than a guess', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const balanced = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 60), teamId, opponentTeamId, 'finishing', 60)
    const progressed = progressOppositionScoutingReports(balanced)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.recommendedDefensiveEmphasis).toBeUndefined()
  })

  it('4. changing Player truth while holding knowledge fixed produces an identical recommendation (no hidden truth)', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withKnowledge = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 85), teamId, opponentTeamId, 'finishing', 15)
    const reportA = progressOppositionScoutingReports(withKnowledge)
    const opponentPlayerId = withKnowledge.teams[opponentTeamId]!.rosterPlayerIds[0]!
    const mutatedPlayer = { ...withKnowledge.players[opponentPlayerId]!, basketball: { ...withKnowledge.players[opponentPlayerId]!.basketball, ratings: { ...withKnowledge.players[opponentPlayerId]!.basketball.ratings, threePointShooting: 1, rimFinishing: 100 } } }
    const withMutatedTruth = { ...withKnowledge, players: { ...withKnowledge.players, [opponentPlayerId]: mutatedPlayer } }
    const reportB = progressOppositionScoutingReports(withMutatedTruth)
    const idA = Object.keys(reportA.oppositionScoutingReportsById)[0]!
    const idB = Object.keys(reportB.oppositionScoutingReportsById)[0]!
    expect(reportA.oppositionScoutingReportsById[idA]!.recommendedDefensiveEmphasis).toBe(reportB.oppositionScoutingReportsById[idB]!.recommendedDefensiveEmphasis)
    expect(reportA.oppositionScoutingReportsById[idA]!.recommendedPaceAdjustment).toBe(reportB.oppositionScoutingReportsById[idB]!.recommendedPaceAdjustment)
    expect(reportA.oppositionScoutingReportsById[idA]!.flaggedPlayerIds).toEqual(reportB.oppositionScoutingReportsById[idB]!.flaggedPlayerIds)
  })

  it('5. changing legitimate exterior/interior knowledge changes the recommendation', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const perimeterHeavy = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 90), teamId, opponentTeamId, 'finishing', 20)
    const interiorHeavy = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'finishing', 90), teamId, opponentTeamId, 'shooting', 20)
    const reportA = progressOppositionScoutingReports(perimeterHeavy)
    const reportB = progressOppositionScoutingReports(interiorHeavy)
    const emphasisA = Object.values(reportA.oppositionScoutingReportsById)[0]!.recommendedDefensiveEmphasis
    const emphasisB = Object.values(reportB.oppositionScoutingReportsById)[0]!.recommendedDefensiveEmphasis
    expect(emphasisA).toBe('perimeter')
    expect(emphasisB).toBe('interior')
    expect(emphasisA).not.toBe(emphasisB)
  })

  it('6. a player with a high known threat estimate ranks ahead of a player merely well-known at a low estimate', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const roster = world.teams[opponentTeamId]!.rosterPlayerIds
    if (roster.length < 2) return
    const [dangerousPlayerId, mundanePlayerId] = roster
    const organizationId = organizationIdForTeam(teamId)
    const withKnowledge = updateGameWorld(world, {
      organizationKnowledge: [
        { organizationId, subjectPlayerId: dangerousPlayerId!, dimensions: { shooting: { coverage: 0.6, confidence: 0.6, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 95, uncertainty: 5 } } },
        { organizationId, subjectPlayerId: mundanePlayerId!, dimensions: { shooting: { coverage: 0.95, confidence: 0.95, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 30, uncertainty: 5 } } },
      ],
    })
    const progressed = progressOppositionScoutingReports(withKnowledge)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    const dangerousIndex = report.flaggedPlayerIds.indexOf(dangerousPlayerId!)
    const mundaneIndex = report.flaggedPlayerIds.indexOf(mundanePlayerId!)
    expect(dangerousIndex).toBeGreaterThanOrEqual(0)
    if (mundaneIndex >= 0) expect(dangerousIndex).toBeLessThan(mundaneIndex)
  })

  it('7. never flags more than 3 players', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withKnowledge = withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 80)
    const progressed = progressOppositionScoutingReports(withKnowledge)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.flaggedPlayerIds.length).toBeLessThanOrEqual(3)
  })

  it('8. all flagged players belong to the opponent roster', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withKnowledge = withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 80)
    const progressed = progressOppositionScoutingReports(withKnowledge)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    for (const playerId of report.flaggedPlayerIds) expect(withKnowledge.teams[opponentTeamId]!.rosterPlayerIds).toContain(playerId)
  })

  it('9. empty knowledge + Staff quality 100 still stays neutral (quality never invents information)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined)
    if (teamId === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout', { adaptability: 100, talentEvaluation: 100, potentialEvaluation: 100, analysis: 100, leadership: 100, communication: 100, tacticalKnowledge: 100 })
    const delegated = delegateOppositionScouting(world, teamId, staffId)
    const progressed = progressOppositionScoutingReports(delegated)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.recommendedDefensiveEmphasis).toBeUndefined()
    expect(report.recommendedPaceAdjustment).toBeUndefined()
    expect(report.flaggedPlayerIds).toEqual([])
  })

  it('10. same world/seed produces an identical report on repeat generation attempts', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withKnowledge = withUniformKnowledge(withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 85), teamId, opponentTeamId, 'finishing', 15)
    const first = progressOppositionScoutingReports(withKnowledge)
    const reprocessed = { ...withKnowledge, oppositionScoutingReportsById: {} }
    const second = progressOppositionScoutingReports(reprocessed)
    expect(Object.values(first.oppositionScoutingReportsById)[0]).toEqual(Object.values(second.oppositionScoutingReportsById)[0])
  })

  it('11. the engine module never references Math.random', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('./OppositionScoutingReportEngine.ts', import.meta.url), 'utf-8')
    expect(source).not.toMatch(/Math\.random\(/)
  })

  it('12. no ad-hoc hash-based PRNG remains in the engine module (hashToUnit removed)', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('./OppositionScoutingReportEngine.ts', import.meta.url), 'utf-8')
    expect(source).not.toMatch(/hashToUnit/)
  })

  it('pace adjustment stays undefined without a legitimate physical-dimension signal', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const withShootingOnly = withUniformKnowledge(world, teamId, opponentTeamId, 'shooting', 85)
    const progressed = progressOppositionScoutingReports(withShootingOnly)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.recommendedPaceAdjustment).toBeUndefined()
  })

  it('pace adjustment responds to a legitimate physical-dimension signal', () => {
    const { world, teamId, opponentTeamId } = baseFixture()
    const fast = withUniformKnowledge(world, teamId, opponentTeamId, 'physical', 90)
    const progressed = progressOppositionScoutingReports(fast)
    const report = Object.values(progressed.oppositionScoutingReportsById)[0]!
    expect(report.recommendedPaceAdjustment).toBeGreaterThan(0)
  })
})
