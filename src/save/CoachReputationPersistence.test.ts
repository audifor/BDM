import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getCoachReputationBand } from '@/domain/coachReputation'
import { getCoachReputationProfile } from '@/domain/world'
import { advanceDay } from '@/engine/calendar'

import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

const savedAt = '2032-10-01T12:00:00.000Z'

describe('Coach reputation persistence', () => {
  it('creates the same neutral profile for every user and AI coach', () => {
    const world = createNewGame()

    expect(Object.keys(world.coachReputationProfilesByCoachId)).toHaveLength(Object.keys(world.coaches).length)
    for (const coach of Object.values(world.coaches)) {
      expect(getCoachReputationProfile(world, coach.id)).toEqual({
        values: { competitive: 200, development: 200, professional: 200, publicStanding: 200 },
        events: [],
      })
    }
  })

  it('round-trips values and complete event context without persisting bands', () => {
    const base = createNewGame()
    const coachId = base.userCoachId
    const profile = {
      values: { competitive: 430, development: 200, professional: 200, publicStanding: 220 },
      events: [{ id: 'reputation:match:1', gameDate: '2032-10-01', source: 'matchResult' as const, deltas: { competitive: 6, publicStanding: 2 }, context: { kind: 'matchResult' as const, key: 'game:1' } }],
    }
    const world = { ...base, coachReputationProfilesByCoachId: { ...base.coachReputationProfilesByCoachId, [coachId]: profile } }
    const saved = serializeGameWorldV1(world, savedAt)
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)

    expect(loaded.coachReputationProfilesByCoachId[coachId]).toEqual(profile)
    expect(getCoachReputationBand(loaded.coachReputationProfilesByCoachId[coachId]!.values.competitive)).toBe('respected')
    expect(JSON.stringify(saved.payload)).not.toContain('respected')
  })

  it('enriches legacy saves once and preserves reputation through world reconstruction', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, savedAt)
    const legacyPayload = { ...saved.payload }
    delete (legacyPayload as { coachReputationProfilesByCoachId?: unknown }).coachReputationProfilesByCoachId

    const first = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const second = deserializeGameWorldV1(serializeGameWorldV1(first, savedAt))
    expect(second.coachReputationProfilesByCoachId).toEqual(first.coachReputationProfilesByCoachId)
    expect(advanceDay(first).coachReputationProfilesByCoachId).toEqual(first.coachReputationProfilesByCoachId)
  })
})
