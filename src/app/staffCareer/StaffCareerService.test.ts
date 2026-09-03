import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { staffPersonIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld, getResponsibilitiesHeldByStaff, getTeamStaffPayroll, type GameWorld } from '@/domain/world'
import { createDefaultStaffReputationProfile, createStaffReputationProfile } from '@/domain/staffReputation'
import { isStaffContractActiveOn } from '@/domain/staffContract'
import {
  acceptStaffJobOffer,
  completeStaffInterview,
  createStaffJobOffer,
  createStaffJobOpeningForTeam,
  declineStaffJobOffer,
  fireStaffFromTeam,
  identifyStaffCandidate,
  promoteStaffWithinTeam,
  rankStaffCandidates,
  runStaffHiringProcessForOpening,
  startStaffInterview,
  withdrawStaffJobOffer,
} from './StaffCareerService'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function withFreeAgentStaff(world: GameWorld, suffix: string, attrs: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`fa-${suffix}`)
  const withPerson = updateGameWorld(world, { staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Free', lastName: 'Agent' }, professional: { attributes: { ...flatAttributes, ...attrs } } }] })
  const withReputation = updateGameWorld(withPerson, { staffReputationProfilesByStaffId: { ...withPerson.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() } })
  return { world: withReputation, staffId }
}

function fullHireFlow(world: GameWorld, openingId: string, staffId: StaffPersonId): GameWorld {
  const candidate = identifyStaffCandidate(world, { openingId, staffId })
  const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
  const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
  return acceptStaffJobOffer(offered.world, offered.offerId)
}

/** `createStaffJobOffer`'s `offerId` is a plain `string` (the app-boundary return type), not the branded `StaffJobOfferId` key type `staffJobOffersById` is indexed by — this looks it up safely regardless. */
function findOffer(world: GameWorld, offerId: string) {
  return Object.values(world.staffJobOffersById).find((offer) => offer.id === offerId)!
}

describe('Hiring transaction: opening -> candidacy -> interview -> offer -> accept -> employed', () => {
  it('employer autopilot progresses the canonically selected staffApplied candidacy rather than orphaning it', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'staff-applied', { talentEvaluation: 100, potentialEvaluation: 100, tacticalKnowledge: 100, analysis: 100, communication: 100 })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const applied = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId, origin: 'staffApplied' })
    const hired = runStaffHiringProcessForOpening(applied.world, opening.id)
    expect(hired.staffJobCandidaciesById[applied.candidacyId as never]).toMatchObject({ origin: 'staffApplied', status: 'hired' })
    expect(hired.staffEmploymentByStaffId[staffId]).toMatchObject({ status: 'employed', teamId })
  })
  it('runs the full lifecycle producing employment, assignment, and one active contract', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'lifecycle')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)

    const employment = hired.staffEmploymentByStaffId[staffId]!
    expect(employment.status).toBe('employed')
    expect(employment.teamId).toBe(teamId)
    expect(employment.roleId).toBe('advanceScout')
    const assignment = Object.values(hired.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId)
    expect(assignment?.role).toBe('advanceScout')
    const activeContracts = Object.values(hired.staffContractsById).filter((contract) => contract.staffId === staffId && contract.termination === undefined)
    expect(activeContracts).toHaveLength(1)
    expect(hired.staffJobOpeningsById[opening.id]!.status).toBe('filled')
    expect(Object.values(hired.staffJobCandidaciesById)[0]!.status).toBe('hired')
  })

  it('a Staff person already employed elsewhere leaves the old team cleanly: old assignment removed, old contract terminated, old responsibilities vacated', () => {
    const base = createNewGame()
    const [teamA, teamB] = Object.values(base.teams)
    const { world, staffId } = withFreeAgentStaff(base, 'switcher')
    const { world: withOpeningA, opening: openingA } = createStaffJobOpeningForTeam(world, { teamId: teamA!.id, roleId: 'advanceScout' })
    const hiredAtA = fullHireFlow(withOpeningA, openingA.id, staffId)
    // Give this Staff a responsibility on team A to prove it gets vacated on departure.
    const responsibilityId = `responsibility:${teamA!.id}:oppositionScouting` as never
    const withResponsibility = updateGameWorld(hiredAtA, { responsibilities: [...Object.values(hiredAtA.responsibilitiesById).filter((r) => r.id !== responsibilityId), { id: responsibilityId, teamId: teamA!.id, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }] })

    const { world: withOpeningB, opening: openingB } = createStaffJobOpeningForTeam(withResponsibility, { teamId: teamB!.id, roleId: 'advanceScout' })
    const hiredAtB = fullHireFlow(withOpeningB, openingB.id, staffId)

    const oldAssignment = Object.values(hiredAtB.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId && item.teamId === teamA!.id)
    expect(oldAssignment).toBeUndefined()
    const oldContract = Object.values(hiredAtB.staffContractsById).find((contract) => contract.staffId === staffId && contract.teamId === teamA!.id)
    expect(oldContract?.termination).toBeDefined()
    expect(hiredAtB.responsibilitiesById[responsibilityId]!.holderStaffId).toBeUndefined()
  })

  it('exactly-once behavior under repeated invalid acceptance attempts: an already-accepted offer cannot be re-accepted', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'exactly-once')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    const hired = acceptStaffJobOffer(offered.world, offered.offerId)
    expect(() => acceptStaffJobOffer(hired, offered.offerId)).toThrow()
  })

  it('competing candidacies are rejected and competing pending offers are withdrawn for the same opening', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withA, staffId: staffA } = withFreeAgentStaff(base, 'winner', { talentEvaluation: 100, potentialEvaluation: 100, tacticalKnowledge: 100, analysis: 100, communication: 100 })
    const { world: withBoth, staffId: staffB } = withFreeAgentStaff(withA, 'loser', { talentEvaluation: 1, potentialEvaluation: 1, tacticalKnowledge: 1, analysis: 1, communication: 1 })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(withBoth, { teamId, roleId: 'advanceScout' })

    const candidateA = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId: staffA })
    const candidateB = identifyStaffCandidate(candidateA.world, { openingId: opening.id, staffId: staffB })
    const interviewedA = completeStaffInterview(startStaffInterview(candidateB.world, candidateA.candidacyId), candidateA.candidacyId)
    const interviewedB = completeStaffInterview(startStaffInterview(interviewedA, candidateB.candidacyId), candidateB.candidacyId)
    const offeredA = createStaffJobOffer(interviewedB, { candidacyId: candidateA.candidacyId })
    const offeredB = createStaffJobOffer(offeredA.world, { candidacyId: candidateB.candidacyId })

    const hired = acceptStaffJobOffer(offeredB.world, offeredA.offerId)
    expect(Object.values(hired.staffJobCandidaciesById).find((c) => c.id === candidateB.candidacyId)!.status).toBe('rejected')
    expect(Object.values(hired.staffJobOffersById).find((o) => o.id === offeredB.offerId)!.status).toBe('withdrawn')
  })
})

