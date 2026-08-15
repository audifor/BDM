import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { defaultLeagueCompetitionRules } from '@/domain/competition'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('Competition Rules persistence', () => {
  it('round-trips canonical rules and enriches legacy competitions deterministically', () => {
    const envelope = serializeGameWorldV1(createNewGame(), '2032-10-01T00:00:00.000Z')
    const legacy = {
      ...envelope,
      payload: {
        ...envelope.payload,
        competitions: envelope.payload.competitions.map((competition) => {
          const { rules: _rules, ...withoutRules } = competition
          return withoutRules
        }),
      },
    }
    const loaded = deserializeGameWorldV1(envelope)
    const legacyLoaded = deserializeGameWorldV1(legacy)

    expect(Object.values(loaded.competitions)[0]!.rules).toEqual(defaultLeagueCompetitionRules)
    expect(Object.values(legacyLoaded.competitions)[0]!.rules).toEqual(defaultLeagueCompetitionRules)
    expect(deserializeGameWorldV1(serializeGameWorldV1(legacyLoaded, '2032-10-01T00:00:00.000Z'))).toEqual(legacyLoaded)
  })
})
