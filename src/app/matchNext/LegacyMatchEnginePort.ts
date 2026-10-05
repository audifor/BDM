import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { completeMatch, prepareMatchOptions } from '@/app/game/playUserGame'
import { LiveMatchController } from '@/app/game/LiveMatchController'
import { simulateMatchWithRotations, type MatchSimulation, type SimulateMatchWithRotationsOptions } from '@/engine/match'
import type { MatchEnginePort } from './MatchEnginePort'

export type LegacyMatchPrepared = SimulateMatchWithRotationsOptions & { readonly matchSeed: number }

export class LegacyMatchEnginePort implements MatchEnginePort<LegacyMatchPrepared, LiveMatchController, MatchSimulation> {
  public readonly engine = 'legacy' as const

  public prepare(world: GameWorld, game: Game, matchSeed?: number): LegacyMatchPrepared {
    return prepareMatchOptions(world, game, undefined, matchSeed)
  }

  public createLiveSession(prepared: LegacyMatchPrepared): LiveMatchController {
    return new LiveMatchController(prepared)
  }

  public runInstant(prepared: LegacyMatchPrepared): MatchSimulation {
    return simulateMatchWithRotations(prepared)
  }

  public complete(world: GameWorld, result: MatchSimulation): GameWorld {
    return completeMatch(world, result)
  }
}