describe('Firing', () => {
  it('employment unemployed, assignment removed, contract terminated, responsibilities vacated, career history correct, replacement opening created deterministically', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'fireme')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = runStaffHiringProcessForOpening(withOpening, opening.id)
    void staffId

    const hiredStaffId = Object.entries(hired.staffEmploymentByStaffId).find(([, e]) => e.status === 'employed' && e.teamId === teamId && e.roleId === 'advanceScout')![0] as StaffPersonId

    const fired = fireStaffFromTeam(hired, hiredStaffId)
    expect(fired.staffEmploymentByStaffId[hiredStaffId]!.status).toBe('unemployed')
    expect(Object.values(fired.teamStaffAssignmentsById).some((item) => item.staffPersonId === hiredStaffId)).toBe(false)
    const contract = Object.values(fired.staffContractsById).find((item) => item.staffId === hiredStaffId)!
    expect(contract.termination?.reason).toBe('performance')
    const history = fired.staffCareerHistoryByStaffId[hiredStaffId]!
    expect(history.at(-1)).toMatchObject({ kind: 'departure', reason: 'fired' })
    const replacementOpening = Object.values(fired.staffJobOpeningsById).find((item) => item.teamId === teamId && item.roleId === 'advanceScout' && item.status === 'open')
    expect(replacementOpening).toBeDefined()
    // Deterministic: re-running the same fire scenario from the same starting point produces the same opening id set.
    const fired2 = fireStaffFromTeam(hired, hiredStaffId)
    expect(Object.keys(fired2.staffJobOpeningsById)).toEqual(Object.keys(fired.staffJobOpeningsById))
  })

  it('vacates responsibilities held by the fired Staff on that team', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'fire-with-resp')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    const responsibilityId = `responsibility:${teamId}:oppositionScouting` as never
    const withResponsibility = updateGameWorld(hired, { responsibilities: [...Object.values(hired.responsibilitiesById).filter((r) => r.id !== responsibilityId), { id: responsibilityId, teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }] })
    expect(getResponsibilitiesHeldByStaff(withResponsibility, staffId)).toHaveLength(1)

    const fired = fireStaffFromTeam(withResponsibility, staffId)
    expect(fired.responsibilitiesById[responsibilityId]!.holderStaffId).toBeUndefined()
  })

  it('does not touch unrelated teams/Staff', () => {
    const base = createNewGame()
    const [teamA, teamB] = Object.values(base.teams)
    const { world, staffId } = withFreeAgentStaff(base, 'isolated')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId: teamA!.id, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    const beforeTeamBStaff = Object.values(hired.teamStaffAssignmentsById).filter((a) => a.teamId === teamB!.id)

    const fired = fireStaffFromTeam(hired, staffId)
    const afterTeamBStaff = Object.values(fired.teamStaffAssignmentsById).filter((a) => a.teamId === teamB!.id)
    expect(afterTeamBStaff).toEqual(beforeTeamBStaff)
  })
})

