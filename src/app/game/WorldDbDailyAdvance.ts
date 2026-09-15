import type { GameWorld } from '@/domain/world'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'

import { advanceGameDay } from './advanceGameDay'
import {
  materializeWorldDbPhysicalGamesV1,
  type WorldDbGameMaterializationResultV1,
} from './WorldDbGameMaterialization'

export interface AdvanceWorldDbGameDayInputV1 {
  readonly beforeAsOf: string
  readonly afterAsOf: string
}

export interface AdvanceWorldDbGameDayResultV1 {
  readonly world: GameWorld
  readonly before: WorldDbGameMaterializationResultV1
  readonly after: WorldDbGameMaterializationResultV1
}

/**
 * Executes one canonical game day with already-loaded World DB competition contexts.
 *
 * World DB physical Games are materialized before the daily simulation so today's
 * fixtures can be played, then materialized again afterwards so completed results
 * can rebuild B04 progression and expose downstream fixtures. The caller owns the
 * external World DB path/context lifecycle and supplies explicit as-of timestamps.
 */
export function advanceWorldDbGameDayV1(
  world: GameWorld,
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  input: AdvanceWorldDbGameDayInputV1,
): AdvanceWorldDbGameDayResultV1 {
  requireAsOf(input.beforeAsOf, 'beforeAsOf')
  requireAsOf(input.afterAsOf, 'afterAsOf')

  const before = materializeWorldDbPhysicalGamesV1(world, contexts, input.beforeAsOf)
  const advancedWorld = advanceGameDay(before.world)
  const after = materializeWorldDbPhysicalGamesV1(advancedWorld, contexts, input.afterAsOf)

  return Object.freeze({
    world: after.world,
    before,
    after,
  })
}

function requireAsOf(value: string, field: 'beforeAsOf' | 'afterAsOf'): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`World DB ${field} must be a non-empty string`)
  }
}
