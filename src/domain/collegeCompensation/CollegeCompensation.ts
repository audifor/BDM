import { addBusinessDays } from '@/domain/eligibility'
import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId, PlayerId, TeamId } from '@/domain/ids'

export type AidChangeReason = 'institutionalChange' | 'headCoachChange' | 'athleticAbility' | 'misconduct' | 'other'
export type AthleticsAidStatus = 'offered' | 'signed' | 'reduced' | 'cancelled' | 'nonrenewed'
export interface AthleticsAidChange { readonly id: string; readonly action: 'award' | 'renewal' | 'reduction' | 'cancellation' | 'nonrenewal'; readonly date: GameDate; readonly priorValueMinorUnits: number; readonly valueMinorUnits: number; readonly reason?: AidChangeReason; readonly provenance: string }
export interface AthleticsAidAgreement { readonly id: string; readonly playerId: PlayerId; readonly teamId: TeamId; readonly institutionId: OrganizationId; readonly academicPeriod: string; readonly valueMinorUnits: number; readonly effectiveFrom: GameDate; readonly effectiveTo: GameDate; readonly offeredOn: GameDate; readonly signedOn?: GameDate; readonly status: AthleticsAidStatus; readonly changeReason?: AidChangeReason; readonly provenance: string; readonly history: readonly AthleticsAidChange[] }
export type BenefitsCapProvenance = 'OFFICIAL_SOURCE' | 'SIMULATED_CARRY_FORWARD'
export interface InstitutionBenefitsCap { readonly id: string; readonly institutionId: OrganizationId; readonly capYear: string; readonly annualCapMinorUnits: number; readonly currencyCode: string; readonly version: string; readonly provenance: BenefitsCapProvenance; readonly source?: string; readonly basedOnCapId?: string; readonly carryAdjustmentMinorUnits: number; readonly otherCommitmentsMinorUnits: number; readonly qualifyingIncrementalScholarshipOverageMinorUnits?: number; readonly incrementalScholarshipExceptionSource?: string; readonly status?: 'open' | 'closed'; readonly closedOn?: GameDate }
export type BenefitsReportingStatus = 'notSigned' | 'pending' | 'reported' | 'late'
export interface SettlementBenefitsAgreement { readonly id: string; readonly playerId: PlayerId; readonly teamId: TeamId; readonly institutionId: OrganizationId; readonly capYear: string; readonly valueMinorUnits: number; readonly finalSignedOn?: GameDate; readonly effectiveFrom: GameDate; readonly effectiveTo: GameDate; readonly status: 'draft' | 'signed' | 'cancelled'; readonly reportingDueOn?: GameDate; readonly reportedOn?: GameDate; readonly reportingStatus: BenefitsReportingStatus; readonly provenance: string; readonly financeEventId?: string; readonly financeCommitmentId?: string; readonly financeExpenseRecognitionId?: string; readonly financePayableId?: string; readonly financeTransactionId?: string; readonly reportingViolationId?: string }

