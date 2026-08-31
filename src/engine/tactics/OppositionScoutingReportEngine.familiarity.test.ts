import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, organizationIdForTeam, type StaffPersonId, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import type { EvaluatorReport } from '@/domain/scouting'
import { progressOppositionScoutingReports } from './OppositionScoutingReportEngine'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, suffix: string) {
  const staffId = staffPersonIdFromString(`familiarity-staff-${role}-${suffix}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Fam', lastName: 'Iliar' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`familiarity-assignment-${role}-${suffix}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
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

/** Deterministic fixture: builds a world with a next scheduled game, an opponent roster player with a
 * pre-existing OrganizationKnowledge dimension attributed to `authorStaffId` via a fabricated EvaluatorReport,
 * and an oppositionScouting holder set to `holderStaffId` (which may or may not equal authorStaffId). */
function fixture(holderRole: string): { world: GameWorld; teamId: TeamId; opponentTeamId: TeamId; opponentPlayerId: string; authorStaffId: StaffPersonId; holderStaffId: StaffPersonId } {
  const base = createNewGame()
  const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined)
  if (teamId === undefined) throw new Error('fixture requires a team with a scheduled game')
  const nextGame = getNextScheduledGame(base, teamId)!
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const opponentPlayerId = base.teams[opponentTeamId]!.rosterPlayerIds[0]
  if (opponentPlayerId === undefined) throw new Error('fixture requires an opponent roster player')

  const { world: withAuthor, staffId: authorStaffId } = withStaffInRole(base, teamId, 'advanceScout', 'author')
  const { world: withHolder, staffId: holderStaffId } = withStaffInRole(withAuthor, teamId, holderRole, 'holder')

  const organizationId = organizationIdForTeam(teamId)
  const reportId = `report:familiarity-fixture:${teamId}:${opponentPlayerId}`
  const report: EvaluatorReport = {
    id: reportId,
    organizationId,
    subjectPlayerId: opponentPlayerId,
    evaluatorStaffId: authorStaffId,
    missionType: 'QUICK_LOOK',
    createdAt: '2032-01-01' as never,
    evidenceIds: [],
    findings: [{ dimension: 'shooting', estimate: 60, uncertainty: 10, confidence: 50, coverageContribution: 0.3 }],
  }
  const withKnowledge = updateGameWorld(withHolder, {
    evaluatorReports: [report],
    organizationKnowledge: [
      {
        organizationId,
        subjectPlayerId: opponentPlayerId,
        dimensions: {
          shooting: { coverage: 0.3, confidence: 0.4, assessedAt: '2032-01-01' as never, provenance: 'scoutReport', estimate: 60, uncertainty: 10, reportIds: [reportId] },
          physical: { coverage: 0.3, confidence: 0.4, assessedAt: '2032-01-01' as never, provenance: 'ownObservation' },
        },
      },
    ],
  })
  const delegated = delegateOppositionScouting(withKnowledge, teamId, holderStaffId)
  return { world: delegated, teamId, opponentTeamId, opponentPlayerId, authorStaffId, holderStaffId }
}

function knowledgeFor(world: GameWorld, teamId: TeamId, playerId: string) {
  const organizationId = organizationIdForTeam(teamId)
  return world.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId)!
}

