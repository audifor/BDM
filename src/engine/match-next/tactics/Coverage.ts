import type { MatchPlayerState, MatchState, ScreenCoverage } from '../state'
import { clamp, rollerScore, tacticalIntent } from './TacticalIdentity'

export interface CoverageCall {
  readonly coverage: ScreenCoverage
  /** 0..1 how deep the screener's defender sits in a drop (from the plan, the screener's threat and the handler's shot). */
  readonly dropDepth: number
  /** Ticks the two defenders need to agree on the switch / the trap: a team that does not know the scheme reacts later. */
  readonly communicationTicks: number
  readonly reason: string
}

/**
 * BT5.13: how this defense covers THIS ball screen. The base coverage is the coach's (or the in-game adjustment); a coach who reads
 * matchups adapts it to the two men in the action, from scouting-level information only (what a handler and a screener are known to
 * do), never from the play in progress.
 */
export function chooseCoverage(state: MatchState, defendingTeamId: MatchPlayerState['teamId'], handler: MatchPlayerState, screener: MatchPlayerState, handlerDefender: MatchPlayerState, screenerDefender: MatchPlayerState): CoverageCall {
  const intent = tacticalIntent(state, defendingTeamId)
  const knowledge = intent.coach.tacticalKnowledge / 100
  let coverage = intent.defense.coverage
  const reasons: string[] = [intent.layers.adjustment?.coverage !== undefined ? `in-game adjustment to ${coverage}` : `base ${coverage}`]
  // Matchup awareness: only a coach who knows his matchups bends the base coverage, and only for clear cases.
  if (knowledge >= 0.4) {
    if (coverage === 'switch' && screenerDefender.defensiveMobility < handler.offense.creation - 28) {
      coverage = 'drop'
      reasons.push('switch except the slow big: he cannot stay in front of this handler')
    } else if (coverage === 'drop' && handler.offense.shooting >= 80 && screenerDefender.defensiveMobility >= 60 && knowledge >= 0.55) {
      coverage = 'hedge'
      reasons.push('elite pull-up shooter: do not give him the space a drop concedes')
    } else if (coverage === 'blitz' && screener.offense.shooting >= 78 && knowledge >= 0.7) {
      coverage = 'hedge'
      reasons.push('the screener pops and shoots: a trap leaves him open')
    }
  }
  const shooterThreat = clamp((handler.offense.shooting - 60) / 30, 0, 1)
  const rollThreat = clamp((rollerScore(screener) - 55) / 30, 0, 1)
  const dropDepth = clamp(intent.defense.dropDepth - 0.3 * shooterThreat + 0.2 * rollThreat - 0.15 * clamp((screenerDefender.defensiveMobility - 60) / 30, 0, 1), 0, 1)
  const communicationTicks = Math.round((1 - intent.familiarity) * 5)
  return { coverage, dropDepth, communicationTicks, reason: reasons.join('; ') }
}

/** Distance from the basket at which the screener's defender waits in a drop: at the level of the screen (shallow) down to the paint (deep). */
export function dropDistanceFromBasket(handlerDistanceToBasket: number, dropDepth: number): number {
  return clamp(handlerDistanceToBasket - (1.2 + 3.6 * dropDepth), 2.3, Math.max(2.3, handlerDistanceToBasket - 1.0))
}
