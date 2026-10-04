import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import type { MatchSetup } from '@/engine/match-next'
import type { MatchTacticalPlan } from '@/engine/match'
import { prepareMatchSetup } from './prepareMatchSetup'
import { MatchNextLiveController } from './MatchNextLiveController'
import { type MatchNextResult } from './MatchNextResult'
import { completeMatchNext } from './applyMatchNextResult'
import type { MatchEnginePort } from './MatchEnginePort'

export type MatchExecutionMode = 'FULL' | 'FAST'

export class MatchNextEnginePort implements MatchEnginePort<MatchSetup, MatchNextLiveController, MatchNextResult> {
  public readonly engine = 'match-next' as const

  public prepare(world: GameWorld, game: Game, matchSeed?: number, tacticalPlans?: Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }>): MatchSetup {
    return prepareMatchSetup(world, game, matchSeed, tacticalPlans)
  }

  public createLiveSession(setup: MatchSetup): MatchNextLiveController {
    return new MatchNextLiveController(setup)
  }

  /** Instant resolution is FAST: the same engine with no presentation (Live = Instant is certified on the same controller). */
  public runInstant(setup: MatchSetup): MatchNextResult {
    return this.simulate(setup, 'FAST')
  }

  /**
   * ME-LOCK1 execution modes of the one Match Next engine (same setup, same authorities, same result contract):
   * - FULL: the presentation path; a MatchFrame is built every tick, as the Live viewer consumes them.
   * - FAST: no presentation work at all (no frames, no snapshots); for AI/world games and Instant results.
   * The frames are read-only projections, so both modes produce the identical result for the same setup.
   */
  public simulate(setup: MatchSetup, mode: MatchExecutionMode): MatchNextResult {
    const session = this.createLiveSession(setup)
    if (mode === 'FAST') return session.skipToEnd()
    while (!session.matchState.isComplete) session.advanceOneStep()
    return session.result()
  }

  public complete(world: GameWorld, result: MatchNextResult): GameWorld {
    return completeMatchNext(world, result)
  }
}