describe('staffFamiliarity: holder-specific, per-dimension, non-refreshing, non-compounding', () => {
  it('1. report authored by the current holder grants a boost to the matching dimension', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    // Force the holder to BE the author for this scenario by re-delegating to authorStaffId.
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const before = knowledgeFor(delegated, teamId, opponentPlayerId).dimensions.shooting!
    const progressed = progressOppositionScoutingReports(delegated)
    const after = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!
    expect(after.provenance).toBe('staffFamiliarity')
    expect(after.coverage).toBeGreaterThan(before.coverage)
    expect(after.confidence).toBeGreaterThan(before.confidence)
  })

  it('2. report authored by a DIFFERENT Staff than the current holder grants zero boost', () => {
    const { world, teamId, opponentPlayerId } = fixture('advanceScout')
    const before = knowledgeFor(world, teamId, opponentPlayerId).dimensions.shooting!
    const progressed = progressOppositionScoutingReports(world)
    const after = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!
    expect(after.provenance).toBe('scoutReport')
    expect(after.coverage).toBe(before.coverage)
    expect(after.confidence).toBe(before.confidence)
  })

  it('3. holder changed between matchups: the new holder does not inherit the previous holder\'s familiarity', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegatedToAuthor = delegateOppositionScouting(world, teamId, authorStaffId)
    const withAuthorFamiliarity = progressOppositionScoutingReports(delegatedToAuthor)
    expect(knowledgeFor(withAuthorFamiliarity, teamId, opponentPlayerId).dimensions.shooting!.provenance).toBe('staffFamiliarity')

    const { world: withNewStaff, staffId: newHolderId } = withStaffInRole(withAuthorFamiliarity, teamId, 'headScout', 'new-holder')
    const delegatedToNewHolder = delegateOppositionScouting(withNewStaff, teamId, newHolderId)
    // Advance to a different game so the exactly-once report gate allows a fresh generation cycle.
    const nextGame = getNextScheduledGame(delegatedToNewHolder, teamId)
    if (nextGame === undefined) return
    const before = knowledgeFor(delegatedToNewHolder, teamId, opponentPlayerId).dimensions.shooting!
    expect(before.provenance).toBe('staffFamiliarity') // still carries prior holder's marker/boost, not yet re-processed
    const reprocessed = { ...delegatedToNewHolder, oppositionScoutingReportsById: {} }
    const progressed = progressOppositionScoutingReports(reprocessed)
    const after = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!
    // New holder never authored anything and the dimension already carries the old holder's marker
    // only (not the new holder's) — no further boost is attributable to the new holder.
    expect(after.coverage).toBe(before.coverage)
    expect(after.confidence).toBe(before.confidence)
  })

  it('4. a dimension attributed to the holder receives the boost', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const progressed = progressOppositionScoutingReports(delegated)
    expect(knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!.provenance).toBe('staffFamiliarity')
  })

  it('5. a different dimension with no report from the holder receives no boost', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const beforePhysical = knowledgeFor(delegated, teamId, opponentPlayerId).dimensions.physical!
    const progressed = progressOppositionScoutingReports(delegated)
    const afterPhysical = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.physical!
    expect(afterPhysical.provenance).toBe('ownObservation')
    expect(afterPhysical.coverage).toBe(beforePhysical.coverage)
    expect(afterPhysical.confidence).toBe(beforePhysical.confidence)
  })

  it('6. assessedAt is never changed by familiarity', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const before = knowledgeFor(delegated, teamId, opponentPlayerId).dimensions.shooting!
    const progressed = progressOppositionScoutingReports(delegated)
    const after = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!
    expect(after.assessedAt).toBe(before.assessedAt)
  })

  it('7. re-processing the same generated report/checkpoint does not re-boost (idempotent)', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const once = progressOppositionScoutingReports(delegated)
    const twice = progressOppositionScoutingReports(once)
    expect(twice.organizationKnowledge).toEqual(once.organizationKnowledge)
  })

  it('8. facing the same opponent again without new evidence never grows coverage/confidence beyond one bounded application', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const once = progressOppositionScoutingReports(delegated)
    const afterFirst = knowledgeFor(once, teamId, opponentPlayerId).dimensions.shooting!
    // Simulate a second future matchup: clear only the report-generation gate (as a new game would),
    // without adding any new evidence/report — familiarity must not compound further.
    const secondMatchup = { ...once, oppositionScoutingReportsById: {} }
    const twiceProcessed = progressOppositionScoutingReports(secondMatchup)
    const afterSecond = knowledgeFor(twiceProcessed, teamId, opponentPlayerId).dimensions.shooting!
    expect(afterSecond.coverage).toBe(afterFirst.coverage)
    expect(afterSecond.confidence).toBe(afterFirst.confidence)
  })

  it('9. coverage/confidence stay <= 1 even from a near-saturated starting point', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const organizationId = organizationIdForTeam(teamId)
    const saturated = updateGameWorld(world, {
      organizationKnowledge: world.organizationKnowledge.map((entry) => entry.organizationId === organizationId && entry.subjectPlayerId === opponentPlayerId
        ? { ...entry, dimensions: { ...entry.dimensions, shooting: { ...entry.dimensions.shooting!, coverage: 0.99, confidence: 0.99 } } }
        : entry),
    })
    const delegated = delegateOppositionScouting(saturated, teamId, authorStaffId)
    const progressed = progressOppositionScoutingReports(delegated)
    const after = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!
    expect(after.coverage).toBeLessThanOrEqual(1)
    expect(after.confidence).toBeLessThanOrEqual(1)
  })

  it('10. uncertainty respects existing domain bounds (>= 1, <= 20) after the boost', () => {
    const { world, teamId, opponentPlayerId, authorStaffId } = fixture('advanceScout')
    const delegated = delegateOppositionScouting(world, teamId, authorStaffId)
    const progressed = progressOppositionScoutingReports(delegated)
    const after = knowledgeFor(progressed, teamId, opponentPlayerId).dimensions.shooting!
    expect(after.uncertainty).toBeGreaterThanOrEqual(1)
    expect(after.uncertainty).toBeLessThanOrEqual(20)
  })
})
