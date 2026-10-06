/*
 * MX0.5 closure — canonical trade activation.
 *
 * NBA-like trading must be legal because the season says so, never because a fixture injected a window: the NBA-like
 * rule preset declares its window as the Season's own `startDate`..`endDate`, which is what `getTradeWindowStatus`
 * reports as OPEN. Universes that ship no trade rules for a season (the ACB / fixture-like path) keep a different,
 * canonical reason, so no NBA-style trading leaks into them.
 */
import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { rollForwardTradeRules } from '@/app/game/startNextSeason'
import { proposeTradeNegotiation } from '@/app/trades'
import { addYears } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getTradeWindowStatus } from '@/engine/trade'

/** The shipped NBA-like season is the only generated season that carries trade rules. */
function shippedNbaLikeSeason(world: GameWorld) {
  const season = Object.values(world.seasons).find((item) => world.tradeRulesBySeasonId[item.id] !== undefined)
  if (season === undefined) throw new Error('The shipped world has no season with trade rules')
  return { season, rules: world.tradeRulesBySeasonId[season.id]! }
}

describe('NBA-like trade activation', () => {
  it('activates the shipped NBA-like season from its own competition/season rules', () => {
    const world = createNewGame()
    const { season, rules } = shippedNbaLikeSeason(world)
    const proposal = { seasonId: season.id, ecosystemId: rules.ecosystemId }

    // The season-scoped window: no invented deadline, so it is an empty rule that reads the Season's own boundaries.
    expect(rules.tradeWindow).toEqual({})
    expect(season.endDate > season.startDate).toBe(true)
    // The canonical calendar authority's own boundaries are inside the window.
    expect(getTradeWindowStatus(updateGameWorld(world, { currentDate: season.startDate }), proposal)).toBe('OPEN')
    expect(getTradeWindowStatus(updateGameWorld(world, { currentDate: season.endDate }), proposal)).toBe('OPEN')
  })

  it('carries the season-scoped window into the next edition without stale dates', () => {
    const world = createNewGame()
    const { season, rules } = shippedNbaLikeSeason(world)
    const successor = createSeason({
      id: seasonIdFromString('nba-like-trade-window-successor'),
      competitionId: season.competitionId,
      label: 'Next edition',
      startDate: addYears(season.startDate, 1),
      endDate: addYears(season.endDate, 1),
      participantTeamIds: season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds,
    })
    const rolled = rollForwardTradeRules(updateGameWorld(world, { seasons: [...Object.values(world.seasons), successor] }), [[season, successor]])
    const successorRules = rolled.tradeRulesBySeasonId[successor.id]!

    expect(successorRules).toEqual({ ...rules, seasonId: successor.id })
    expect(successorRules.tradeWindow).toEqual({})
    expect(getTradeWindowStatus(updateGameWorld(rolled, { currentDate: successor.startDate }), { seasonId: successor.id, ecosystemId: rules.ecosystemId })).toBe('OPEN')
  })

  it('keeps the ACB universe canonical-FIBA-like: no trade rules, so no NBA-style trading', () => {
    const world = createAcbTestGame()
    const season = world.seasons[world.currentSeasonId]!
    const participants = world.competitions[season.competitionId]!.participantTeamIds
    const user = getUserTeam(world)!

    expect(participants).toContain(user.id)
    expect(world.tradeRulesBySeasonId[season.id]).toBeUndefined()
    expect(Object.keys(world.tradeRulesBySeasonId)).toEqual([])

    const partnerId = participants.find((teamId) => teamId !== user.id)!
    const proposal = {
      id: 'acb-package',
      ecosystemId: world.competitions[season.competitionId]!.ecosystemId,
      seasonId: season.id,
      participantTeamIds: [user.id, partnerId],
      movements: [
        { asset: { kind: 'player' as const, playerId: user.rosterPlayerIds[0]! }, fromTeamId: user.id, toTeamId: partnerId },
        { asset: { kind: 'player' as const, playerId: world.teams[partnerId]!.rosterPlayerIds[0]! }, fromTeamId: partnerId, toTeamId: user.id },
      ],
    }

    // The canonical reason names the missing season rules, never an unconfigured window.
    const result = proposeTradeNegotiation(world, proposal, user.id, { kind: 'USER' })
    expect(result.status).toBe('BLOCKED')
    expect(result.reasons).toEqual(['TRADE_SEASON_OR_ECOSYSTEM_UNAVAILABLE'])
  })
})
