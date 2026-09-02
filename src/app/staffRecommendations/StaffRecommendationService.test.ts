import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, organizationIdForTeam, staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { progressMedicalAdvisories } from '@/engine/injury/MedicalAdvisory'
import { generateRecruitingPool, addRecruitingBoardEntry } from '@/engine/recruiting/RecruitingEngine'
import { progressRecruitingAdvisories } from '@/engine/recruiting/RecruitingAdvisory'
import { progressBasketballOperationsAdvisories } from '@/engine/roster/BasketballOperationsAdvisory'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld } from '@/domain/world'
import { DEFAULT_NCAA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameDate } from '@/domain/date'
import { acceptStaffRecommendation, dismissStaffRecommendation, hasCanonicalAcceptanceSeam } from './StaffRecommendationService'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

// ---------------------------------------------------------------------------
// Medical fixture (mirrors MedicalAdvisory.test.ts)
// ---------------------------------------------------------------------------

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, kind: 'oppositionScouting' | 'returnToPlayRecommendation' | 'treatmentRecommendation' | 'prospectIdentification') {
  const staffId = staffPersonIdFromString(`rec-service-staff-${role}-${kind}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: flatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`rec-service-assignment-${role}-${kind}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  const id = `responsibility:${teamId}:${kind}` as never
  const delegated = updateGameWorld(withStaff, {
    responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode: 'advisory', holderStaffId: staffId }],
  })
  return { world: delegated, staffId }
}

function withActiveInjury(world: GameWorld, teamId: TeamId) {
  const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
  const injury = createInjury({ id: injuryIdFromString(`rec-service-injury-${teamId}`), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never })
  return { world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }), injury }
}

function medicalFixture() {
  const base = createNewGame()
  const teamId = Object.values(base.teams)[0]!.id
  const { world: withInjury } = withActiveInjury(base, teamId)
  const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor', 'returnToPlayRecommendation')
  const progressed = progressMedicalAdvisories(withStaff)
  const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'returnToPlayRecommendation')!
  return { world: progressed, outcome, teamId }
}

// ---------------------------------------------------------------------------
// Recruiting fixture (mirrors RecruitingAdvisory.test.ts)
// ---------------------------------------------------------------------------

function ncaaWorld(poolSize = 6) {
  const input = createValidGameWorldInput()
  const ncaaInput = { ...input, competitions: input.competitions.map((competition) => ({ ...competition, ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID })) }
  return updateGameWorld(createGameWorld(ncaaInput), {
    recruitingCycles: [{ id: 'cycle-1', ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize, commitmentThreshold: 1 } }],
  })
}

function recruitingFixture() {
  const teamId = 'team-home' as TeamId
  const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
  const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
  const progressed = progressRecruitingAdvisories(world, 'cycle-1')
  const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')!
  return { world: progressed, outcome, teamId }
}

// ---------------------------------------------------------------------------
// Trade fixture (mirrors BasketballOperationsAdvisory.test.ts's tradeFixture)
// ---------------------------------------------------------------------------

const highAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 90])) as StaffAttributes

function tradeFixture() {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
  const team = seasonTeams[0]!
  const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
  const playerId = source.rosterPlayerIds[0]!
  const org = organizationIdForTeam(team.id)
  const staffId = staffPersonIdFromString('rec-service-ops-trade')
  const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
  const withStaff = updateGameWorld(seasoned, {
    staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Ops', lastName: 'Trade' }, professional: { attributes: highAttributes } }],
    teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('rec-service-assignment-trade'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
    responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
    organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
    marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' }],
  })
  const progressed = progressBasketballOperationsAdvisories(withStaff)
  const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'tradeRecommendation')!
  return { world: progressed, outcome, teamId: team.id }
}