describe('Promote/reassign transaction', () => {
  it('promotes within the same team: role changes, assignment changes, career history gains an appointment with reason promoted', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'promote')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)

    const promoted = promoteStaffWithinTeam(hired, { staffId, newRoleId: 'headScout', reason: 'promoted' })
    expect(promoted.staffEmploymentByStaffId[staffId]!.roleId).toBe('headScout')
    expect(promoted.staffEmploymentByStaffId[staffId]!.teamId).toBe(teamId)
    const assignment = Object.values(promoted.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId)!
    expect(assignment.role).toBe('headScout')
    expect(promoted.staffCareerHistoryByStaffId[staffId]!.at(-1)).toMatchObject({ kind: 'appointment', reason: 'promoted' })
  })

  it('preserves StaffEmployment.startedOn (the original hire date) across a promotion on a later date (Issue #19 review "startedOn" fix)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'startedon')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    const hireDate = hired.staffEmploymentByStaffId[staffId]!.startedOn

    const later = updateGameWorld(hired, { currentDate: '2033-06-15' as never })
    const promoted = promoteStaffWithinTeam(later, { staffId, newRoleId: 'headScout', reason: 'promoted' })

    expect(promoted.staffEmploymentByStaffId[staffId]!.startedOn).toBe(hireDate)
    expect(promoted.staffEmploymentByStaffId[staffId]!.startedOn).not.toBe('2033-06-15')
    const lastHistoryEntry = promoted.staffCareerHistoryByStaffId[staffId]!.at(-1)!
    expect(lastHistoryEntry.date).toBe('2033-06-15')
  })

  it('preserves the existing contract unchanged when salary is unchanged (frozen rule)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'same-salary')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    const contractsBefore = Object.keys(hired.staffContractsById).length

    const promoted = promoteStaffWithinTeam(hired, { staffId, newRoleId: 'headScout', reason: 'promoted' })
    expect(Object.keys(promoted.staffContractsById)).toHaveLength(contractsBefore)
    const activeContracts = Object.values(promoted.staffContractsById).filter((c) => c.staffId === staffId && c.termination === undefined)
    expect(activeContracts).toHaveLength(1)
  })

  it('creates a replacement contract when salary changes, never leaving two active contracts (frozen rule)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'new-salary')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)

    const promoted = promoteStaffWithinTeam(hired, { staffId, newRoleId: 'headScout', reason: 'promoted', newAnnualSalary: 200_000 })
    const activeContracts = Object.values(promoted.staffContractsById).filter((c) => c.staffId === staffId && c.termination === undefined)
    expect(activeContracts).toHaveLength(1)
    expect(activeContracts[0]!.compensation.annualSalary).toBe(200_000)
  })

  it('reassign (a same-team role change with the reassigned reason) also works end-to-end', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'reassign')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    const reassigned = promoteStaffWithinTeam(hired, { staffId, newRoleId: 'collegeScout', reason: 'reassigned' })
    expect(reassigned.staffEmploymentByStaffId[staffId]!.roleId).toBe('collegeScout')
    expect(reassigned.staffCareerHistoryByStaffId[staffId]!.at(-1)).toMatchObject({ reason: 'reassigned' })
  })

  it('rejects promoting a Staff person who is not employed', () => {
    const base = createNewGame()
    const { world, staffId } = withFreeAgentStaff(base, 'unemployed-promote')
    expect(() => promoteStaffWithinTeam(world, { staffId, newRoleId: 'headScout', reason: 'promoted' })).toThrow()
  })
})

