import { describe, expect, it } from 'vitest'

import { parseGameDate } from '@/domain/date'
import { createGame, type CompletedGame } from '@/domain/game'
import {
  competitionIdFromString,
  gameIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { adaptCompletedGamesToWorldDbFixtureOutcomesV1 } from './WorldDbFixtureOutcomeAdapter'
import { createWorldDbGameFixtureBindingIndexV1 } from './WorldDbGameFixtureBinding'

function runtime() {
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test',
      competitionId: 'competition:test',
      seasonId: 'season:test',
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:home', teamId: 'team:home' },
      { competitionSeasonEntryId: 'entry:away', teamId: 'team:away' },
    ],
    structureNodes: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [
      { competitionFixtureId: 'fixture:local', structureNodeId: null, matchdayId: null, fixtureOrder: 1 },
    ],
    fixtureSides: [],
    rulePayloads: {},
  }
  return createWorldDbCompetitionRuntimeV1(bundle)
}

function completedGame(id: string, homeScore: number, awayScore: number): CompletedGame {
  const game = createGame({
    id: gameIdFromString(id),
    seasonId: seasonIdFromString('season:test'),
    competitionId: competitionIdFromString('competition:physical'),
    date: parseGameDate('2026-09-15'),
    homeTeamId: teamIdFromString('team:home'),
    awayTeamId: teamIdFromString('team:away'),
    status: 'completed',
    result: { homeScore, awayScore },
  })
  if (game.status !== 'completed') throw new Error('Test Game must be completed')
  return game
}

describe('World DB fixture outcome adapter', () => {
  it('derives the local fixture outcome and ignores a foreign N:M binding', () => {
    const game = completedGame('game:shared', 91, 84)
    const bindings = createWorldDbGameFixtureBindingIndexV1([
      { gameId: game.id, competitionFixtureId: 'fixture:local' },
      { gameId: game.id, competitionFixtureId: 'fixture:foreign' },
    ])

    expect(adaptCompletedGamesToWorldDbFixtureOutcomesV1(runtime(), bindings, [game])).toEqual([
      {
        competitionFixtureId: 'fixture:local',
        winnerEntryId: 'entry:home',
        loserEntryId: 'entry:away',
      },
    ])
  })

  it('maps an away winner back to the correct competition entry', () => {
    const game = completedGame('game:away-win', 73, 79)
    const bindings = createWorldDbGameFixtureBindingIndexV1([
      { gameId: game.id, competitionFixtureId: 'fixture:local' },
    ])

    expect(adaptCompletedGamesToWorldDbFixtureOutcomesV1(runtime(), bindings, [game])).toEqual([
      {
        competitionFixtureId: 'fixture:local',
        winnerEntryId: 'entry:away',
        loserEntryId: 'entry:home',
      },
    ])
  })

  it('rejects multiple completed physical realizations until B12 authority is projected', () => {
    const original = completedGame('game:original', 80, 70)
    const replay = completedGame('game:replay', 82, 77)
    const bindings = createWorldDbGameFixtureBindingIndexV1([
      { gameId: original.id, competitionFixtureId: 'fixture:local' },
      { gameId: replay.id, competitionFixtureId: 'fixture:local' },
    ])

    expect(() => adaptCompletedGamesToWorldDbFixtureOutcomesV1(
      runtime(),
      bindings,
      [original, replay],
    )).toThrow('authoritative realization is ambiguous')
  })
})
