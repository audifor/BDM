import { describe, expect, it } from 'vitest'

import { parseGameDate } from '@/domain/date'
import { createGame, type CompletedGame } from '@/domain/game/Game'
import { competitionIdFromString, gameIdFromString, seasonIdFromString, teamIdFromString } from '@/domain/ids'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbGameFixtureBindingIndexV1 } from './WorldDbGameFixtureBinding'
import { adaptCompletedGamesToWorldDbFixtureOutcomesV1 } from './WorldDbFixtureOutcomeAdapter'
import type { WorldDbResolvedFixtureV1 } from './WorldDbFixtureResolver'

function buildRuntime() {
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test:2026-27',
      competitionId: 'competition:test',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:home', teamId: 'team:home' },
      { competitionSeasonEntryId: 'entry:away', teamId: 'team:away' },
    ],
    structureNodes: [
      { competitionStructureNodeId: 'node:round', nodeType: 'ROUND', name: 'Round', sequenceNo: 1 },
    ],
    structurePositions: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [
      { competitionFixtureId: 'fixture:local', structureNodeId: 'node:round', matchdayId: null, fixtureOrder: 1 },
    ],
    fixtureSides: [
      { competitionFixtureSideId: 'side:home', competitionFixtureId: 'fixture:local', sideRole: 'HOME', competitionSeasonEntryId: 'entry:home', competitionSeasonSlotId: null, sourceStructurePositionId: null },
      { competitionFixtureSideId: 'side:away', competitionFixtureId: 'fixture:local', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:away', competitionSeasonSlotId: null, sourceStructurePositionId: null },
    ],
    rulePayloads: {},
  }
  return createWorldDbCompetitionRuntimeV1(bundle)
}

function resolvedFixture(): WorldDbResolvedFixtureV1 {
  return {
    competitionFixtureId: 'fixture:local',
    ready: true,
    sides: [
      { competitionFixtureSideId: 'side:home', competitionFixtureId: 'fixture:local', sideRole: 'HOME', competitionSeasonEntryId: 'entry:home', resolutionSource: 'DIRECT_ENTRY' },
      { competitionFixtureSideId: 'side:away', competitionFixtureId: 'fixture:local', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:away', resolutionSource: 'DIRECT_ENTRY' },
    ],
  }
}

function completedGame(id: string, homeScore: number, awayScore: number): CompletedGame {
  const game = createGame({
    id: gameIdFromString(id),
    seasonId: seasonIdFromString('season:2026-27'),
    competitionId: competitionIdFromString('competition:physical'),
    date: parseGameDate('2026-09-14'),
    homeTeamId: teamIdFromString('team:home'),
    awayTeamId: teamIdFromString('team:away'),
    status: 'completed',
    result: { homeScore, awayScore },
  })
  if (game.status !== 'completed') throw new Error('Test game must be completed')
  return game
}

describe('World DB fixture outcome adapter', () => {
  it('adapts one physical Game to the loaded fixture and ignores a foreign competition binding', () => {
    const runtime = buildRuntime()
    const game = completedGame('game:cup-overlap', 91, 84)
    const bindings = createWorldDbGameFixtureBindingIndexV1([
      { gameId: game.id, competitionFixtureId: 'fixture:local' },
      { gameId: game.id, competitionFixtureId: 'fixture:other-competition' },
    ])

    expect(adaptCompletedGamesToWorldDbFixtureOutcomesV1(runtime, bindings, [resolvedFixture()], [game])).toEqual([
      {
        competitionFixtureId: 'fixture:local',
        winnerEntryId: 'entry:home',
        loserEntryId: 'entry:away',
      },
    ])
  })

  it('maps the physical away winner to the correct competition entry', () => {
    const runtime = buildRuntime()
    const game = completedGame('game:away-win', 73, 79)
    const bindings = createWorldDbGameFixtureBindingIndexV1([
      { gameId: game.id, competitionFixtureId: 'fixture:local' },
    ])

    expect(adaptCompletedGamesToWorldDbFixtureOutcomesV1(runtime, bindings, [resolvedFixture()], [game])[0]).toEqual({
      competitionFixtureId: 'fixture:local',
      winnerEntryId: 'entry:away',
      loserEntryId: 'entry:home',
    })
  })

  it('rejects ambiguous multiple physical realizations of the same fixture', () => {
    const runtime = buildRuntime()
    const original = completedGame('game:original', 80, 70)
    const replay = completedGame('game:replay', 82, 77)
    const bindings = createWorldDbGameFixtureBindingIndexV1([
      { gameId: original.id, competitionFixtureId: 'fixture:local' },
      { gameId: replay.id, competitionFixtureId: 'fixture:local' },
    ])

    expect(() => adaptCompletedGamesToWorldDbFixtureOutcomesV1(
      runtime,
      bindings,
      [resolvedFixture()],
      [original, replay],
    )).toThrow('authoritative realization is ambiguous')
  })
})