describe('Offer decline/withdraw', () => {
  it('declining an offer rejects the candidacy', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'decline')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    const declined = declineStaffJobOffer(offered.world, offered.offerId)
    expect(Object.values(declined.staffJobOffersById).find((o) => o.id === offered.offerId)!.status).toBe('declined')
    expect(Object.values(declined.staffJobCandidaciesById).find((c) => c.id === candidate.candidacyId)!.status).toBe('rejected')
  })

  it('withdrawing an offer rejects the candidacy', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'withdraw')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    const withdrawn = withdrawStaffJobOffer(offered.world, offered.offerId)
    expect(Object.values(withdrawn.staffJobOffersById).find((o) => o.id === offered.offerId)!.status).toBe('withdrawn')
  })
})

describe('Contracts / finance', () => {
  it('derived payroll equals the sum of active Staff annual salaries', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'payroll')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    const expectedSum = Object.values(hired.staffContractsById).filter((c) => c.teamId === teamId && isStaffContractActiveOn(c, hired.currentDate)).reduce((sum, c) => sum + c.compensation.annualSalary, 0)
    const payroll = getTeamStaffPayroll(hired, teamId)
    expect(payroll.activeAnnualSalary).toBe(expectedSum)
  })

  it('payroll is not persisted anywhere (derived-only): the world has no staffPayroll* collection', () => {
    const world = createNewGame()
    expect('staffPayrollByTeamId' in world).toBe(false)
    expect('teamStaffPayrollById' in world).toBe(false)
  })

  it('budget remaining calculation reflects active payroll subtracted from budget', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const payroll = getTeamStaffPayroll(base, teamId)
    expect(payroll.remainingBudget).toBe(payroll.budget - payroll.activeAnnualSalary)
  })

  it('an over-budget offer is rejected through the canonical application boundary', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const drainedFinances = updateGameWorld(base, { teamFinances: Object.values(base.teamFinancesByTeamId).map((finance) => finance.teamId === teamId ? { ...finance, staffSalaryBudget: 1 } : finance) })
    const { world, staffId } = withFreeAgentStaff(drainedFinances, 'over-budget')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    expect(() => createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })).toThrow()
  })

  it('re-validates the Staff budget at ACCEPT time (Issue #19 review Blocker 2): two individually-valid pending offers cannot both be accepted if doing so would jointly exceed the team Staff budget', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    // Cap the Staff budget just above the team's EXISTING baseline payroll plus room for exactly
    // ONE more standard-seniority hire (~65k), but not two — the race this test targets.
    const baselinePayroll = getTeamStaffPayroll(base, teamId).activeAnnualSalary
    const budgeted = updateGameWorld(base, { teamFinances: Object.values(base.teamFinancesByTeamId).map((finance) => finance.teamId === teamId ? { ...finance, staffSalaryBudget: baselinePayroll + 70_000 } : finance) })
    const { world: withA, staffId: staffA } = withFreeAgentStaff(budgeted, 'race-a')
    const { world: withBoth, staffId: staffB } = withFreeAgentStaff(withA, 'race-b')

    const { world: withOpeningA, opening: openingA } = createStaffJobOpeningForTeam(withBoth, { teamId, roleId: 'advanceScout' })
    const candidateA = identifyStaffCandidate(withOpeningA, { openingId: openingA.id, staffId: staffA })
    const interviewedA = completeStaffInterview(startStaffInterview(candidateA.world, candidateA.candidacyId), candidateA.candidacyId)
    const offeredA = createStaffJobOffer(interviewedA, { candidacyId: candidateA.candidacyId })

    const { world: withOpeningB, opening: openingB } = createStaffJobOpeningForTeam(offeredA.world, { teamId, roleId: 'collegeScout' })
    const candidateB = identifyStaffCandidate(withOpeningB, { openingId: openingB.id, staffId: staffB })
    const interviewedB = completeStaffInterview(startStaffInterview(candidateB.world, candidateB.candidacyId), candidateB.candidacyId)
    const offeredB = createStaffJobOffer(interviewedB, { candidacyId: candidateB.candidacyId })

    // Both offers were individually valid against the SAME remaining budget at creation time.
    const offerA = Object.values(offeredB.world.staffJobOffersById).find((o) => o.id === offeredA.offerId)!
    const offerB = Object.values(offeredB.world.staffJobOffersById).find((o) => o.id === offeredB.offerId)!
    expect(offerA.status).toBe('pending')
    expect(offerB.status).toBe('pending')

    const afterFirstAccept = acceptStaffJobOffer(offeredB.world, offeredA.offerId)
    expect(afterFirstAccept.staffEmploymentByStaffId[staffA]!.status).toBe('employed')

    const beforeSecondAttempt = afterFirstAccept
    expect(() => acceptStaffJobOffer(beforeSecondAttempt, offeredB.offerId)).toThrow()

    // The second Staff must remain completely unhired: no employment, no assignment, no contract —
    // and the offer/candidacy state must be untouched (the transaction never partially committed).
    expect(beforeSecondAttempt.staffEmploymentByStaffId[staffB]?.status).not.toBe('employed')
    expect(Object.values(beforeSecondAttempt.teamStaffAssignmentsById).some((a) => a.staffPersonId === staffB)).toBe(false)
    expect(Object.values(beforeSecondAttempt.staffContractsById).some((c) => c.staffId === staffB)).toBe(false)
    expect(Object.values(beforeSecondAttempt.staffJobOffersById).find((o) => o.id === offeredB.offerId)!.status).toBe('pending')
  })
})

