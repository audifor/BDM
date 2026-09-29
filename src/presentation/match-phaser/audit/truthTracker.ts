/**
 * Tracks the small amount of cross-step context the Basketball Truth frame needs (how long the
 * current possession has been running) so the browser demo and the headless audit build the exact
 * same TruthFrame for the same engine step. Debug-only; holds no gameplay state.
 */

import type { MatchSessionState } from '@/engine/match'
import { buildTruthFrame, type TruthFrame } from './basketballTruth'

export class TruthTracker {
  private possessionTeam: string | undefined
  private possessionStartClock = 0
  private possessionPeriod = 0

  public constructor(initial: MatchSessionState) {
    this.possessionTeam = String(initial.attackingTeamId)
    this.possessionStartClock = initial.clockSecondsRemaining
    this.possessionPeriod = initial.period
  }

  public frameFor(before: MatchSessionState, after: MatchSessionState, presentationFrame?: number): TruthFrame {
    if (String(after.attackingTeamId) !== this.possessionTeam || after.period !== this.possessionPeriod) {
      this.possessionTeam = String(after.attackingTeamId)
      this.possessionStartClock = before.clockSecondsRemaining
      this.possessionPeriod = after.period
    }
    const elapsed = after.period === this.possessionPeriod ? this.possessionStartClock - after.clockSecondsRemaining : 0
    return buildTruthFrame(after, {
      previous: before,
      newEvents: after.events.slice(before.events.length),
      possessionElapsedSeconds: elapsed,
      ...(presentationFrame === undefined ? {} : { presentationFrame }),
    })
  }
}
