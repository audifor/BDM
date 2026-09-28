import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import type { MatchTacticalPlan } from '@/engine/match'

export interface MatchEnginePort<TPrepared, TLiveSession, TResult> {
  readonly engine: 'legacy' | 'match-next'
  prepare(world: GameWorld, game: Game, matchSeed?: number, tacticalPlans?: Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }>): TPrepared
  createLiveSession(prepared: TPrepared): TLiveSession
  runInstant(prepared: TPrepared): TResult
  complete(world: GameWorld, result: TResult): GameWorld
}
