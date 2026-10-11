import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { activateNewGameFinance, createNewGameBeforeFinance, type NewGameOptions } from './createNewGame'

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

/**
 * Contract-scenario test support. Canonical Finance recognizes the opening payroll of every contract when the career is created,
 * so a test may not delete or rewrite a contract afterwards (its Finance facts would point at nothing). A scenario that needs
 * different contracts shapes the generated career BEFORE Finance is activated; Finance then materializes exactly that career
 * through its own authorities. No Finance fact is written or removed by the test.
 */
export function createNewGameScenario(shape: (world: GameWorld) => GameWorld, options: NewGameOptions = {}): GameWorld {
  return activateNewGameFinance(shape(createNewGameBeforeFinance(options)), options)
}
