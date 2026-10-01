import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { CoachId, GameId, InjuryId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { DelegationOutcomeId } from '@/domain/responsibility'

export type InjuryKind = 'ankleSprain' | 'hamstringStrain' | 'kneeSprain' | 'backStrain' | 'handInjury' | 'shoulderStrain'
export type InjurySeverity = 'minor' | 'moderate' | 'serious'
export type InjurySource = 'MATCH' | 'TRAINING'
export type InjuryFamily = 'LOWER_LEG' | 'HAMSTRING' | 'KNEE' | 'BACK' | 'HAND' | 'SHOULDER'
export type RehabilitationMode = 'REST' | 'STANDARD_REHAB' | 'ACCELERATED_REHAB'
export type FitnessTestResult = 'PASS' | 'BORDERLINE' | 'FAIL'
export type MedicalActionActor =
  | { readonly kind: 'USER'; readonly coachId: CoachId }
  | { readonly kind: 'AI'; readonly teamId: TeamId }

export interface RehabilitationPlanChange {
  readonly changedOn: GameDate
  readonly mode: RehabilitationMode
  readonly actor: MedicalActionActor
}

export interface RehabilitationState {
  readonly mode: RehabilitationMode
  readonly startedOn: GameDate
  readonly changedOn: GameDate
  readonly history: readonly RehabilitationPlanChange[]
}

export interface RehabilitationSetback {
  readonly id: string
  readonly occurredOn: GameDate
  readonly mode: RehabilitationMode
  readonly reason: 'REHAB_SETBACK'
  readonly daysAdded: number
}

export interface FitnessTestRecord {
  readonly id: string
  readonly testedOn: GameDate
  readonly result: FitnessTestResult
  readonly actor: MedicalActionActor
  readonly staffId?: StaffPersonId
  readonly qualityScore?: number
}
export type ReturnToPlayDecision = 'CLEAR_FOR_PLAY' | 'CONTINUE_RECOVERY'
export type ReturnToPlayReviewActor = MedicalActionActor

export interface ReturnToPlayReview {
  readonly reviewedOn: GameDate
  readonly decision: ReturnToPlayDecision
  readonly actor: ReturnToPlayReviewActor
  readonly staffId?: StaffPersonId
  readonly recommendationOutcomeId?: DelegationOutcomeId
}

export interface ReturnToPlayState {
  /** Projected review date; deferral may move this without changing expectedReturnDate. */
  readonly reviewDueOn: GameDate
  /** Actual date the canonical clearance decision was made. */
  readonly clearedOn?: GameDate
  readonly reviews: readonly ReturnToPlayReview[]
}

export interface InjuryRecord {
  readonly id: InjuryId
  readonly playerId: PlayerId
  readonly kind: InjuryKind
  readonly severity: InjurySeverity
  readonly injuredOn: GameDate
  /** Projected recovery date and first RTP review date, not automatic clearance for new injuries. */
  readonly expectedReturnDate: GameDate
  readonly sourceGameId?: GameId
  readonly source?: InjurySource
  readonly sourceTrainingSessionId?: string
  /** Optional only for legacy serialized records; canonical injuries have this state. */
  readonly returnToPlay?: ReturnToPlayState
  readonly rehabilitation?: RehabilitationState
  readonly rehabilitationSetbacks?: readonly RehabilitationSetback[]
  readonly fitnessTests?: readonly FitnessTestRecord[]
}

export function injuryFamilyForKind(kind: InjuryKind): InjuryFamily {
  return ({ ankleSprain: 'LOWER_LEG', hamstringStrain: 'HAMSTRING', kneeSprain: 'KNEE', backStrain: 'BACK', handInjury: 'HAND', shoulderStrain: 'SHOULDER' } as const)[kind]
}

export function hasPriorRelatedInjury(injury: InjuryRecord, history: readonly InjuryRecord[]): boolean {
  return history.some((prior) => prior.playerId === injury.playerId && prior.id !== injury.id
    && injuryFamilyForKind(prior.kind) === injuryFamilyForKind(injury.kind)
    && compareGameDates(prior.injuredOn, injury.injuredOn) < 0)
}

export function requiresFitnessTestForSeverity(severity: InjurySeverity, hasRelatedHistory: boolean): boolean {
  return severity === 'serious' || (severity === 'moderate' && hasRelatedHistory)
}

export function createInjury(input: InjuryRecord): InjuryRecord {
  if (!['ankleSprain', 'hamstringStrain', 'kneeSprain', 'backStrain', 'handInjury', 'shoulderStrain'].includes(input.kind)) throw new TypeError('Injury kind is invalid')
  if (!['minor', 'moderate', 'serious'].includes(input.severity)) throw new TypeError('Injury severity is invalid')
  if (input.source !== undefined && !['MATCH', 'TRAINING'].includes(input.source)) throw new TypeError('Injury source is invalid')
  if (input.source === 'TRAINING' && (input.sourceTrainingSessionId === undefined || input.sourceGameId !== undefined)) throw new TypeError('Training injury source evidence is invalid')
  if (input.source === 'MATCH' && (input.sourceGameId === undefined || input.sourceTrainingSessionId !== undefined)) throw new TypeError('Match injury source evidence is invalid')
  if (compareGameDates(input.expectedReturnDate, input.injuredOn) <= 0) throw new RangeError('Injury expected return date must be after injuredOn')
  const returnToPlay = input.returnToPlay ?? { reviewDueOn: input.expectedReturnDate, reviews: [] }
  if (compareGameDates(returnToPlay.reviewDueOn, input.injuredOn) <= 0) throw new RangeError('Injury review date must be after injuredOn')
  if (returnToPlay.clearedOn !== undefined && compareGameDates(returnToPlay.clearedOn, input.injuredOn) < 0) throw new RangeError('Injury clearance date cannot precede injuredOn')
  for (const review of returnToPlay.reviews) {
    if (compareGameDates(review.reviewedOn, input.injuredOn) < 0) throw new RangeError('Injury review cannot precede injuredOn')
    if (review.decision !== 'CLEAR_FOR_PLAY' && review.decision !== 'CONTINUE_RECOVERY') throw new TypeError('Return-to-Play decision is invalid')
    if (review.actor.kind !== 'USER' && review.actor.kind !== 'AI') throw new TypeError('Return-to-Play actor is invalid')
  }
  const rehabilitation = input.rehabilitation ?? {
    mode: 'STANDARD_REHAB' as const,
    startedOn: input.injuredOn,
    changedOn: input.injuredOn,
    history: [],
  }
  if (!['REST', 'STANDARD_REHAB', 'ACCELERATED_REHAB'].includes(rehabilitation.mode)) throw new TypeError('Rehabilitation mode is invalid')
  if (compareGameDates(rehabilitation.startedOn, input.injuredOn) < 0 || compareGameDates(rehabilitation.changedOn, input.injuredOn) < 0) throw new RangeError('Rehabilitation dates cannot precede injury')
  for (const change of rehabilitation.history) if (compareGameDates(change.changedOn, input.injuredOn) < 0 || !['REST', 'STANDARD_REHAB', 'ACCELERATED_REHAB'].includes(change.mode) || (change.actor.kind !== 'USER' && change.actor.kind !== 'AI')) throw new TypeError('Rehabilitation history is invalid')
  const rehabilitationSetbacks = input.rehabilitationSetbacks ?? []
  if (new Set(rehabilitationSetbacks.map((item) => item.id)).size !== rehabilitationSetbacks.length || rehabilitationSetbacks.some((item) => compareGameDates(item.occurredOn, input.injuredOn) < 0 || item.reason !== 'REHAB_SETBACK' || !Number.isInteger(item.daysAdded) || item.daysAdded < 1 || item.daysAdded > 7)) throw new TypeError('Rehabilitation setback is invalid')
  const fitnessTests = input.fitnessTests ?? []
  if (new Set(fitnessTests.map((item) => item.id)).size !== fitnessTests.length || fitnessTests.some((item) => compareGameDates(item.testedOn, input.injuredOn) < 0 || !['PASS', 'BORDERLINE', 'FAIL'].includes(item.result) || (item.actor.kind !== 'USER' && item.actor.kind !== 'AI') || (item.qualityScore !== undefined && (!Number.isInteger(item.qualityScore) || item.qualityScore < 0 || item.qualityScore > 100)))) throw new TypeError('Fitness test record is invalid')
  return {
    ...input,
    returnToPlay: { ...returnToPlay, reviews: returnToPlay.reviews.map((review) => ({ ...review, actor: { ...review.actor } })) },
    rehabilitation: { ...rehabilitation, history: rehabilitation.history.map((change) => ({ ...change, actor: { ...change.actor } })) },
    rehabilitationSetbacks: rehabilitationSetbacks.map((item) => ({ ...item })),
    fitnessTests: fitnessTests.map((item) => ({ ...item, actor: { ...item.actor } })),
  }
}

export type InjuryLifecycleStatus = 'RECOVERING' | 'RTP_REVIEW_DUE' | 'CLEARED'

/** Initial review projection moves at most two days and only after half the recovery period elapsed. */
export function projectedInjuryReviewDate(injury: InjuryRecord, asOfDate: GameDate): GameDate {
  const state = injury.returnToPlay ?? { reviewDueOn: injury.expectedReturnDate, reviews: [] }
  if (state.clearedOn !== undefined || state.reviews.length > 0 || (injury.fitnessTests?.length ?? 0) > 0) return state.reviewDueOn
  const daysBetween = (from: GameDate, to: GameDate) => Math.round((Date.parse(parseGameDate(to)) - Date.parse(parseGameDate(from))) / 86_400_000)
  const recoveryDays = Math.max(1, daysBetween(injury.injuredOn, injury.expectedReturnDate))
  const elapsedDays = Math.max(0, daysBetween(injury.injuredOn, asOfDate))
  const rehabMode = injury.rehabilitation?.mode ?? 'STANDARD_REHAB'
  const adjustment = elapsedDays * 2 < recoveryDays
    ? 0
    : rehabMode === 'REST' ? Math.min(2, Math.ceil(recoveryDays / 30))
      : rehabMode === 'ACCELERATED_REHAB' ? -Math.min(2, Math.ceil(recoveryDays / 30))
        : 0
  const setbackDays = (injury.rehabilitationSetbacks ?? []).reduce((total, setback) => total + setback.daysAdded, 0)
  return addDays(injury.expectedReturnDate, adjustment + setbackDays)
}

export function injuryLifecycleStatus(injury: InjuryRecord, date: GameDate): InjuryLifecycleStatus {
  if (injury.returnToPlay === undefined) return compareGameDates(date, injury.expectedReturnDate) < 0 ? 'RECOVERING' : 'CLEARED'
  if (injury.returnToPlay.clearedOn !== undefined && compareGameDates(date, injury.returnToPlay.clearedOn) >= 0) return 'CLEARED'
  return compareGameDates(date, projectedInjuryReviewDate(injury, date)) >= 0 ? 'RTP_REVIEW_DUE' : 'RECOVERING'
}

export function isInjuryActive(injury: InjuryRecord, date: GameDate): boolean {
  if (compareGameDates(injury.injuredOn, date) > 0) return false
  return injuryLifecycleStatus(injury, date) !== 'CLEARED'
}

export function migrateLegacyInjury(injury: InjuryRecord, currentDate: GameDate): InjuryRecord {
  if (injury.returnToPlay !== undefined) return createInjury(injury)
  const reviewedOn = compareGameDates(currentDate, injury.expectedReturnDate) > 0 ? injury.expectedReturnDate : undefined
  return createInjury({
    ...injury,
    returnToPlay: {
      reviewDueOn: injury.expectedReturnDate,
      ...(reviewedOn === undefined ? {} : { clearedOn: reviewedOn }),
      reviews: [],
    },
  })
}

export function recoveryDaysForSeverity(severity: InjurySeverity): readonly [number, number] {
  return severity === 'minor' ? [3, 7] : severity === 'moderate' ? [8, 21] : [22, 60]
}

export function injuryReturnDate(injuredOn: GameDate, recoveryDays: number): GameDate {
  return addDays(injuredOn, recoveryDays)
}

export function formatInjuryKind(kind: InjuryKind): string {
  return { ankleSprain: 'Ankle sprain', hamstringStrain: 'Hamstring strain', kneeSprain: 'Knee sprain', backStrain: 'Back strain', handInjury: 'Hand injury', shoulderStrain: 'Shoulder strain' }[kind]
}