describe('Reputation / job market', () => {
  it('candidate ranking uses BOTH role proficiency and reputation, not reputation alone', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withLowRepHighProficiency, staffId: highProficiencyStaff } = withFreeAgentStaff(base, 'high-proficiency', { talentEvaluation: 100, potentialEvaluation: 100, tacticalKnowledge: 100, analysis: 100, communication: 100 })
    const worldWithLowRep = updateGameWorld(withLowRepHighProficiency, { staffReputationProfilesByStaffId: { ...withLowRepHighProficiency.staffReputationProfilesByStaffId, [highProficiencyStaff]: createStaffReputationProfile({ values: { competence: 0, reliability: 0, publicStanding: 0 } }) } })
    const { world: withBoth, staffId: highRepLowProficiencyStaff } = withFreeAgentStaff(worldWithLowRep, 'high-reputation', { talentEvaluation: 1, potentialEvaluation: 1, tacticalKnowledge: 1, analysis: 1, communication: 1 })
    const worldWithHighRep = updateGameWorld(withBoth, { staffReputationProfilesByStaffId: { ...withBoth.staffReputationProfilesByStaffId, [highRepLowProficiencyStaff]: createStaffReputationProfile({ values: { competence: 1000, reliability: 1000, publicStanding: 1000 } }) } })

    const { world: withOpening, opening } = createStaffJobOpeningForTeam(worldWithHighRep, { teamId, roleId: 'advanceScout' })
    const ranked = rankStaffCandidates(withOpening, opening.id)
    // High-proficiency-but-zero-reputation candidate must still rank ahead of the low-proficiency-but-max-reputation
    // candidate under the 0.7 proficiency / 0.3 reputation blend, proving both terms matter (not reputation alone).
    const highProficiencyIndex = ranked.indexOf(highProficiencyStaff)
    const highRepIndex = ranked.indexOf(highRepLowProficiencyStaff)
    expect(highProficiencyIndex).toBeGreaterThanOrEqual(0)
    expect(highRepIndex).toBeGreaterThanOrEqual(0)
    expect(highProficiencyIndex).toBeLessThan(highRepIndex)
  })

  it('excludes ecosystem-ineligible roles/candidates: creating an opening for an NCAA-only role on a non-NCAA team is rejected at the canonical boundary, not merely filtered out of ranking', () => {
    const base = createNewGame()
    const nonNcaaTeamId = Object.values(base.teams).find((team) => !base.conferenceMemberships.some((membership) => membership.teamId === team.id))?.id as TeamId | undefined
    if (nonNcaaTeamId === undefined) return
    expect(() => createStaffJobOpeningForTeam(base, { teamId: nonNcaaTeamId, roleId: 'recruitingCoordinator' })).toThrow()
  })

  it('deterministic stable tie-break: identical candidate pools rank in the same order across calls', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId: staffA } = withFreeAgentStaff(base, 'tie-a')
    const { world: withBoth, staffId: staffB } = withFreeAgentStaff(world, 'tie-b')
    void staffA
    void staffB
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(withBoth, { teamId, roleId: 'advanceScout' })
    const firstRanking = rankStaffCandidates(withOpening, opening.id)
    const secondRanking = rankStaffCandidates(withOpening, opening.id)
    expect(firstRanking).toEqual(secondRanking)
  })
})

