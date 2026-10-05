import type { MatchNextClockRules } from './setup'
import type { BallDeadReason } from './ball/BallState'
import type { TeamId } from '@/domain/ids'

export type MatchBallDeadReason = BallDeadReason

/** Reads the actual competition-resolved clock rule carried by MatchSetup. */
export function shouldStopGameClock(reason: MatchBallDeadReason, period: number, gameClockTenths: number, rules: MatchNextClockRules): boolean {
  // A whistle or a free throw always stops the clock, whatever the competition says about other dead balls.
  if (reason === 'foul' || reason === 'freeThrow') return true
  if (reason === 'madeBasket') {
    const threshold = period > rules.periodCount
      ? rules.madeBasketClockStopUnderSecondsInFinalPeriod ?? null
      : period === rules.periodCount
        ? rules.madeBasketClockStopUnderSecondsInFinalPeriod ?? null
        : rules.madeBasketClockStopUnderSecondsInOtherPeriods ?? null
    return threshold !== null && gameClockTenths <= threshold * 10
  }
  return (rules.clockStopReasons ?? ['outOfBounds', 'other', 'shotClockViolation']).includes(reason as 'outOfBounds' | 'other' | 'shotClockViolation')
}

/** Ball-dead, clock-stop, and substitution-window state are resolved independently from competition rules. */
export function isSubstitutionOpportunity(reason: MatchBallDeadReason, period: number, gameClockTenths: number, rules: MatchNextClockRules, actingTeamId?: TeamId, restartTeamId?: TeamId): boolean {
  if (reason === 'madeBasket') {
    const threshold = period > rules.periodCount
      ? rules.madeBasketSubstitutionUnderSecondsInFinalPeriod === undefined ? rules.madeBasketClockStopUnderSecondsInFinalPeriod ?? null : rules.madeBasketSubstitutionUnderSecondsInFinalPeriod
      : period === rules.periodCount
        ? rules.madeBasketSubstitutionUnderSecondsInFinalPeriod === undefined ? rules.madeBasketClockStopUnderSecondsInFinalPeriod ?? null : rules.madeBasketSubstitutionUnderSecondsInFinalPeriod
        : rules.madeBasketSubstitutionUnderSecondsInOtherPeriods === undefined ? rules.madeBasketClockStopUnderSecondsInOtherPeriods ?? null : rules.madeBasketSubstitutionUnderSecondsInOtherPeriods
    return threshold !== null && gameClockTenths <= threshold * 10
      && (rules.madeBasketSubstitutionEligibleTeam !== 'nonScoring' || actingTeamId !== undefined && actingTeamId === restartTeamId)
  }
  // Fouls always open a substitution window; the free throws in between do not.
  if (reason === 'foul') return true
  if (reason === 'freeThrow') return false
  return (rules.substitutionOpportunityReasons ?? ['outOfBounds', 'other', 'shotClockViolation']).includes(reason as 'outOfBounds' | 'other' | 'shotClockViolation')
}

export function whenDoesClockRestart(rules: MatchNextClockRules): 'release' | 'receive' {
  return rules.clockRestartOnInbound ?? 'receive'
}
