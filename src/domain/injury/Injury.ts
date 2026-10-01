import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import type { CoachId, GameId, InjuryId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { DelegationOutcomeId } from '@/domain/responsibility'

export type InjuryKind = 'ankleSprain' | 'hamstringStrain' | 'kneeSprain' | 'backStrain' | 'handInjury' | 'shoulderStrain'
export type InjurySeverity = 'minor' | 'moderate' | 'serious'
export type ReturnToPlayDecision = 'CLEAR_FOR_PLAY' | 'CONTINUE_RECOVERY'
export type ReturnToPlayReviewActor =
  | { readonly kind: 'USER'; readonly coachId: CoachId }
  | { readonly kind: 'AI'; readonly teamId: TeamId }

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
  /** Optional only for legacy serialized records; canonical injuries have this state. */
  readonly returnToPlay?: ReturnToPlayState
}

export function createInjury(input: InjuryRecord): InjuryRecord {
  if (!['ankleSprain', 'hamstringStrain', 'kneeSprain', 'backStrain', 'handInjury', 'shoulderStrain'].includes(input.kind)) throw new TypeError('Injury kind is invalid')
  if (!['minor', 'moderate', 'serious'].includes(input.severity)) throw new TypeError('Injury severity is invalid')
  if (compareGameDates(input.expectedReturnDate, input.injuredOn) <= 0) throw new RangeError('Injury expected return date must be after injuredOn')
  const returnToPlay = input.returnToPlay ?? { reviewDueOn: input.expectedReturnDate, reviews: [] }
  if (compareGameDates(returnToPlay.reviewDueOn, input.injuredOn) <= 0) throw new RangeError('Injury review date must be after injuredOn')
  if (returnToPlay.clearedOn !== undefined && compareGameDates(returnToPlay.clearedOn, input.injuredOn) < 0) throw new RangeError('Injury clearance date cannot precede injuredOn')
  for (const review of returnToPlay.reviews) {
    if (compareGameDates(review.reviewedOn, input.injuredOn) < 0) throw new RangeError('Injury review cannot precede injuredOn')
    if (review.decision !== 'CLEAR_FOR_PLAY' && review.decision !== 'CONTINUE_RECOVERY') throw new TypeError('Return-to-Play decision is invalid')
    if (review.actor.kind !== 'USER' && review.actor.kind !== 'AI') throw new TypeError('Return-to-Play actor is invalid')
  }
  return { ...input, returnToPlay: { ...returnToPlay, reviews: returnToPlay.reviews.map((review) => ({ ...review, actor: { ...review.actor } })) } }
}

export type InjuryLifecycleStatus = 'RECOVERING' | 'RTP_REVIEW_DUE' | 'CLEARED'

export function injuryLifecycleStatus(injury: InjuryRecord, date: GameDate): InjuryLifecycleStatus {
  if (injury.returnToPlay === undefined) return compareGameDates(date, injury.expectedReturnDate) < 0 ? 'RECOVERING' : 'CLEARED'
  if (injury.returnToPlay.clearedOn !== undefined && compareGameDates(date, injury.returnToPlay.clearedOn) >= 0) return 'CLEARED'
  return compareGameDates(date, injury.returnToPlay.reviewDueOn) >= 0 ? 'RTP_REVIEW_DUE' : 'RECOVERING'
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
