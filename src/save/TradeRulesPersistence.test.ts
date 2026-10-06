/*
 * MX0.5 closure — trade rules persistence.
 *
 * `GameWorldSaveV1` used to write `tradeWindow` and read it back as absent, so a loaded NBA-like season degraded to
 * NOT_CONFIGURED and every trade negotiation it held became unresolvable. The window is canonical competition/season
 * state, so it must survive every save schema exactly: the generated explicit `opensOn`/`closesOn` stay those exact
 * dates, and a save that never had a window must not gain one.
 */
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createTradeRules, type TradeRules } from '@/domain/trade'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getTradeWindowStatus } from '@/engine/trade'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'
import { deserializeGameWorldV2, serializeGameWorldV2 } from './GameWorldSaveV2'
import { deserializeGameWorldV3, serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const SAVED_AT = '2032-10-01T00:00:00.000Z'

/** Every generated NBA-like / WNBA-like season carries its own materialized trade rules. */
function shippedTradeSeasons(world: GameWorld) {
  const seasons = Object.values(world.seasons).filter((item) => world.tradeRulesBySeasonId[item.id] !== undefined)
  if (seasons.length === 0) throw new Error('The shipped world has no season with trade rules')
  return seasons
}

function roundTripThroughEverySchema(world: GameWorld): readonly GameWorld[] {
  return [
    deserializeGameWorldV1(serializeGameWorldV1(world, SAVED_AT)),
    deserializeGameWorldV2(serializeGameWorldV2(world, SAVED_AT)),
    deserializeGameWorldV3(serializeGameWorldV3(world, SAVED_AT)),
    deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT)),
  ]
}

function withRules(world: GameWorld, seasonId: string, rules: TradeRules): GameWorld {
  return updateGameWorld(world, { tradeRulesBySeasonId: { ...world.tradeRulesBySeasonId, [seasonId]: rules } })
}

describe('Trade rules persistence', () => {
  it('keeps every generated explicit window through every save schema', () => {
    const world = createNewGame()
    const reloaded = roundTripThroughEverySchema(world)

    for (const season of shippedTradeSeasons(world)) {
      const rules = world.tradeRulesBySeasonId[season.id]!
      const proposal = { seasonId: season.id, ecosystemId: rules.ecosystemId }
      expect(rules.tradeWindow?.opensOn).toBeDefined()
      expect(rules.tradeWindow?.closesOn).toBeDefined()
      for (const loaded of reloaded) {
        expect(loaded.tradeRulesBySeasonId[season.id]).toEqual(rules)
        // The status at the window's own opening date and on its deadline is identical after loading.
        expect(getTradeWindowStatus(updateGameWorld(loaded, { currentDate: rules.tradeWindow!.opensOn! }), proposal)).toBe('OPEN')
        expect(getTradeWindowStatus(updateGameWorld(loaded, { currentDate: rules.tradeWindow!.closesOn! }), proposal)).toBe('OPEN')
      }
    }
  })

  it('keeps explicit window dates, and never invents a window a save did not have', () => {
    const world = createNewGame()
    const season = shippedTradeSeasons(world)[0]!
    const sourceRules = world.tradeRulesBySeasonId[season.id]!
    const explicit = withRules(world, season.id, createTradeRules({ ...sourceRules, tradeWindow: { opensOn: season.startDate, closesOn: season.endDate } }))
    const windowless = withRules(world, season.id, createTradeRules({ ...sourceRules, tradeWindow: undefined }))

    for (const loaded of roundTripThroughEverySchema(explicit)) expect(loaded.tradeRulesBySeasonId[season.id]!.tradeWindow).toEqual({ opensOn: season.startDate, closesOn: season.endDate })
    for (const loaded of roundTripThroughEverySchema(windowless)) {
      expect(loaded.tradeRulesBySeasonId[season.id]!.tradeWindow).toBeUndefined()
      expect(getTradeWindowStatus(updateGameWorld(loaded, { currentDate: season.startDate }), { seasonId: season.id, ecosystemId: sourceRules.ecosystemId })).toBe('NOT_CONFIGURED')
    }
  })

  it('rejects a save whose window falls outside its season instead of repairing it', () => {
    const world = createNewGame()
    const season = shippedTradeSeasons(world)[0]!
    const rules = world.tradeRulesBySeasonId[season.id]!
    const envelope = serializeGameWorldV1(withRules(world, season.id, createTradeRules({ ...rules, tradeWindow: undefined })), SAVED_AT)
    const writtenRules = envelope.payload.tradeRules
    if (writtenRules === undefined) throw new Error('The save did not write the season trade rules')
    const tampered = {
      ...envelope,
      payload: {
        ...envelope.payload,
        tradeRules: writtenRules.map((item) => item.seasonId === season.id ? { ...item, tradeWindow: { opensOn: '2001-01-01' } } : item),
      },
    }

    expect(() => deserializeGameWorldV1(tampered)).toThrow('Trade window must stay within its season')
  })
})
