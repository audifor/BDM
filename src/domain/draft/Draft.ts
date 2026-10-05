import type { EcosystemId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import { addDays, createGameDate } from '@/domain/date'

export type DraftStatus = 'scheduled' | 'inProgress' | 'completed'
export type DraftRuleProvenance = 'OFFICIAL_SOURCE' | 'SIMULATED_CARRY_FORWARD' | 'PRODUCT_ABSTRACTION'
export interface DraftRules {
  readonly rounds: number
  readonly orderMethod: 'reverseStandings'
  readonly scheduledAfterDays: number
  readonly draftDate?: GameDate
  readonly version?: string
  readonly effectiveFrom?: number
  readonly effectiveThrough?: number
  readonly minimumAgeDuringDraftYear?: number
  readonly postHighSchoolSeasonRequirement?: number
  readonly internationalAutomaticEligibilityAge?: number
  /** Inclusive calendar day: the declaration remains valid through simulation day end. */
  readonly earlyEntryDeadline?: GameDate
  /** Inclusive calendar day: return eligibility is assessed through simulation day end. */
  readonly collegeWithdrawalDeadline?: GameDate
  /** Inclusive calendar day: NBA withdrawal is permitted through simulation day end. */
  readonly finalWithdrawalDeadline?: GameDate
  readonly preEnrollmentOptInEffectiveFrom?: GameDate
  readonly provenance?: DraftRuleProvenance
}
export type DraftEntryStatus = 'considering' | 'declaredEarlyEntry' | 'withdrawnNCAAEligible' | 'withdrawnNCAAIneligible' | 'withdrawnNBA' | 'finalPool' | 'drafted' | 'undrafted'
export interface DraftEntryHistoryEvent { readonly status: DraftEntryStatus; readonly occurredOn: GameDate }
export interface CollegeReturnAssessment { readonly assessedOn: GameDate; readonly allowed: boolean; readonly deadline?: GameDate; readonly rulesetId?: string; readonly rulesetVersion?: string; readonly reasons: readonly string[] }
export interface DraftEntry { readonly id: string; readonly draftId: string; readonly playerId: PlayerId; readonly status: DraftEntryStatus; readonly entryType: 'early' | 'automatic' | 'preEnrollment'; readonly sourcePathway: 'college' | 'international' | 'other'; readonly declaredOn?: GameDate; readonly withdrawnOn?: GameDate; readonly collegeReturnAssessment?: CollegeReturnAssessment; readonly provenance: DraftRuleProvenance; readonly history?: readonly DraftEntryHistoryEvent[] }
export interface Draft { readonly id: string; readonly ecosystemId: EcosystemId; readonly sourceSeasonId: SeasonId; readonly rules: DraftRules; readonly scheduledOn: GameDate; readonly status: DraftStatus; /** Bootstrap/legacy IDs only; current candidate membership is derived from DraftEntry and eligibility. */ readonly prospectPlayerIds: readonly PlayerId[]; readonly entries?: readonly DraftEntry[] }
export interface DraftPick { readonly id: string; readonly draftId: string; readonly round: number; readonly order: number; readonly originalTeamId: TeamId; readonly ownerTeamId: TeamId; readonly selection?: { readonly playerId: PlayerId; readonly teamId: TeamId } }
export function createDraftRules(input: DraftRules): DraftRules { if (!Number.isInteger(input.rounds) || input.rounds < 1 || !Number.isInteger(input.scheduledAfterDays) || input.scheduledAfterDays < 0 || input.orderMethod !== 'reverseStandings' || (input.minimumAgeDuringDraftYear !== undefined && (!Number.isInteger(input.minimumAgeDuringDraftYear) || input.minimumAgeDuringDraftYear < 1)) || (input.internationalAutomaticEligibilityAge !== undefined && (!Number.isInteger(input.internationalAutomaticEligibilityAge) || input.internationalAutomaticEligibilityAge < 1)) || (input.effectiveThrough !== undefined && input.effectiveFrom !== undefined && input.effectiveThrough < input.effectiveFrom)) throw new RangeError('Draft rules are invalid'); return Object.freeze({ ...input }) }
export function nbaDraftRulesForYear(year: number, rounds = 2): DraftRules {
  if (!Number.isInteger(year) || year < 1947) throw new RangeError('Draft year is invalid')
  const annual2026 = year === 2026
  const simulatedDraftDate = createGameDate(year, 6, 23)
  return createDraftRules({ rounds, orderMethod: 'reverseStandings', scheduledAfterDays: 7, draftDate: annual2026 ? '2026-06-23' as GameDate : simulatedDraftDate, version: annual2026 ? 'NBA-NBPA-CBA-2023/2026-DATES' : 'NBA-NBPA-CBA-2023-CARRY-FORWARD', effectiveFrom: year > 2030 ? 2031 : 2023, ...(year > 2030 ? {} : { effectiveThrough: 2030 }), minimumAgeDuringDraftYear: 19, postHighSchoolSeasonRequirement: 1, internationalAutomaticEligibilityAge: 22, ...(annual2026 ? { preEnrollmentOptInEffectiveFrom: '2026-04-15' as GameDate, earlyEntryDeadline: '2026-04-24' as GameDate, collegeWithdrawalDeadline: '2026-05-27' as GameDate, finalWithdrawalDeadline: '2026-06-13' as GameDate, provenance: 'OFFICIAL_SOURCE' as const } : { earlyEntryDeadline: addDays(simulatedDraftDate, -60), collegeWithdrawalDeadline: addDays(simulatedDraftDate, -27), finalWithdrawalDeadline: addDays(simulatedDraftDate, -10), provenance: 'SIMULATED_CARRY_FORWARD' as const }) })
}