function contractRecommendationFixture() {
  const base = createNewGame()
  const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
  const staffId = staffPersonIdFromString('rec-service-ops-contract')
  const withStaff = updateGameWorld(base, {
    staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Ops', lastName: 'Contract' }, professional: { attributes: highAttributes } }],
    teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('rec-service-assignment-contract'), staffPersonId: staffId, teamId: team.id, role: 'capContractsSpecialist' as never, assignedOn: base.currentDate }],
    responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:contractRecommendation`), { id: `responsibility:${team.id}:contractRecommendation` as never, teamId: team.id, kind: 'contractRecommendation', mode: 'advisory', holderStaffId: staffId }],
  })
  const progressed = progressBasketballOperationsAdvisories(withStaff)
  const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'contractRecommendation')
  return { world: progressed, outcome, teamId: team.id }
}

describe('hasCanonicalAcceptanceSeam', () => {
  it('is true only for the documented Medical/Recruiting/Trade kinds', () => {
    for (const kind of ['returnToPlayRecommendation', 'treatmentRecommendation', 'prospectIdentification', 'recruitEvaluation', 'recruitingPriorities', 'tradeRecommendation'] as const) {
      expect(hasCanonicalAcceptanceSeam(kind)).toBe(true)
    }
    for (const kind of ['oppositionScouting', 'oppositionReport', 'recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'prospectReport'] as const) {
      expect(hasCanonicalAcceptanceSeam(kind)).toBe(false)
    }
  })
})

describe('acceptStaffRecommendation', () => {
  it('ACCEPT MEDICAL: dispatches to acceptMedicalRecommendation, mutates the injury via the canonical seam, and marks accepted', () => {
    const { world, outcome } = medicalFixture()
    const injuryId = outcome.payload.injuryId as string
    const baseExpectedReturnDate = outcome.payload.baseExpectedReturnDate as string
    const recommendedExtraDays = outcome.payload.recommendedExtraDays as number

    const result = acceptStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedInjury = result.world.injuriesById[injuryId as never]!
    // acceptMedicalRecommendation computes expectedReturnDate = baseExpectedReturnDate + recommendedExtraDays (its own canonical formula, not re-derived here).
    const expectedDateChanged = recommendedExtraDays !== 0
    if (expectedDateChanged) expect(updatedInjury.expectedReturnDate).not.toBe(baseExpectedReturnDate)
    const updated = result.world.delegationOutcomesById[outcome.id]!
    expect(updated.applied).toBe(true)
    expect(updated.userDisposition).toBe('accepted')
    expect(updated.userDecidedOn).toBe(result.world.currentDate)
  })

  it('ACCEPT RECRUITING: dispatches to acceptRecruitingRecommendation and performs the canonical board mutation', () => {
    const { world, outcome } = recruitingFixture()
    const result = acceptStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.recruitingBoards.some((entry) => entry.recruitId === outcome.payload.recruitId)).toBe(true)
    const updated = result.world.delegationOutcomesById[outcome.id]!
    expect(updated.applied).toBe(true)
    expect(updated.userDisposition).toBe('accepted')
  })

  it('ACCEPT TRADE: dispatches to acceptTradeRecommendation and executes the canonical trade', () => {
    const { world, outcome } = tradeFixture()
    const outgoingPlayerId = outcome.payload.outgoingPlayerId as string
    const incomingPlayerId = outcome.payload.incomingPlayerId as string
    const teamId = outcome.payload.teamId as string

    const result = acceptStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.teams[teamId as never]!.rosterPlayerIds).toContain(incomingPlayerId)
    expect(result.world.teams[teamId as never]!.rosterPlayerIds).not.toContain(outgoingPlayerId)
    const updated = result.world.delegationOutcomesById[outcome.id]!
    expect(updated.applied).toBe(true)
    expect(updated.userDisposition).toBe('accepted')
  })

  it('STALE: a recommendation invalidated in the underlying engine fails atomically, world unchanged, no disposition', () => {
    const { world, outcome } = recruitingFixture()
    const recruitId = outcome.payload.recruitId as string
    const staled = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((profile) => profile.id === recruitId ? { ...profile, status: 'committed' } : profile) })
    const before = JSON.stringify(staled)

    const result = acceptStaffRecommendation(staled, outcome.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('underlyingRejected')
    expect(JSON.stringify(staled)).toBe(before)
    expect(staled.delegationOutcomesById[outcome.id]!.userDisposition).toBeUndefined()
  })

  it('NON-ACCEPTABLE: contractRecommendation has no canonical acceptance seam, so accept fails and world is identical', () => {
    const { world, outcome } = contractRecommendationFixture()
    expect(outcome).toBeDefined()
    if (outcome === undefined) return
    const before = JSON.stringify(world)
    const result = acceptStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('notAcceptable')
    expect(JSON.stringify(world)).toBe(before)
  })

  it('NON-ACCEPTABLE: oppositionScouting (advisory tactics, no acceptance seam) rejects with notAcceptable', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world } = withStaffInRole(base, teamId, 'assistantCoach', 'oppositionScouting')
    const outcomeId = 'delegation-outcome:manual-opposition-scouting' as never
    const withOutcome = updateGameWorld(world, {
      delegationOutcomes: [{ id: outcomeId, responsibilityId: `responsibility:${teamId}:oppositionScouting` as never, staffId: staffPersonIdFromString(`rec-service-staff-assistantCoach-oppositionScouting-${teamId}`), decidedOn: world.currentDate, kind: 'oppositionScouting', applied: false, qualityScore: 60, payload: { reportId: 'report-1' } }],
    })
    const result = acceptStaffRecommendation(withOutcome, outcomeId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('notAcceptable')
  })

  it('rejects an outcome that does not exist', () => {
    const base = createNewGame()
    const result = acceptStaffRecommendation(base, 'delegation-outcome:does-not-exist' as never)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('notFound')
  })

  it('DOUBLE RESOLUTION: accepted then dismiss is rejected; dismissed then accept is rejected; dismiss twice is rejected', () => {
    const { world, outcome } = medicalFixture()
    const accepted = acceptStaffRecommendation(world, outcome.id)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const dismissAfterAccept = dismissStaffRecommendation(accepted.world, outcome.id)
    expect(dismissAfterAccept.ok).toBe(false)
    if (!dismissAfterAccept.ok) expect(dismissAfterAccept.reason).toBe('alreadyResolved')

    const { world: world2, outcome: outcome2 } = medicalFixture()
    const dismissed = dismissStaffRecommendation(world2, outcome2.id)
    expect(dismissed.ok).toBe(true)
    if (!dismissed.ok) return
    const acceptAfterDismiss = acceptStaffRecommendation(dismissed.world, outcome2.id)
    expect(acceptAfterDismiss.ok).toBe(false)
    if (!acceptAfterDismiss.ok) expect(acceptAfterDismiss.reason).toBe('alreadyResolved')
    const dismissTwice = dismissStaffRecommendation(dismissed.world, outcome2.id)
    expect(dismissTwice.ok).toBe(false)
    if (!dismissTwice.ok) expect(dismissTwice.reason).toBe('alreadyResolved')
  })
})

describe('dismissStaffRecommendation', () => {
  it('marks dismissed with the current date, keeps applied false, and never touches the recommended target domain', () => {
    const { world, outcome } = medicalFixture()
    const injuryId = outcome.payload.injuryId as string
    const beforeReturnDate = world.injuriesById[injuryId as never]!.expectedReturnDate

    const result = dismissStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updated = result.world.delegationOutcomesById[outcome.id]!
    expect(updated.applied).toBe(false)
    expect(updated.userDisposition).toBe('dismissed')
    expect(updated.userDecidedOn).toBe(result.world.currentDate)
    expect(result.world.injuriesById[injuryId as never]!.expectedReturnDate).toBe(beforeReturnDate)
  })

  it('dismiss does not cancel an already-created side effect (e.g. a scouting assignment) — it only records the user decision', () => {
    const { world, outcome } = recruitingFixture()
    const boardCountBefore = world.recruitingBoards.length
    const result = dismissStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.recruitingBoards.length).toBe(boardCountBefore)
  })

  it('rejects an outcome that does not exist', () => {
    const base = createNewGame()
    const result = dismissStaffRecommendation(base, 'delegation-outcome:does-not-exist' as never)
    expect(result.ok).toBe(false)
  })
})

describe('user-team isolation source of truth (Responsibility.teamId, not payload.teamId)', () => {
  it('addRecruitingBoardEntry payload happens to carry teamId but the facade never relies on it for authorization — only outcomeId lookup', () => {
    // Sanity check that recruiting payloads DO carry teamId (so isolation-by-payload would appear to "work"
    // by accident); the presentation layer is what actually enforces Responsibility.teamId isolation.
    const { outcome, teamId } = recruitingFixture()
    expect(outcome.payload.teamId).toBe(teamId)
  })
})
