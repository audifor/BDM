import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import {
  getWorldDbCompetitionRuntimeStateV1,
  withWorldDbCompetitionRuntimeStateV1,
  type WorldDbCompetitionRuntimeStateV1,
} from '@/domain/worldDb/CompetitionRuntimeState'
import { serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

const runtime: WorldDbCompetitionRuntimeStateV1 = Object.freeze({
  schemaVersion: 1,
  competitionRuntimeBundle: Object.freeze({
    contentId: 'bdm-phase1-competition-runtime-v1',
    contentHash: 'a'.repeat(64),
    worldDbSchema: 'DDL-PHASE1-A',
  }),
  competitionSeasonSources: Object.freeze([
    Object.freeze({ databaseId: 'world.db', competitionSeasonId: 'season:regular' }),
    Object.freeze({ databaseId: 'world.db', competitionSeasonId: 'season:cup' }),
  ]),
  gameFixtureBindings: Object.freeze([
    Object.freeze({ gameId: 'game:shared', competitionFixtureId: 'fixture:regular' }),
    Object.freeze({ gameId: 'game:shared', competitionFixtureId: 'fixture:cup' }),
  ]),
  resolvedStructurePositions: Object.freeze([
    Object.freeze({ competitionStructurePositionId: 'position:final-a', competitionSeasonEntryId: 'entry:1' }),
  ]),
  fixtureOutcomes: Object.freeze([
    Object.freeze({ competitionFixtureId: 'fixture:semi', winnerEntryId: 'entry:1', loserEntryId: 'entry:2' }),
  ]),
})

describe('GameWorldSaveV4', () => {
  it('round-trips mutable World DB competition execution state without changing V3', () => {
    const world = withWorldDbCompetitionRuntimeStateV1(createNewGame(), runtime)
    const saved = serializeGameWorldV4(world, savedAt)
    expect(saved.schemaVersion).toBe(4)
    expect(saved.payload.worldDbCompetitionRuntime).toEqual(runtime)

    const loaded = deserializeGameWorldV4(saved)
    expect(getWorldDbCompetitionRuntimeStateV1(loaded)).toEqual(runtime)
  })

  it('loads canonical V3 as an empty V4 competition runtime', () => {
    const legacy = serializeGameWorldV3(createNewGame(), savedAt)
    const loaded = deserializeGameWorldSaveV4(legacy)
    expect(getWorldDbCompetitionRuntimeStateV1(loaded)).toEqual({
      schemaVersion: 1,
      competitionRuntimeBundle: null,
      competitionSeasonSources: [],
      gameFixtureBindings: [],
      resolvedStructurePositions: [],
      fixtureOutcomes: [],
    })
  })

  it('requires the V4 runtime and rejects duplicate mutable identities', () => {
    const saved = structuredClone(serializeGameWorldV4(createNewGame(), savedAt)) as unknown as {
      payload: Record<string, unknown>
    }
    delete saved.payload.worldDbCompetitionRuntime
    expect(() => deserializeGameWorldV4(saved)).toThrow('requires worldDbCompetitionRuntime')

    const malformed = structuredClone(serializeGameWorldV4(createNewGame(), savedAt)) as unknown as {
      payload: Record<string, unknown>
    }
    malformed.payload.worldDbCompetitionRuntime = {
      schemaVersion: 1,
      competitionRuntimeBundle: null,
      competitionSeasonSources: [],
      gameFixtureBindings: [
        { gameId: 'game:1', competitionFixtureId: 'fixture:1' },
        { gameId: 'game:1', competitionFixtureId: 'fixture:1' },
      ],
      resolvedStructurePositions: [],
      fixtureOutcomes: [],
    }
    expect(() => deserializeGameWorldV4(malformed)).toThrow('Duplicate World DB game fixture binding')
  })

  it('rejects malformed immutable runtime bundle pins', () => {
    const malformed = structuredClone(serializeGameWorldV4(createNewGame(), savedAt)) as unknown as {
      payload: Record<string, unknown>
    }
    malformed.payload.worldDbCompetitionRuntime = {
      schemaVersion: 1,
      competitionRuntimeBundle: { contentId: 'phase1', contentHash: 'not-a-digest', worldDbSchema: 'DDL-PHASE1-A' },
      competitionSeasonSources: [],
      gameFixtureBindings: [],
      resolvedStructurePositions: [],
      fixtureOutcomes: [],
    }
    expect(() => deserializeGameWorldV4(malformed)).toThrow('contentHash')
  })
})
