import { createAuthorizedEconomicEvent, ensureExpenseAccountMapping, processCollegeInstitutionalBenefitEconomicEvent } from '@/domain/finance'
import { availableInstitutionBenefitsRoom, createAthleticsAidAgreement, createInstitutionBenefitsCap, nextBenefitsCapCarryAdjustment, reportSettlementBenefitsAgreement, signSettlementBenefitsAgreement, type AthleticsAidAgreement, type SettlementBenefitsAgreement } from '@/domain/collegeCompensation'
import { compareGameDates } from '@/domain/date'
import { ensureNcaaEnforcement, reportViolation } from '@/engine/enforcement'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { validateTransferAuthorization } from './TransferPortalLifecycle'

export type BenefitsAgreementResult = { readonly ok: true; readonly world: GameWorld; readonly agreement: SettlementBenefitsAgreement } | { readonly ok: false; readonly reason: string }

/** Seeds the documented first-year ceiling, then labels later game years as simulated carry-forward. */
export function ensureInstitutionBenefitsCaps(world: GameWorld): GameWorld {
  const institutions = [...new Set(Object.values(world.competitions).filter((competition) => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike').flatMap((competition) => competition.participantTeamIds.map((teamId) => world.teams[teamId]?.organizationId).filter((id) => id !== undefined)))].sort()
  const currentYear = Number(world.currentDate.slice(0, 4)) - (Number(world.currentDate.slice(5, 7)) < 7 ? 1 : 0)
  const caps = Object.values(world.institutionBenefitsCapsById)
  if (currentYear < 2025) return world
  for (const institutionId of institutions) {
    for (let year = 2025; year <= currentYear; year += 1) {
      const capYear = `${year}-${String((year + 1) % 100).padStart(2, '0')}`
      if (caps.some((item) => item.institutionId === institutionId && item.capYear === capYear)) continue
      const previous = caps.find((item) => item.institutionId === institutionId && item.capYear === `${year - 1}-${String(year % 100).padStart(2, '0')}`)
      if (year > 2025 && previous === undefined) continue
      caps.push(createInstitutionBenefitsCap({ id: `cap:${institutionId}:${capYear}`, institutionId, capYear, annualCapMinorUnits: previous?.annualCapMinorUnits ?? 2_050_000_000, currencyCode: 'USD', version: year === 2025 ? '2025-26.official-baseline' : `${capYear}.simulated`, provenance: year === 2025 ? 'OFFICIAL_SOURCE' : 'SIMULATED_CARRY_FORWARD', ...(year === 2025 ? { source: 'https://www.ncaa.org/news/media-center-di-board-of-directors-conditionally-approves-house-settlement-related-rules-changes/' } : { basedOnCapId: previous!.id }), carryAdjustmentMinorUnits: previous === undefined ? 0 : nextBenefitsCapCarryAdjustment(previous, Object.values(world.settlementBenefitsAgreementsById)), otherCommitmentsMinorUnits: 0, status: year < currentYear ? 'closed' : 'open', ...(year < currentYear ? { closedOn: `${year + 1}-07-01` as import('@/domain/date').GameDate } : {}) }))
    }
  }
  return caps.length === Object.keys(world.institutionBenefitsCapsById).length ? world : updateGameWorld(world, { institutionBenefitsCaps: caps })
}

/** Shared human/AI signing gateway; records the institutional obligation in Finance V2. */
export function signInstitutionBenefits(world: GameWorld, agreement: SettlementBenefitsAgreement, options: { readonly commitUnauthorizedTransfer?: boolean } = {}): BenefitsAgreementResult {
  if (agreement.status !== 'draft' || world.settlementBenefitsAgreementsById[agreement.id]?.status === 'signed') return { ok: false, reason: 'AGREEMENT_ALREADY_SIGNED' }
  const cap = Object.values(world.institutionBenefitsCapsById).find((item) => item.institutionId === agreement.institutionId && item.capYear === agreement.capYear)
  if (cap === undefined) return { ok: false, reason: 'CAP_UNAVAILABLE' }
  const room = availableInstitutionBenefitsRoom(cap, Object.values(world.settlementBenefitsAgreementsById))
  if (agreement.valueMinorUnits > room) return { ok: false, reason: 'CAP_EXCEEDED' }
  const authorization = validateTransferAuthorization(world, agreement.playerId, agreement.teamId, 'BENEFITS_SIGNING', options.commitUnauthorizedTransfer === true)
  if (!authorization.ok) return { ok: false, reason: authorization.reason }
  const actionWorld = authorization.world
  const signed = signSettlementBenefitsAgreement(agreement, actionWorld.currentDate)
  const category = 'STUDENT_ATHLETE_INSTITUTIONAL_BENEFITS_EXPENSE'
  const staged = updateGameWorld(actionWorld, { settlementBenefitsAgreements: [...Object.values(actionWorld.settlementBenefitsAgreementsById).filter((item) => item.id !== agreement.id), signed] })
  const mapping = ensureExpenseAccountMapping(staged, agreement.institutionId, cap.currencyCode, category)
  const event = createAuthorizedEconomicEvent({ id: `event:settlement-benefits:${agreement.id}`, eventType: 'COLLEGE_INSTITUTIONAL_BENEFIT_OBLIGATION', sourceAuthority: 'COLLEGE_COMPENSATION', sourceEntityId: agreement.id, organizationId: agreement.institutionId, effectiveOn: signed.finalSignedOn!, dueOn: agreement.effectiveTo, amount: { currencyCode: cap.currencyCode, minorUnits: agreement.valueMinorUnits }, provenance: { kind: 'SETTLEMENT_BENEFITS_AGREEMENT', id: agreement.id, description: `Player ${agreement.playerId}; cap year ${agreement.capYear}` }, idempotencyKey: agreement.id, teamId: agreement.teamId, dimensions: { teamId: agreement.teamId, reference: { kind: 'SETTLEMENT_BENEFITS_AGREEMENT', id: agreement.id } }, expenseCategory: category })
  const finance = processCollegeInstitutionalBenefitEconomicEvent(mapping.world, event, { ledger: { offsetAccountId: mapping.payableAccount.id, resultAccountId: mapping.expenseAccount.id } })
  if (finance.status === 'rejected' || finance.commitment === undefined || finance.recognition === undefined || finance.payable === undefined || finance.transaction === undefined) return { ok: false, reason: 'FINANCE_POSTING_FAILED' }
  const recorded = { ...signed, financeEventId: event.id, financeCommitmentId: finance.commitment.id, financeExpenseRecognitionId: finance.recognition.id, financePayableId: finance.payable.id, financeTransactionId: finance.transaction.id }
  return { ok: true, agreement: recorded, world: updateGameWorld(finance.world, { settlementBenefitsAgreements: [...Object.values(finance.world.settlementBenefitsAgreementsById).filter((item) => item.id !== agreement.id), recorded] }) }
}

export function signInstitutionalAthleticsAid(world: GameWorld, agreement: AthleticsAidAgreement, options: { readonly commitUnauthorizedTransfer?: boolean } = {}): { readonly ok: true; readonly world: GameWorld; readonly agreement: AthleticsAidAgreement } | { readonly ok: false; readonly reason: string } {
  if (agreement.status !== 'offered' || world.athleticsAidAgreementsById[agreement.id]?.status === 'signed') return { ok: false, reason: 'AID_ALREADY_SIGNED' }
  const authorization = validateTransferAuthorization(world, agreement.playerId, agreement.teamId, 'AID_SIGNING', options.commitUnauthorizedTransfer === true)
  if (!authorization.ok) return { ok: false, reason: authorization.reason }
  const signed = createAthleticsAidAgreement({ ...agreement, signedOn: authorization.world.currentDate, status: 'signed' })
  return { ok: true, agreement: signed, world: updateGameWorld(authorization.world, { athleticsAidAgreements: [...Object.values(authorization.world.athleticsAidAgreementsById).filter((item) => item.id !== agreement.id), signed] }) }
}

/** Reporting remains an institutional action; overdue agreements create one canonical compliance violation. */
export function reportInstitutionBenefits(world: GameWorld, agreementId: string): GameWorld {
  const agreement = world.settlementBenefitsAgreementsById[agreementId]
  if (agreement === undefined || agreement.status !== 'signed' || agreement.reportedOn !== undefined) return world
  const reported = reportSettlementBenefitsAgreement(agreement, world.currentDate)
  const next = updateGameWorld(world, { settlementBenefitsAgreements: Object.values(world.settlementBenefitsAgreementsById).map((item) => item.id === agreementId ? reported : item) })
  return reported.reportingStatus === 'late' ? recordLateBenefitsReport(next, agreementId) : next
}

export function progressInstitutionBenefitsReporting(world: GameWorld): GameWorld {
  let next = world
  for (const agreement of Object.values(world.settlementBenefitsAgreementsById)) {
    if (agreement.status === 'signed' && agreement.reportingDueOn !== undefined && agreement.reportedOn === undefined && compareGameDates(world.currentDate, agreement.reportingDueOn) > 0) next = recordLateBenefitsReport(next, agreement.id)
  }
  return next
}

/** July 1 rollover retains the institution-level source and carries only applicable excess. */
export function rolloverInstitutionBenefitsCaps(world: GameWorld): GameWorld {
  if (world.currentDate.slice(5) !== '07-01') return world
  const priorYear = Number(world.currentDate.slice(0, 4)) - 1
  const priorLabel = `${priorYear}-${String((priorYear + 1) % 100).padStart(2, '0')}`
  const nextLabel = `${priorYear + 1}-${String((priorYear + 2) % 100).padStart(2, '0')}`
  const caps = Object.values(world.institutionBenefitsCapsById)
  const agreements = Object.values(world.settlementBenefitsAgreementsById)
  let changed = false
  const updated = caps.map((cap) => {
    if (cap.capYear !== priorLabel || cap.status === 'closed') return cap
    changed = true
    return createInstitutionBenefitsCap({ ...cap, status: 'closed', closedOn: world.currentDate })
  })
  for (const prior of caps.filter((cap) => cap.capYear === priorLabel)) {
    if (caps.some((cap) => cap.institutionId === prior.institutionId && cap.capYear === nextLabel)) continue
    changed = true
    updated.push(createInstitutionBenefitsCap({ id: `cap:${prior.institutionId}:${nextLabel}`, institutionId: prior.institutionId, capYear: nextLabel, annualCapMinorUnits: prior.annualCapMinorUnits, currencyCode: prior.currencyCode, version: `${nextLabel}.simulated`, provenance: 'SIMULATED_CARRY_FORWARD', basedOnCapId: prior.id, source: prior.source, carryAdjustmentMinorUnits: nextBenefitsCapCarryAdjustment(prior, agreements), otherCommitmentsMinorUnits: 0, status: 'open' }))
  }
  return changed ? updateGameWorld(world, { institutionBenefitsCaps: updated }) : world
}

function recordLateBenefitsReport(world: GameWorld, agreementId: string): GameWorld {
  const agreement = world.settlementBenefitsAgreementsById[agreementId]
  if (agreement === undefined || agreement.reportingViolationId !== undefined) return world
  const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(agreement.teamId) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
  if (competition === undefined) return world
  const id = `violation:institutional-benefits-reporting:${agreement.id}`
  const reported = reportViolation(ensureNcaaEnforcement(world), { id, ecosystemId: competition.ecosystemId, programTeamId: agreement.teamId, playerId: agreement.playerId, category: 'financialReporting', severity: 'minor', source: `INSTITUTIONAL_BENEFITS_REPORTING_LATE:${agreement.id}` })
  if (reported.violationsById[id] === undefined) return world
  return updateGameWorld(reported, { settlementBenefitsAgreements: Object.values(reported.settlementBenefitsAgreementsById).map((item) => item.id === agreement.id ? { ...item, reportingStatus: 'late' as const, reportingViolationId: id } : item) })
}
