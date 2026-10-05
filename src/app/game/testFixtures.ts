import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'

/**
 * ME-LOCK1 test support: calendar and season lifecycle tests simulate whole seasons, and every Game now resolves through Match Next
 * (seconds per game, not the legacy engine's milliseconds). Tests whose subject is the lifecycle, not the basketball, give every
 * competition a short game format through world data: the Games still go through the production route (Match Next FAST, same rules
 * authority), they just last `periodMinutes` per period.
 */
export function withShortGameFormat(world: GameWorld, periodMinutes = 1): GameWorld {
  return updateGameWorld(world, {
    competitions: Object.values(world.competitions).map((competition) => ({
      ...competition,
      rules: { ...competition.rules, gameFormat: { ...competition.rules.gameFormat, periodMinutes, overtimeMinutes: periodMinutes } },
    })),
  })
}
