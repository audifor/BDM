import type { DevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import type { MatchSetup } from '@/engine/match-next'
import type { MatchTacticalPlan } from '@/engine/match'
import { prepareMatchSetup } from './prepareMatchSetup'
import { MatchNextLiveController } from './MatchNextLiveController'
import { type MatchNextResult } from './MatchNextResult'
import { completeMatchNext } from './applyMatchNextResult'
import type { MatchEnginePort } from './MatchEnginePort'

/**
 * The simulation resolution seam (ME-LOCK1.2): FULL and FAST are the two exact tiers of the one Match Next engine. A lower-fidelity
 * BACKGROUND tier for distant competitions is intentionally unsupported: it would be a separate tier with its own (statistical)
 * certification and a relevance policy deciding which games use it.
 */
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
    while (!session.advanceOneStep().isComplete) { /* every step builds its presentation frame */ }
    return session.result()
  }

  /** Applies the result; `FULL` when the user watched it live (provenance only: the same canonical application). */
  public complete(world: GameWorld, result: MatchNextResult, resolution: 'FULL' | 'FAST' = 'FAST', pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
    return completeMatchNext(world, result, resolution, pendingEvidence)
  }
}
