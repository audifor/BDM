import { describe, expect, it } from 'vitest'

import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { progressAiMedicalLifecycle } from '@/engine/injury/AiMedicalLifecycle'
import { createAcbTestGame as createFullAcbTestGame } from './createAcbTestGame'
import { simulateAndApplyGame } from './matchResolution'
import { withShortGameFormat } from './testFixtures'

// MX0.2 Blocker B regression, at the application boundary where it was observed. A Game may be resolved while the
// world clock is still on an earlier date (for example the first fixture of the season created by a rollover), so
// its injuries are dated after `world.currentDate`. The medical lifecycle must never stamp a rehabilitation
// chronology that precedes them; previously this threw `RangeError: Rehabilitation dates cannot precede injury`.
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

const MATCH_SEED = 20261001

/** Resolves a few upcoming scheduled Games without moving the clock, until one records a future-dated injury. */
function resolveAhead(world: GameWorld): GameWorld {
  const upcoming = Object.values(world.games)
    .filter((candidate) => candidate.status === 'scheduled' && compareGameDates(candidate.date, world.currentDate) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, 60)
  let current = world
  for (const game of upcoming) {
    current = simulateAndApplyGame(current, current.games[game.id]!, MATCH_SEED)
    if (Object.values(current.injuriesById).some((injury) => compareGameDates(injury.injuredOn, current.currentDate) > 0)) return current
  }
  return current
}

describe('MX0.2 medical chronology lifecycle', () => {
  it('runs the AI medical lifecycle over injuries dated after the clock without a chronology error', { timeout: 180_000 }, () => {
    const applied = resolveAhead(createAcbTestGame())
    const future = Object.values(applied.injuriesById).filter((injury) => compareGameDates(injury.injuredOn, applied.currentDate) > 0)
    expect(future.length).toBeGreaterThan(0)

    // The lifecycle runs cleanly and never writes a rehabilitation change before its own injury.
    expect(() => progressAiMedicalLifecycle(applied)).not.toThrow()
    const progressed = progressAiMedicalLifecycle(applied).world
    for (const injury of Object.values(progressed.injuriesById)) {
      const changes = [injury.rehabilitation?.changedOn, ...(injury.rehabilitation?.history ?? []).map((change) => change.changedOn)]
      for (const changedOn of changes) if (changedOn !== undefined) expect(compareGameDates(changedOn, injury.injuredOn)).toBeGreaterThanOrEqual(0)
    }
    // Nothing was prematurely planned for an injury that has not happened yet.
    for (const injury of future) expect(progressed.injuriesById[injury.id]?.rehabilitation).toEqual(injury.rehabilitation)
  })
})
