import type { GameWorld } from './GameWorld'

/**
 * Tracks the most recent WORLD-LEVEL annual player development cycle applied to this GameWorld.
 * Player development is a property of the world's calendar year, never of any Competition's
 * lifecycle: the same player can play in several independently-rolling competitions (a domestic
 * league, a cup, a continental competition), and none of their individual season completions may
 * trigger this event. `advanceDay` is the sole trigger, and `lastAppliedCycleId` is the sole
 * idempotency guard -- it is checked before ever applying development, so re-running `advanceDay`
 * on the same date, reloading a save from that date, or having multiple competitions complete
 * around the same real date can never apply the cycle more than once.
 */
export interface WorldAnnualDevelopmentCycle {
  readonly lastAppliedCycleId: string | null
}

export const EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE: WorldAnnualDevelopmentCycle = Object.freeze({
  lastAppliedCycleId: null,
})

/** The calendar year's development cycle identity: deterministic, world-year scoped. */
export function annualDevelopmentCycleId(currentDate: GameWorld['currentDate']): string {
  return `annual-development:${currentDate.slice(0, 4)}`
}

export function hasAppliedAnnualDevelopmentCycle(world: GameWorld, cycleId: string): boolean {
  return (world.worldAnnualDevelopmentCycle ?? EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE).lastAppliedCycleId === cycleId
}

export function markAnnualDevelopmentCycleApplied(world: GameWorld, cycleId: string): GameWorld {
  return Object.freeze({ ...world, worldAnnualDevelopmentCycle: Object.freeze({ lastAppliedCycleId: cycleId }) })
}

/** Transitional domain augmentation, following the same pattern as WorldDbCompetitionRuntime.ts. */
declare module './GameWorld' {
  interface GameWorld {
    readonly worldAnnualDevelopmentCycle?: WorldAnnualDevelopmentCycle
  }
}