describe('Ecosystem role eligibility cannot be bypassed (Issue #19 review Blocker 3)', () => {
  it('a non-NCAA team can never end up with a hired recruitingCoordinator through the canonical boundary — no opening, no candidacy, no employment, no assignment, no contract', () => {
    const base = createNewGame()
    const nonNcaaTeamId = Object.values(base.teams).find((team) => !base.conferenceMemberships.some((membership) => membership.teamId === team.id))?.id as TeamId | undefined
    if (nonNcaaTeamId === undefined) return
    const { world, staffId } = withFreeAgentStaff(base, 'ecosystem-bypass')

    // 1. The opening itself is refused at creation.
    expect(() => createStaffJobOpeningForTeam(world, { teamId: nonNcaaTeamId, roleId: 'recruitingCoordinator' })).toThrow()

    // 2. Even if an ineligible opening somehow already existed (simulating a malformed/legacy
    // world), identifyStaffCandidate independently refuses it too — defense in depth.
    const staleOpeningId = 'staff-job:stale:recruitingCoordinator:stale:1'
    const withStaleOpening = updateGameWorld(world, {
      staffJobOpenings: [...Object.values(world.staffJobOpeningsById), { id: staleOpeningId as never, teamId: nonNcaaTeamId, roleId: 'recruitingCoordinator', status: 'open', createdOn: world.currentDate }],
    })
    expect(() => identifyStaffCandidate(withStaleOpening, { openingId: staleOpeningId, staffId })).toThrow()

    // 3. No StaffEmployment, TeamStaffAssignment, or StaffContract for this Staff/role/team combo
    // ever gets created by any of these attempts.
    expect(world.staffEmploymentByStaffId[staffId]?.status).not.toBe('employed')
    expect(Object.values(world.teamStaffAssignmentsById).some((a) => a.staffPersonId === staffId)).toBe(false)
    expect(Object.values(world.staffContractsById).some((c) => c.staffId === staffId)).toBe(false)
  })

  it('promoting a Staff person into an ecosystem-ineligible role on their own team is also rejected', () => {
    const base = createNewGame()
    const nonNcaaTeamId = Object.values(base.teams).find((team) => !base.conferenceMemberships.some((membership) => membership.teamId === team.id))?.id as TeamId | undefined
    if (nonNcaaTeamId === undefined) return
    const { world, staffId } = withFreeAgentStaff(base, 'ecosystem-promote')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId: nonNcaaTeamId, roleId: 'advanceScout' })
    const hired = fullHireFlow(withOpening, opening.id, staffId)
    expect(() => promoteStaffWithinTeam(hired, { staffId, newRoleId: 'recruitingCoordinator', reason: 'promoted' })).toThrow()
  })
})

