import { describe, expect, it } from 'vitest'
import { createNcaaSimulatedGame } from '@/app/game'
import { addDays, addYears } from '@/domain/date'
import { createAthleticsAidAgreement, createInstitutionBenefitsCap, createSettlementBenefitsAgreement } from '@/domain/collegeCompensation'
import { createTransferPortalEntry } from '@/domain/eligibility'
import { updateGameWorld } from '@/domain/world'
import { signInstitutionalAthleticsAid, signInstitutionBenefits } from '@/engine/eligibility/CollegeCompensationEngine'
import { submitCollegeTransferRosterAddition, validateTransferAuthorization } from '@/engine/eligibility/TransferPortalLifecycle'
import { canTeamTrainOnDate, executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training'
import { createScheduledTrainingSession } from '@/domain/training'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { isHeadCoachAvailableForActivity, isStaffActivityRestricted } from './EnforcementRemedies'

function fixture() {
  const base = createNcaaSimulatedGame()
  const season = base.seasons[base.currentSeasonId]!
  const competition = base.competitions[season.competitionId]!
  const source = base.teams[competition.participantTeamIds[0]!]!
  const destination = base.teams[competition.participantTeamIds[1]!]!
  const playerId = source.rosterPlayerIds[0]!
  const world = base
  return { world, competition, source, destination, playerId }
}

describe('automatic Enforcement remedies for unauthorized college transfers', () => {
  it('leaves an authorized Portal player unsanctioned', () => {
    const { world, competition, source, destination, playerId } = fixture()
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entry = createTransferPortalEntry({ id: 'portal:authorized-ghost-check', playerId, sourceTeamId: source.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id, notifiedOn: world.currentDate, educationalModuleCompletedOn: world.currentDate, processedOn: world.currentDate, processingDueOn: world.currentDate, status: 'authorized' })
    const authorized = updateGameWorld(world, { transferPortalEntries: [...Object.values(world.transferPortalEntriesById), entry] })
    expect(validateTransferAuthorization(authorized, playerId, destination.id, 'AID_SIGNING')).toMatchObject({ ok: true, authorized: true })
    expect(Object.keys(authorized.violationsById)).toEqual(Object.keys(world.violationsById))
  })

  it('applies one contest suspension and one 20 percent Finance fine after prohibited aid signing', () => {
    const { world, source, destination, playerId } = fixture()
    const aid = createAthleticsAidAgreement({ id: 'aid:ghost-action', playerId, teamId: destination.id, institutionId: destination.organizationId, academicPeriod: '2032-33', valueMinorUnits: 10_000, effectiveFrom: world.currentDate, effectiveTo: addYears(world.currentDate, 1), offeredOn: world.currentDate, status: 'offered', provenance: 'aid-office', history: [] })
    expect(signInstitutionalAthleticsAid(world, aid)).toMatchObject({ ok: false, reason: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' })
    const result = signInstitutionalAthleticsAid(world, aid, { commitUnauthorizedTransfer: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.athleticsAidAgreementsById[aid.id]?.status).toBe('signed')
    const violation = Object.values(result.world.violationsById).find((item) => item.category === 'unauthorizedTransfer' && item.playerId === playerId)!
    expect(violation.source).toBe('GHOST_TRANSFER_UNAUTHORIZED:AID_SIGNING')
    const staff = Object.values(result.world.sanctionsById).find((item) => item.kind === 'staffActivitySuspension' && item.programTeamId === destination.id)!
    const fine = Object.values(result.world.sanctionsById).find((item) => item.kind === 'financialPenalty' && item.programTeamId === destination.id)!
    expect(staff).toMatchObject({ requiredContestEquivalents: 16, maximumChampionshipSegmentContests: 32, activityCategories: ['COACHING', 'RECRUITING', 'ADMINISTRATIVE'] })
    expect(fine).toMatchObject({ amount: 200_000_000, basisMinorUnits: 1_000_000_000, rateBasisPoints: 2_000 })
    expect(result.world.financialTransactionsById[fine.financeTransactionId as never]?.amount.minorUnits).toBe(200_000_000)
    const coachStaffId = result.world.coaches[destination.coachId!]!.staffProfileId
    expect(isStaffActivityRestricted(result.world, coachStaffId, 'RECRUITING')).toBe(true)
    expect(isHeadCoachAvailableForActivity(result.world, destination.id, 'COACHING')).toBe(false)
    expect(isHeadCoachAvailableForActivity(result.world, destination.id, 'ADMINISTRATIVE')).toBe(false)
    expect(validateTransferAuthorization(result.world, playerId, destination.id, 'ATHLETIC_ACTIVITY', true)).toMatchObject({ ok: true, world: result.world, violationId: violation.id })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(result.world, '2032-10-01T00:00:00.000Z'))
    expect(restored.sanctionsById[fine.id]?.financeTransactionId).toBe(fine.financeTransactionId)
    expect(restored.sanctionsById[staff.id]?.requiredContestEquivalents).toBe(16)
    expect(restored.players[playerId]?.id).toBe(playerId)
    expect(restored.teams[source.id]?.rosterPlayerIds).toContain(playerId)
  })

  it('uses the same guard for prohibited benefits signing and submitted roster addition', () => {
    const { world, destination, playerId } = fixture()
    const cap = createInstitutionBenefitsCap({ id: `cap:${destination.organizationId}:2032-33`, institutionId: destination.organizationId, capYear: '2032-33', annualCapMinorUnits: 100_000, currencyCode: 'USD', version: 'simulated-test', provenance: 'SIMULATED_CARRY_FORWARD', basedOnCapId: 'prior-cap', carryAdjustmentMinorUnits: 0, otherCommitmentsMinorUnits: 0 })
    const withCap = updateGameWorld(world, { institutionBenefitsCaps: [...Object.values(world.institutionBenefitsCapsById).filter((item) => item.id !== cap.id), cap] })
    const agreement = createSettlementBenefitsAgreement({ id: 'benefits:ghost', playerId, teamId: destination.id, institutionId: destination.organizationId, capYear: cap.capYear, valueMinorUnits: 20_000, effectiveFrom: world.currentDate, effectiveTo: addYears(world.currentDate, 1), status: 'draft', reportingStatus: 'notSigned', provenance: 'test' })
    expect(signInstitutionBenefits(withCap, agreement)).toMatchObject({ ok: false, reason: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' })
    const benefits = signInstitutionBenefits(withCap, agreement, { commitUnauthorizedTransfer: true })
    expect(benefits.ok).toBe(true)
    if (!benefits.ok) return
    expect(Object.values(benefits.world.violationsById).some((item) => item.source === 'GHOST_TRANSFER_UNAUTHORIZED:BENEFITS_SIGNING')).toBe(true)
    expect(benefits.agreement.financeTransactionId).toBeDefined()
    expect(submitCollegeTransferRosterAddition(world, playerId, destination.id)).toMatchObject({ ok: false, reason: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' })
    const roster = submitCollegeTransferRosterAddition(world, playerId, destination.id, true)
    expect(roster.ok).toBe(true)
    if (!roster.ok) return
    expect(roster.world.teams[destination.id]!.rosterPlayerIds).toContain(playerId)
    expect(Object.values(roster.world.violationsById).some((item) => item.source === 'GHOST_TRANSFER_UNAUTHORIZED:ROSTER_SUBMISSION')).toBe(true)
  })

  it('records a ghost violation when a prohibited individual training session actually executes', () => {
    const { world, destination, playerId } = fixture()
    let date = addDays(world.currentDate, 1)
    while (!canTeamTrainOnDate(world, destination.id, date)) date = addDays(date, 1)
    const session = createScheduledTrainingSession({ id: 'training:ghost', teamId: destination.id, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'rest', intensity: 'light' })
    expect(() => scheduleTrainingSession(world, session)).toThrow('TRANSFER_PORTAL_AUTHORIZATION_REQUIRED')
    const scheduled = scheduleTrainingSession(world, session, { commitUnauthorizedTransfer: true })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: date }))
    expect(executed.scheduledTrainingSessionsById[session.id]?.status).toBe('completed')
    expect(Object.values(executed.violationsById).some((item) => item.source === 'GHOST_TRANSFER_UNAUTHORIZED:ATHLETIC_ACTIVITY')).toBe(true)
    expect(executeScheduledTrainingSessions(executed)).toBe(executed)
  })
})
