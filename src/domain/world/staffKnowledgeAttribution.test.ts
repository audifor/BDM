import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, organizationIdForTeam, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { requestScouting, progressScoutingAssignments } from '@/engine/scouting'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
import { addDays } from '@/domain/date'
import { attributeKnowledgeDimension, attributingStaffIds } from './staffKnowledgeAttribution'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string) {
  const staffId = staffPersonIdFromString(`knowledge-attribution-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Kno', lastName: 'Wledge' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`knowledge-attribution-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function complete(world: GameWorld): GameWorld {
  let current = progressScoutingAssignments(world)
  for (let day = 0; day < 8; day += 1) current = progressScoutingAssignments(updateGameWorld(current, { currentDate: addDays(current.currentDate, 1) }))
  return current
}

describe('attributeKnowledgeDimension / attributingStaffIds', () => {
  it('resolves a dimension\'s reportIds back to the correct evaluator Staff id', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const player = Object.values(base.players).find((candidate) => !base.teams[teamId]!.rosterPlayerIds.includes(candidate.id))
    if (player === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const requested = requestScouting(world, { organizationId: organizationIdForTeam(teamId), playerId: player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: staffId })
    const completed = complete(requested)
    const knowledge = completed.organizationKnowledge.find((item) => item.organizationId === organizationIdForTeam(teamId) && item.subjectPlayerId === player.id)
    expect(knowledge).toBeDefined()
    const dimension = Object.values(knowledge!.dimensions)[0]!
    expect(attributingStaffIds(completed, dimension)).toEqual([staffId])
  })

  it('attribution is deduplicated and deterministically ordered', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const player = Object.values(base.players).find((candidate) => !base.teams[teamId]!.rosterPlayerIds.includes(candidate.id))
    if (player === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const requested = requestScouting(world, { organizationId: organizationIdForTeam(teamId), playerId: player.id, missionType: 'FULL_REPORT', evaluatorStaffId: staffId })
    const completed = complete(requested)
    const knowledge = completed.organizationKnowledge.find((item) => item.organizationId === organizationIdForTeam(teamId) && item.subjectPlayerId === player.id)!
    for (const dimension of Object.values(knowledge.dimensions)) {
      const records = attributeKnowledgeDimension(completed, dimension)
      const uniqueReportIds = new Set(records.map((record) => record.reportId))
      expect(uniqueReportIds.size).toBe(records.length)
      const sorted = [...records].sort((a, b) => a.reportId.localeCompare(b.reportId))
      expect(records).toEqual(sorted)
    }
  })

  it('returns an empty array for a dimension with no reportIds', () => {
    expect(attributeKnowledgeDimension(createNewGame(), { coverage: 0.5, confidence: 0.5, assessedAt: '2032-10-01' as never, provenance: 'legacyBaseline' })).toEqual([])
  })

  it('returns an empty array for undefined', () => {
    expect(attributeKnowledgeDimension(createNewGame(), undefined)).toEqual([])
  })

  it('skips a reportId with no matching EvaluatorReport rather than throwing', () => {
    const world = createNewGame()
    const result = attributeKnowledgeDimension(world, { coverage: 0.5, confidence: 0.5, assessedAt: '2032-10-01' as never, provenance: 'scoutReport', reportIds: ['report:nonexistent'] })
    expect(result).toEqual([])
  })
})

describe('staffFamiliarity contribution (opposition scouting report generation)', () => {
  it('touches only dimensions already known, boosting them with provenance staffFamiliarity, bounded within 0..1 / existing uncertainty bounds', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined)
    if (teamId === undefined) return
    const { world: withStaff, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const withResponsibility = updateGameWorld(withStaff, {
      responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((r) => r.id !== (`responsibility:${teamId}:oppositionScouting` as never)), { id: `responsibility:${teamId}:oppositionScouting` as never, teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }],
    })
    // complete() advances currentDate by up to 8 days to resolve the scouting assignment, which
    // can itself change which game is "next scheduled" — so the prior-knowledge target player
    // must be scouted, and the completion loop run, BEFORE resolving the opponent that
    // progressOppositionScoutingReports will actually use afterward. To keep the target and the
    // eventual opponent-of-record consistent, scout a player from the *current* next opponent,
    // run the scouting-completion loop, then compute the opponent context fresh from the
    // resulting (already time-advanced) world before generating the report.
    const nextGameBeforeScouting = getNextScheduledGame(withResponsibility, teamId)!
    const opponentTeamId = nextGameBeforeScouting.homeTeamId === teamId ? nextGameBeforeScouting.awayTeamId : nextGameBeforeScouting.homeTeamId
    const organizationId = organizationIdForTeam(teamId)
    const opponentPlayerId = withResponsibility.teams[opponentTeamId]!.rosterPlayerIds[0]
    if (opponentPlayerId === undefined) return

    const scoutRequest = requestScouting(withResponsibility, { organizationId, playerId: opponentPlayerId, missionType: 'QUICK_LOOK', evaluatorStaffId: staffId })
    const withPriorKnowledge = complete(scoutRequest)
    const nextGameAfterScouting = getNextScheduledGame(withPriorKnowledge, teamId)
    if (nextGameAfterScouting === undefined) return
    const finalOpponentTeamId = nextGameAfterScouting.homeTeamId === teamId ? nextGameAfterScouting.awayTeamId : nextGameAfterScouting.homeTeamId
    if (finalOpponentTeamId !== opponentTeamId) return // the "next opponent" shifted during scouting completion; this fixture combination isn't usable for this assertion

    const before = withPriorKnowledge.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === opponentPlayerId)!
    const beforeDimension = Object.values(before.dimensions)[0]!

    const progressed = progressOppositionScoutingReports(withPriorKnowledge)
    const after = progressed.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === opponentPlayerId)!
    const afterDimensionKey = Object.keys(after.dimensions).find((key) => Object.keys(before.dimensions).includes(key))!
    const afterDimension = after.dimensions[afterDimensionKey]!

    expect(afterDimension.provenance).toBe('staffFamiliarity')
    expect(afterDimension.coverage).toBeGreaterThanOrEqual(beforeDimension.coverage)
    expect(afterDimension.coverage).toBeLessThanOrEqual(1)
    expect(afterDimension.confidence).toBeGreaterThanOrEqual(beforeDimension.confidence)
    expect(afterDimension.confidence).toBeLessThanOrEqual(1)
  })

  it('cannot apply familiarity twice for the same generated report (idempotent with the exactly-once report generation gate)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined)
    if (teamId === undefined) return
    const { world: withStaff, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const withResponsibility = updateGameWorld(withStaff, {
      responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((r) => r.id !== (`responsibility:${teamId}:oppositionScouting` as never)), { id: `responsibility:${teamId}:oppositionScouting` as never, teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }],
    })
    const once = progressOppositionScoutingReports(withResponsibility)
    const twice = progressOppositionScoutingReports(once)
    expect(twice.organizationKnowledge).toEqual(once.organizationKnowledge)
  })
})