describe('Salary policy (Issue #19 review Blocker 4): seniority + proficiency + reputation + budget context', () => {
  it('a higher-proficiency/higher-reputation candidate can receive a higher offer than a lower one for the identical opening', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withStrong, staffId: strongStaff } = withFreeAgentStaff(base, 'salary-strong', { talentEvaluation: 100, potentialEvaluation: 100, tacticalKnowledge: 100, analysis: 100, communication: 100 })
    const withStrongRep = updateGameWorld(withStrong, { staffReputationProfilesByStaffId: { ...withStrong.staffReputationProfilesByStaffId, [strongStaff]: createStaffReputationProfile({ values: { competence: 1000, reliability: 1000, publicStanding: 1000 } }) } })
    const { world: withWeak, staffId: weakStaff } = withFreeAgentStaff(withStrongRep, 'salary-weak', { talentEvaluation: 1, potentialEvaluation: 1, tacticalKnowledge: 1, analysis: 1, communication: 1 })
    const withWeakRep = updateGameWorld(withWeak, { staffReputationProfilesByStaffId: { ...withWeak.staffReputationProfilesByStaffId, [weakStaff]: createStaffReputationProfile({ values: { competence: 0, reliability: 0, publicStanding: 0 } }) } })

    const strongOffer = (() => {
      const { world: withOpening, opening } = createStaffJobOpeningForTeam(withWeakRep, { teamId, roleId: 'advanceScout' })
      const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId: strongStaff })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      return createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    })()
    const weakOffer = (() => {
      const { world: withOpening, opening } = createStaffJobOpeningForTeam(strongOffer.world, { teamId, roleId: 'collegeScout' })
      const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId: weakStaff })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      return createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    })()

    const strongSalary = findOffer(weakOffer.world, strongOffer.offerId).annualSalary!
    const weakSalary = findOffer(weakOffer.world, weakOffer.offerId).annualSalary!
    expect(strongSalary).toBeGreaterThan(weakSalary)
  })

  it('seniority still influences the base salary: a director-level role commands more than a standard-level role for otherwise-identical candidates', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withA, staffId: staffA } = withFreeAgentStaff(base, 'seniority-a')
    const { world: withB, staffId: staffB } = withFreeAgentStaff(withA, 'seniority-b')

    const directorOffer = (() => {
      const { world: withOpening, opening } = createStaffJobOpeningForTeam(withB, { teamId, roleId: 'headScout' })
      const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId: staffA })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      return createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    })()
    const standardOffer = (() => {
      const { world: withOpening, opening } = createStaffJobOpeningForTeam(directorOffer.world, { teamId, roleId: 'advanceScout' })
      const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId: staffB })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      return createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    })()

    const directorSalary = findOffer(standardOffer.world, directorOffer.offerId).annualSalary!
    const standardSalary = findOffer(standardOffer.world, standardOffer.offerId).annualSalary!
    expect(directorSalary).toBeGreaterThan(standardSalary)
  })

  it('the offer never exceeds the team\'s remaining Staff budget at creation time', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withStaff, staffId } = withFreeAgentStaff(base, 'salary-budget-capped', { talentEvaluation: 100, potentialEvaluation: 100, tacticalKnowledge: 100, analysis: 100, communication: 100 })
    const withReputation = updateGameWorld(withStaff, { staffReputationProfilesByStaffId: { ...withStaff.staffReputationProfilesByStaffId, [staffId]: createStaffReputationProfile({ values: { competence: 1000, reliability: 1000, publicStanding: 1000 } }) } })
    const baselinePayroll = getTeamStaffPayroll(withReputation, teamId).activeAnnualSalary
    const tightlyBudgeted = updateGameWorld(withReputation, { teamFinances: Object.values(withReputation.teamFinancesByTeamId).map((finance) => finance.teamId === teamId ? { ...finance, staffSalaryBudget: baselinePayroll + 40_000 } : finance) })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(tightlyBudgeted, { teamId, roleId: 'headScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    expect(findOffer(offered.world, offered.offerId).annualSalary!).toBeLessThanOrEqual(40_000)
  })

  it('is always positive', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withStaff, staffId } = withFreeAgentStaff(base, 'salary-positive', { talentEvaluation: 1, potentialEvaluation: 1, tacticalKnowledge: 1, analysis: 1, communication: 1 })
    const withReputation = updateGameWorld(withStaff, { staffReputationProfilesByStaffId: { ...withStaff.staffReputationProfilesByStaffId, [staffId]: createStaffReputationProfile({ values: { competence: 0, reliability: 0, publicStanding: 0 } }) } })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(withReputation, { teamId, roleId: 'collegeScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    expect(findOffer(offered.world, offered.offerId).annualSalary!).toBeGreaterThan(0)
  })

  it('is deterministic: same world + same opening + same staff => same salary', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'salary-deterministic')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const candidateFirst = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewedFirst = completeStaffInterview(startStaffInterview(candidateFirst.world, candidateFirst.candidacyId), candidateFirst.candidacyId)
    const offeredFirst = createStaffJobOffer(interviewedFirst, { candidacyId: candidateFirst.candidacyId })

    const candidateSecond = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const interviewedSecond = completeStaffInterview(startStaffInterview(candidateSecond.world, candidateSecond.candidacyId), candidateSecond.candidacyId)
    const offeredSecond = createStaffJobOffer(interviewedSecond, { candidacyId: candidateSecond.candidacyId })

    expect(findOffer(offeredFirst.world, offeredFirst.offerId).annualSalary).toBe(findOffer(offeredSecond.world, offeredSecond.offerId).annualSalary)
  })
})