function money(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be non-negative integer minor units`); return value }
function required(value: string, label: string): string { if (!value.trim()) throw new TypeError(`${label} is required`); return value }
function interval(from: GameDate, to: GameDate): void { parseGameDate(from); parseGameDate(to); if (compareGameDates(to, from) < 0) throw new RangeError('Effective period is invalid') }

export function createAthleticsAidAgreement(value: AthleticsAidAgreement): AthleticsAidAgreement {
  required(value.id, 'Aid agreement ID'); required(value.academicPeriod, 'Academic period'); required(value.provenance, 'Aid provenance');
  money(value.valueMinorUnits, 'Aid value'); interval(value.effectiveFrom, value.effectiveTo); parseGameDate(value.offeredOn); if (value.signedOn) parseGameDate(value.signedOn)
  if (value.status !== 'offered' && value.signedOn === undefined && value.status !== 'nonrenewed') throw new TypeError('Signed aid status requires a signature date')
  return Object.freeze({ ...value, history: Object.freeze([...value.history]) })
}

export function recordAthleticsAidChange(prior: AthleticsAidAgreement, input: { readonly id: string; readonly action: AthleticsAidChange['action']; readonly date: GameDate; readonly valueMinorUnits: number; readonly reason?: AidChangeReason; readonly provenance: string }): AthleticsAidAgreement {
  if (prior.history.some((item) => item.id === input.id)) return prior
  money(input.valueMinorUnits, 'Aid change value'); parseGameDate(input.date); required(input.provenance, 'Aid change provenance')
  const decreases = ['reduction', 'cancellation', 'nonrenewal'].includes(input.action)
  if (decreases && input.valueMinorUnits >= prior.valueMinorUnits) throw new RangeError('Aid reduction must lower the award value')
  const status: AthleticsAidStatus = input.action === 'cancellation' ? 'cancelled' : input.action === 'nonrenewal' ? 'nonrenewed' : input.action === 'reduction' ? 'reduced' : 'signed'
  const change: AthleticsAidChange = { id: input.id, action: input.action, date: input.date, priorValueMinorUnits: prior.valueMinorUnits, valueMinorUnits: input.valueMinorUnits, ...(input.reason === undefined ? {} : { reason: input.reason }), provenance: input.provenance }
  return createAthleticsAidAgreement({ ...prior, valueMinorUnits: input.valueMinorUnits, status, ...(input.reason === undefined ? {} : { changeReason: input.reason }), history: [...prior.history, change] })
}

export function aidChangeQualifiesForPortal(agreement: AthleticsAidAgreement, changeId: string): boolean {
  const change = agreement.history.find((item) => item.id === changeId)
  return change !== undefined && ['reduction', 'cancellation', 'nonrenewal'].includes(change.action) && (change.reason === 'institutionalChange' || change.reason === 'headCoachChange')
}

export function createInstitutionBenefitsCap(value: InstitutionBenefitsCap): InstitutionBenefitsCap {
  required(value.id, 'Benefits cap ID'); required(value.capYear, 'Cap year'); required(value.version, 'Cap version'); required(value.currencyCode, 'Currency code')
  if (!/^\d{4}-\d{2}$/.test(value.capYear)) throw new TypeError('Cap year must use YYYY-YY')
  money(value.annualCapMinorUnits, 'Annual benefits cap'); money(value.otherCommitmentsMinorUnits, 'Other institution commitments')
  if (value.qualifyingIncrementalScholarshipOverageMinorUnits !== undefined) money(value.qualifyingIncrementalScholarshipOverageMinorUnits, 'Qualifying incremental scholarship overage')
  if ((value.qualifyingIncrementalScholarshipOverageMinorUnits ?? 0) > 0 && !value.incrementalScholarshipExceptionSource) throw new TypeError('Incremental scholarship exception requires source provenance')
  if (value.closedOn !== undefined) parseGameDate(value.closedOn)
  if (value.status === 'closed' && value.closedOn === undefined) throw new TypeError('Closed benefits cap requires closure date')
  if (!Number.isSafeInteger(value.carryAdjustmentMinorUnits)) throw new RangeError('Carry adjustment must be safe integer minor units')
  if (value.provenance === 'OFFICIAL_SOURCE' && !value.source) throw new TypeError('Official cap requires a source')
  if (value.provenance === 'SIMULATED_CARRY_FORWARD' && !value.basedOnCapId) throw new TypeError('Simulated cap must cite a prior cap')
  return Object.freeze({ ...value })
}

export function createSettlementBenefitsAgreement(value: SettlementBenefitsAgreement): SettlementBenefitsAgreement {
  required(value.id, 'Benefits agreement ID'); required(value.capYear, 'Cap year'); required(value.provenance, 'Benefits provenance')
  money(value.valueMinorUnits, 'Benefits agreement value'); interval(value.effectiveFrom, value.effectiveTo)
  if (value.finalSignedOn !== undefined) parseGameDate(value.finalSignedOn)
  if (value.status === 'signed' && (value.finalSignedOn === undefined || value.reportingDueOn === undefined || value.reportingStatus === 'notSigned')) throw new TypeError('Signed agreement requires final signature and reporting deadline')
  if (value.reportingDueOn !== undefined) parseGameDate(value.reportingDueOn)
  if (value.reportedOn !== undefined) parseGameDate(value.reportedOn)
  return Object.freeze({ ...value })
}

export function signSettlementBenefitsAgreement(value: SettlementBenefitsAgreement, signedOn: GameDate): SettlementBenefitsAgreement {
  if (value.status !== 'draft') throw new TypeError('Only a draft benefits agreement can be signed')
  return createSettlementBenefitsAgreement({ ...value, status: 'signed', finalSignedOn: signedOn, reportingDueOn: addBusinessDays(signedOn, 5), reportingStatus: 'pending' })
}

export function reportSettlementBenefitsAgreement(value: SettlementBenefitsAgreement, reportedOn: GameDate): SettlementBenefitsAgreement {
  if (value.status !== 'signed' || value.reportingDueOn === undefined || value.reportingStatus === 'reported') return value
  return createSettlementBenefitsAgreement({ ...value, reportedOn, reportingStatus: compareGameDates(reportedOn, value.reportingDueOn) <= 0 ? 'reported' : 'late' })
}

export function availableInstitutionBenefitsRoom(cap: InstitutionBenefitsCap, agreements: readonly SettlementBenefitsAgreement[]): number {
  const committed = agreements.filter((item) => item.institutionId === cap.institutionId && item.capYear === cap.capYear && item.status === 'signed').reduce((total, item) => total + item.valueMinorUnits, 0)
  return Math.max(0, cap.annualCapMinorUnits + cap.carryAdjustmentMinorUnits - cap.otherCommitmentsMinorUnits - committed)
}

/** Applicable overage reduces the immediately following institution-year cap. */
export function nextBenefitsCapCarryAdjustment(cap: InstitutionBenefitsCap, agreements: readonly SettlementBenefitsAgreement[]): number {
  const committed = cap.otherCommitmentsMinorUnits + agreements.filter((item) => item.institutionId === cap.institutionId && item.capYear === cap.capYear && item.status === 'signed').reduce((total, item) => total + item.valueMinorUnits, 0)
  const overage = committed - (cap.annualCapMinorUnits + cap.carryAdjustmentMinorUnits)
  return overage > 0 ? -Math.max(0, overage - (cap.qualifyingIncrementalScholarshipOverageMinorUnits ?? 0)) : 0
}
