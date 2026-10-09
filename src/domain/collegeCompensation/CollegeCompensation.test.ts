import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createNcaaSimulatedGame } from '@/app/game'
import { addDays, parseGameDate } from '@/domain/date'
import { createInstitutionBenefitsCap, createAthleticsAidAgreement, createSettlementBenefitsAgreement, aidChangeQualifiesForPortal, availableInstitutionBenefitsRoom, nextBenefitsCapCarryAdjustment, recordAthleticsAidChange, reportSettlementBenefitsAgreement, signSettlementBenefitsAgreement } from './CollegeCompensation'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { progressInstitutionBenefitsReporting, reportInstitutionBenefits, rolloverInstitutionBenefitsCaps, signInstitutionBenefits } from '@/engine/eligibility/CollegeCompensationEngine'

describe('college compensation authorities', () => {
  it('tracks qualifying and excluded aid changes from auditable agreement history', () => {
    const team = Object.values(createNewGame().teams).find((item) => item.rosterPlayerIds.length > 0)!
    const playerId = team.rosterPlayerIds[0]!
    const initial = createAthleticsAidAgreement({ id: 'aid:2026', playerId, teamId: team.id, institutionId: team.organizationId, academicPeriod: '2026-27', valueMinorUnits: 10_000, effectiveFrom: parseGameDate('2026-07-01'), effectiveTo: parseGameDate('2027-06-30'), offeredOn: parseGameDate('2026-06-01'), signedOn: parseGameDate('2026-06-02'), status: 'signed', provenance: 'financial-aid-office', history: [] })
    const reduction = recordAthleticsAidChange(initial, { id: 'aid-event:reduced', action: 'reduction', date: parseGameDate('2026-08-01'), valueMinorUnits: 8_000, reason: 'institutionalChange', provenance: 'aid-office' })
    const excluded = recordAthleticsAidChange(reduction, { id: 'aid-event:ability', action: 'reduction', date: parseGameDate('2026-08-02'), valueMinorUnits: 7_000, reason: 'athleticAbility', provenance: 'aid-office' })
    expect(aidChangeQualifiesForPortal(reduction, 'aid-event:reduced')).toBe(true)
    expect(aidChangeQualifiesForPortal(excluded, 'aid-event:ability')).toBe(false)
    expect(recordAthleticsAidChange(reduction, { id: 'aid-event:reduced', action: 'reduction', date: parseGameDate('2026-08-01'), valueMinorUnits: 8_000, reason: 'institutionalChange', provenance: 'aid-office' })).toBe(reduction)
  })

  it('uses an institution-year cap and reports signed agreements by the five-business-day deadline through Save V4', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.length > 0)!
    const playerId = team.rosterPlayerIds[0]!
    const cap = createInstitutionBenefitsCap({ id: `cap:${team.organizationId}:2026-27`, institutionId: team.organizationId, capYear: '2026-27', annualCapMinorUnits: 100_000, currencyCode: 'USD', version: '2026-27.v1', provenance: 'OFFICIAL_SOURCE', source: 'configured NCAA source', carryAdjustmentMinorUnits: -5_000, otherCommitmentsMinorUnits: 20_000 })
    const draft = createSettlementBenefitsAgreement({ id: 'benefits:test', playerId, teamId: team.id, institutionId: team.organizationId, capYear: '2026-27', valueMinorUnits: 30_000, effectiveFrom: parseGameDate('2026-07-01'), effectiveTo: parseGameDate('2027-06-30'), status: 'draft', reportingStatus: 'notSigned', provenance: 'institutional-agreement' })
    const signed = signSettlementBenefitsAgreement(draft, parseGameDate('2026-07-01'))
    expect(signed.reportingDueOn).toBe('2026-07-08')
    expect(availableInstitutionBenefitsRoom(cap, [signed])).toBe(45_000)
    expect(nextBenefitsCapCarryAdjustment(cap, [signed])).toBe(0)
    expect(nextBenefitsCapCarryAdjustment({ ...cap, carryAdjustmentMinorUnits: 0 }, [{ ...signed, valueMinorUnits: 120_000 }])).toBe(-40_000)
    const scholarshipExempt = createInstitutionBenefitsCap({ ...cap, carryAdjustmentMinorUnits: 0, qualifyingIncrementalScholarshipOverageMinorUnits: 30_000, incrementalScholarshipExceptionSource: 'NCAA Division I Proposal 2026-64' })
    expect(nextBenefitsCapCarryAdjustment(scholarshipExempt, [{ ...signed, valueMinorUnits: 120_000 }])).toBe(-10_000)
    expect(reportSettlementBenefitsAgreement(signed, parseGameDate('2026-07-08')).reportingStatus).toBe('reported')
    expect(reportSettlementBenefitsAgreement(signed, parseGameDate('2026-07-09')).reportingStatus).toBe('late')
    const aid = createAthleticsAidAgreement({ id: 'aid:save-v4', playerId, teamId: team.id, institutionId: team.organizationId, academicPeriod: '2026-27', valueMinorUnits: 10_000, effectiveFrom: parseGameDate('2026-07-01'), effectiveTo: parseGameDate('2027-06-30'), offeredOn: parseGameDate('2026-06-01'), signedOn: parseGameDate('2026-06-02'), status: 'signed', provenance: 'aid-office', history: [] })
    const changed = updateGameWorld(world, { athleticsAidAgreements: [aid], institutionBenefitsCaps: [cap], settlementBenefitsAgreements: [signed] })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(changed, '2032-10-01T00:00:00.000Z'))
    expect(restored.athleticsAidAgreementsById[aid.id]).toEqual(aid)
    expect(restored.institutionBenefitsCapsById[cap.id]).toEqual(cap)
    expect(restored.settlementBenefitsAgreementsById[signed.id]).toEqual(signed)
    const overageWorld = updateGameWorld(world, { institutionBenefitsCaps: [scholarshipExempt], settlementBenefitsAgreements: [{ ...signed, valueMinorUnits: 120_000 }], currentDate: parseGameDate('2027-07-01') })
    const rolled = rolloverInstitutionBenefitsCaps(overageWorld)
    const successor = Object.values(rolled.institutionBenefitsCapsById).find((item) => item.capYear === '2027-28' && item.institutionId === cap.institutionId)!
    expect(successor).toMatchObject({ carryAdjustmentMinorUnits: -10_000, provenance: 'SIMULATED_CARRY_FORWARD', basedOnCapId: cap.id })
    expect(rolled.institutionBenefitsCapsById[cap.id]?.status).toBe('closed')
    expect(rolloverInstitutionBenefitsCaps(rolled)).toBe(rolled)
  })

  it('uses one cap gateway and records a Finance V2 obligation when signing', () => {
    const base = createNcaaSimulatedGame()
    const season = base.seasons[base.currentSeasonId]!
    const team = base.teams[base.competitions[season.competitionId]!.participantTeamIds[0]!]!
    const playerId = team.rosterPlayerIds[0]!
    const cap = createInstitutionBenefitsCap({ id: `cap:${team.organizationId}:current`, institutionId: team.organizationId, capYear: '2032-33', annualCapMinorUnits: 10_000, currencyCode: 'USD', version: '2032-33.test', provenance: 'SIMULATED_CARRY_FORWARD', basedOnCapId: 'cap:previous', carryAdjustmentMinorUnits: 0, otherCommitmentsMinorUnits: 0 })
    const world = updateGameWorld(base, { institutionBenefitsCaps: [cap] })
    const agreement = createSettlementBenefitsAgreement({ id: 'benefits:gateway', playerId, teamId: team.id, institutionId: team.organizationId, capYear: cap.capYear, valueMinorUnits: 8_000, effectiveFrom: parseGameDate('2032-10-01'), effectiveTo: parseGameDate('2033-06-30'), status: 'draft', reportingStatus: 'notSigned', provenance: 'test' })
    const result = signInstitutionBenefits(world, agreement)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agreement.financeEventId).toBe(`event:settlement-benefits:${agreement.id}`)
    expect(result.agreement.financeCommitmentId).toContain(`COLLEGE_COMPENSATION:${agreement.id}`)
    expect(result.world.financialCommitmentsById[result.agreement.financeCommitmentId as never]?.amount.minorUnits).toBe(8_000)
    expect(result.world.expenseRecognitionsById[result.agreement.financeExpenseRecognitionId as never]?.ledgerTransactionId).toBe(result.agreement.financeTransactionId)
    expect(result.world.payablesById[result.agreement.financePayableId as never]?.amount.minorUnits).toBe(8_000)
    expect(result.world.financialTransactionsById[result.agreement.financeTransactionId as never]?.transactionType).toBe('EXPENSE_RECOGNITION')
    expect(Object.values(result.world.financialTransactionsById).filter((item) => item.id === result.agreement.financeTransactionId)).toHaveLength(1)
    expect(signInstitutionBenefits(result.world, agreement)).toMatchObject({ ok: false, reason: 'AGREEMENT_ALREADY_SIGNED' })
    expect(signInstitutionBenefits(result.world, { ...agreement, id: 'benefits:over-cap', valueMinorUnits: 3_000 })).toMatchObject({ ok: false, reason: 'CAP_EXCEEDED' })
    const onTime = reportInstitutionBenefits(updateGameWorld(result.world, { currentDate: result.agreement.reportingDueOn! }), agreement.id)
    expect(onTime.settlementBenefitsAgreementsById[agreement.id]?.reportingStatus).toBe('reported')
    expect(Object.keys(onTime.violationsById)).toEqual(Object.keys(result.world.violationsById))
    const lateDate = addDays(result.agreement.reportingDueOn!, 1)
    const overdue = progressInstitutionBenefitsReporting(updateGameWorld(result.world, { currentDate: lateDate }))
    const violationId = overdue.settlementBenefitsAgreementsById[agreement.id]?.reportingViolationId
    expect(violationId).toBe(`violation:institutional-benefits-reporting:${agreement.id}`)
    expect(overdue.violationsById[violationId!]?.source).toBe(`INSTITUTIONAL_BENEFITS_REPORTING_LATE:${agreement.id}`)
    expect(progressInstitutionBenefitsReporting(overdue)).toBe(overdue)
  })
})