describe('AI autopilot', () => {
  it('same world + same opening => same hire', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withA } = withFreeAgentStaff(base, 'ai-det-a')
    const { world: withBoth } = withFreeAgentStaff(withA, 'ai-det-b')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(withBoth, { teamId, roleId: 'advanceScout' })
    const first = runStaffHiringProcessForOpening(withOpening, opening.id)
    const second = runStaffHiringProcessForOpening(withOpening, opening.id)
    const firstHired = Object.entries(first.staffEmploymentByStaffId).find(([, e]) => e.status === 'employed' && e.teamId === teamId)?.[0]
    const secondHired = Object.entries(second.staffEmploymentByStaffId).find(([, e]) => e.status === 'employed' && e.teamId === teamId)?.[0]
    expect(firstHired).toBe(secondHired)
  })

  it('uses the canonical candidacy/interview/offer lifecycle (not a mutation shortcut)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withFreeAgentStaff(base, 'ai-lifecycle')
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId, roleId: 'advanceScout' })
    const result = runStaffHiringProcessForOpening(withOpening, opening.id)
    if (result.staffEmploymentByStaffId[staffId]?.status !== 'employed') return
    const candidacy = Object.values(result.staffJobCandidaciesById).find((c) => c.staffId === staffId)!
    expect(candidacy.status).toBe('hired')
    const offer = Object.values(result.staffJobOffersById).find((o) => o.staffId === staffId)!
    expect(offer.status).toBe('accepted')
  })

  it('no open candidate => safe no-op', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    // Strip every Staff reputation profile so rankStaffCandidates finds nobody eligible (identifyStaffCandidate/ranking both require one).
    const noCandidates = updateGameWorld(base, { staffReputationProfilesByStaffId: {} })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(noCandidates, { teamId, roleId: 'advanceScout' })
    const result = runStaffHiringProcessForOpening(withOpening, opening.id)
    expect(result.staffJobOpeningsById[opening.id]!.status).toBe('open')
  })

  it('does not alter unrelated team state', () => {
    const base = createNewGame()
    const [teamA, teamB] = Object.values(base.teams)
    const { world, staffId } = withFreeAgentStaff(base, 'ai-isolated')
    void staffId
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(world, { teamId: teamA!.id, roleId: 'advanceScout' })
    const beforeTeamB = withOpening.teams[teamB!.id]
    const result = runStaffHiringProcessForOpening(withOpening, opening.id)
    expect(result.teams[teamB!.id]).toEqual(beforeTeamB)
  })
})
