import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { gameIdFromString } from '@/domain/ids'
import { getNextScheduledGame, type GameWorld } from '@/domain/world'

import { getAddressableScoutingPlayerIds } from './ScoutingOperationsService'

describe('Player scouting addressability from public fixtures', () => {
  it('allows a later scheduled opponent instead of limiting evaluation to the very next match', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((entry) => entry.coachId === world.userCoachId)!
    const before = new Set(getAddressableScoutingPlayerIds(world, team.id))
    const futureRival = Object.values(world.teams).find((entry) =>
      entry.id !== team.id && entry.rosterPlayerIds.some((id) => !before.has(id)))
    expect(futureRival).toBeDefined()
    const fixtureTemplate = Object.values(world.games)[0]!
    expect(fixtureTemplate).toBeDefined()
    const laterFixture = {
      ...fixtureTemplate,
      id: gameIdFromString('scouting-public-opponent-later-game'),
      homeTeamId: team.id,
      awayTeamId: futureRival!.id,
      date: createGameDate(2099, 1, 1),
      status: 'scheduled' as const,
    }
    // Pure selector fixture. A future scheduled fixture is a public identity
    // source; no knowledge record or Player Truth is added to the world.
    const scheduled: GameWorld = {
      ...world,
      games: { ...world.games, [laterFixture.id]: laterFixture },
    }
    const available = new Set(getAddressableScoutingPlayerIds(scheduled, team.id))
    for (const playerId of futureRival!.rosterPlayerIds) {
      expect(available.has(playerId)).toBe(true)
    }
    const currentNext = getNextScheduledGame(world, team.id)
    if (currentNext !== undefined) {
      expect(getNextScheduledGame(scheduled, team.id)?.id).toBe(currentNext.id)
    }
    expect(scheduled.organizationKnowledge).toBe(world.organizationKnowledge)
  })

  it('does not reveal every roster worldwide without knowledge or fixture context', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((entry) => entry.coachId === world.userCoachId)!
    const addressable = new Set(getAddressableScoutingPlayerIds(world, team.id))
    const undiscovered = Object.values(world.teams).flatMap((entry) => entry.rosterPlayerIds)
      .filter((id) => !addressable.has(id))
    expect(undiscovered.length).toBeGreaterThan(0)
  })
})
