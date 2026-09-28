import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import type { MatchSetup } from '@/engine/match-next'
import type { MatchTacticalPlan } from '@/engine/match'
import { prepareMatchSetup } from './prepareMatchSetup'
import { MatchNextLiveController } from './MatchNextLiveController'
import { type MatchNextResult } from './MatchNextResult'
import { completeMatchNext } from './applyMatchNextResult'
import type { MatchEnginePort } from './MatchEnginePort'

export class MatchNextEnginePort implements MatchEnginePort<MatchSetup, MatchNextLiveController, MatchNextResult> {
  public readonly engine = 'match-next' as const

  public prepare(world: GameWorld, game: Game, matchSeed?: number, tacticalPlans?: Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }>): MatchSetup {
    return prepareMatchSetup(world, game, matchSeed, tacticalPlans)
  }

  public createLiveSession(setup: MatchSetup): MatchNextLiveController {
    return new MatchNextLiveController(setup)
  }

  public runInstant(setup: MatchSetup): MatchNextResult {
    return this.createLiveSession(setup).skipToEnd()
  }

  public complete(world: GameWorld, result: MatchNextResult): GameWorld {
    return completeMatchNext(world, result)
  }
}
