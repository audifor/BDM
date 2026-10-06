import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { getAvailableRosterPlayers, updateGameWorld, type GameWorld } from '@/domain/world'
import { getScheduledGamesToday } from '@/engine/calendar'
import { advanceGameDayWithResult } from './advanceGameDay'
import { createAcbTestGame as createFullAcbTestGame } from './createAcbTestGame'
import { withShortGameFormat } from './testFixtures'

// MX0.2 Blocker A end to end: a structurally valid club that can dress exactly five available Players must
// resolve its scheduled Game and advance the day, with the result applied once and no roster corruption.
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

const MATCH_SEED = 20261001
const seedFactory = () => MATCH_SEED

function settled(result: { readonly status: string }): boolean {
  return result.status === 'COMPLETED' || result.status === 'BREAKPOINT_AFTER_PROCESSING'
}

function advanceUntil(world: GameWorld, predicate: (world: GameWorld) => boolean): GameWorld {
  let current = world
  for (let guard = 0; guard < 60; guard += 1) {
    if (predicate(current)) return current
    const result = advanceGameDayWithResult(current, seedFactory, ['userGame', 'mediaOpportunity'])
    expect(settled(result)).toBe(true)
    current = result.world
  }
  throw new Error('MX0.2 test setup did not reach the required day')
}

function leaveExactlyAvailable(world: GameWorld, teamId: string, keep: number): GameWorld {
  const injuries = getAvailableRosterPlayers(world, teamId as never, world.currentDate).slice(keep).map((player, index) => createInjury({
    id: injuryIdFromString(`mx02-avail:${teamId}:${player.id}`), playerId: player.id, kind: 'ankleSprain', severity: 'minor',
    injuredOn: world.currentDate, expectedReturnDate: addDays(world.currentDate, 6 + index),
  }))
  const short = updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), ...injuries] })
  expect(getAvailableRosterPlayers(short, teamId as never, world.currentDate)).toHaveLength(keep)
  return short
}

describe('MX0.2 match availability floor', () => {
  it('resolves an AI Game when a club can dress exactly five PlayerIds and applies the result once', { timeout: 180_000 }, () => {
    const base = createAcbTestGame()
    const userTeamId = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id
    const today = advanceUntil(base, (world) => getScheduledGamesToday(world).some((game) => game.homeTeamId !== userTeamId && game.awayTeamId !== userTeamId))
    const game = getScheduledGamesToday(today).find((candidate) => candidate.homeTeamId !== userTeamId && candidate.awayTeamId !== userTeamId)!
    const before = leaveExactlyAvailable(today, game.homeTeamId, 5)

    const result = advanceGameDayWithResult(before, seedFactory, ['userGame', 'mediaOpportunity'])

    expect(settled(result), `status=${result.status} failure=${result.failure?.message ?? ''}`).toBe(true)
    expect(result.world.games[game.id]?.status).toBe('completed')
    expect(result.world.matchStatLogsByGameId[game.id]).toBeDefined()
    expect(result.world.currentDate).toBe(addDays(before.currentDate, 1))
    // The club keeps its permanent roster and never falls below the playable minimum.
    expect(result.world.teams[game.homeTeamId]!.rosterPlayerIds).toEqual(before.teams[game.homeTeamId]!.rosterPlayerIds)
    expect(getAvailableRosterPlayers(result.world, game.homeTeamId, result.world.currentDate).length).toBeGreaterThanOrEqual(5)
  })

  it('stops a user Game the user cannot legally play instead of failing the day', { timeout: 180_000 }, () => {
    const base = createAcbTestGame()
    const userTeamId = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id
    const today = advanceUntil(base, (world) => getScheduledGamesToday(world).some((game) => game.homeTeamId === userTeamId || game.awayTeamId === userTeamId))
    const short = leaveExactlyAvailable(today, userTeamId, 4)

    const result = advanceGameDayWithResult(short, seedFactory)
    expect(result.status).toBe('BREAKPOINT_PREVENTED')
    expect(result.breakpointBefore.breakpoint).toMatchObject({ reason: 'minimumRoster', sourceId: userTeamId })
    expect(result.world).toBe(short)
  })
})
