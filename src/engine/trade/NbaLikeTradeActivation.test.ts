/*
 * MX0.5 final closure — ecosystem-scoped trade activation.
 *
 * NBA-like and WNBA-like competitions share the canonical Trade machinery but never share a season,
 * a schedule, a materialized TradeWindow or an ecosystem policy: each CompetitionSeason materializes
 * its own explicit window from its own regular-season schedule, and the deadline date itself is
 * tradable. Nothing here injects TradeRules: every window comes from the shipped world generation.
 * The ACB / FIBA-like universe ships no trade rules at all and keeps a distinct canonical reason.
 */
import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame, simulateAndApplyGame } from '@/app/game'
import { startNextSeasonFor } from '@/app/game/startNextSeason'
import { withShortGameFormat } from '@/app/game/testFixtures'
import { proposeTradeNegotiation } from '@/app/trades'
import { addDays } from '@/domain/date'
import type { Game } from '@/domain/game'
import { isRegularSeasonGame, type Season } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { materializeTradeWindows } from '@/engine/competition'
import { getTradeWindowStatus } from '@/engine/trade'

function orderedRegularSeasonGames(world: GameWorld, season: Season): readonly Game[] {
  return Object.values(world.games)
    .filter((game) => game.seasonId === season.id && isRegularSeasonGame(season, game))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** Profile of a generated trade season: ecosystem policy, own schedule and the canonical deadline index. */
function tradeSeasonProfile(world: GameWorld, category: 'men' | 'women') {
  const season = Object.values(world.seasons).find((item) => {
    const competition = world.competitions[item.competitionId]
    const ecosystem = competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]
    return world.tradeRulesBySeasonId[item.id] !== undefined && ecosystem?.category === category
  })
  if (season === undefined) throw new Error(`The shipped world has no ${category} season with trade rules`)
  const competition = world.competitions[season.competitionId]!
  const ecosystem = world.ecosystems[competition.ecosystemId]!
  const rules = world.tradeRulesBySeasonId[season.id]!
  const games = orderedRegularSeasonGames(world, season)
  const fraction = ecosystem.tradeDeadlinePolicy!.fraction
  const deadlineIndex = Math.min(games.length - 1, Math.max(0, Math.ceil(games.length * fraction) - 1))
  return { season, competition, ecosystem, rules, games, fraction, deadlineIndex }
}

describe('ecosystem-scoped trade activation', () => {
  it('materializes the shipped NBA-like window from its own regular-season schedule and policy', () => {
    const world = createNewGame()
    const { season, ecosystem, rules, games, fraction, deadlineIndex } = tradeSeasonProfile(world, 'men')

    expect(ecosystem.kind).toBe('nbaLike')
    expect(ecosystem.tradeDeadlinePolicy).toEqual({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })
    expect(fraction).toBe(0.65)
    // The provisional whole-season activation is no longer the product policy.
    expect(rules.tradeWindow).not.toEqual({})
    expect(rules.tradeWindow).toEqual({ opensOn: games[0]!.date, closesOn: games[deadlineIndex]!.date })
    expect(rules.tradeWindow!.opensOn).toBe(season.startDate)

    // Sanity distribution: the deadline sits strictly inside the schedule and lands on/after 65% of it.
    expect(games.length).toBe(12)
    expect(games[0]!.date < rules.tradeWindow!.closesOn!).toBe(true)
    expect(rules.tradeWindow!.closesOn! < games.at(-1)!.date).toBe(true)
    const gamesOnOrBeforeDeadline = games.filter((game) => game.date <= rules.tradeWindow!.closesOn!).length
    expect(gamesOnOrBeforeDeadline / games.length).toBeGreaterThanOrEqual(fraction)
    // Games sharing the deadline date push the observed fraction slightly past the configured one.
    expect(gamesOnOrBeforeDeadline / games.length).toBeLessThan(1)
    expect(games[deadlineIndex]!.date).toBe(rules.tradeWindow!.closesOn)
  })

  it('materializes the shipped WNBA-like window from its own schedule, independent of the NBA-like one', () => {
    const world = createNewGame()
    const men = tradeSeasonProfile(world, 'men')
    const women = tradeSeasonProfile(world, 'women')

    expect(women.ecosystem.kind).toBe('nbaLike')
    expect(women.ecosystem.category).toBe('women')
    expect(women.ecosystem.tradeDeadlinePolicy).toEqual({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })
    // Separate ecosystems, competitions and seasons: no WNBA-like state is the NBA-like state.
    expect(women.ecosystem.id).not.toBe(men.ecosystem.id)
    expect(women.competition.id).not.toBe(men.competition.id)
    expect(women.season.id).not.toBe(men.season.id)
    expect(women.rules).not.toBe(men.rules)
    expect(women.rules.tradeWindow).not.toEqual({})

    // Each window is drawn from its own schedule: both bounds land on that season's own regular-season dates.
    for (const profile of [men, women]) {
      const dates = new Set(profile.games.map((game) => game.date))
      expect(dates.has(profile.rules.tradeWindow!.opensOn!)).toBe(true)
      expect(dates.has(profile.rules.tradeWindow!.closesOn!)).toBe(true)
      expect(profile.rules.tradeWindow).toEqual({ opensOn: profile.games[0]!.date, closesOn: profile.games[profile.deadlineIndex]!.date })
    }
  })

  it('keeps the deadline date itself tradable and closes the following GameDate', () => {
    const world = createNewGame()
    const { season, ecosystem, rules } = tradeSeasonProfile(world, 'men')
    const proposal = { seasonId: season.id, ecosystemId: ecosystem.id }
    const statusOn = (date: Season['startDate']) => getTradeWindowStatus(updateGameWorld(world, { currentDate: date }), proposal)

    expect(statusOn(rules.tradeWindow!.opensOn!)).toBe('OPEN')
    expect(statusOn(rules.tradeWindow!.closesOn!)).toBe('OPEN')
    expect(statusOn(addDays(rules.tradeWindow!.closesOn!, 1))).toBe('CLOSED')
    expect(statusOn(addDays(rules.tradeWindow!.opensOn!, -1))).toBe('NOT_OPEN')
  })

  it('derives the next NBA-like edition window from its own schedule instead of rolling dates forward', () => {
    const world = withShortGameFormat(createNewGame())
    const source = tradeSeasonProfile(world, 'men')
    const completed = source.games.filter((game) => game.status === 'scheduled').reduce((current, game) => simulateAndApplyGame(current, game), world)
    const next = startNextSeasonFor(completed, source.season.id)
    const successor = Object.values(next.seasons)
      .filter((item) => item.competitionId === source.competition.id && item.id !== source.season.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!
    const successorGames = orderedRegularSeasonGames(next, successor)
    const successorRules = next.tradeRulesBySeasonId[successor.id]!

    expect(successorRules.tradeWindow!.opensOn).toBe(successorGames[0]!.date)
    expect(successorRules.tradeWindow!.closesOn).toBe(successorGames[Math.ceil(successorGames.length * source.fraction) - 1]!.date)
    expect(successorRules.tradeWindow!.closesOn).not.toBe(source.rules.tradeWindow!.closesOn)
    expect(successorRules.tradeWindow!.opensOn! > source.rules.tradeWindow!.closesOn!).toBe(true)
  }, 60_000)

  it('derives the next WNBA-like edition window from its own schedule', () => {
    const world = withShortGameFormat(createNewGame())
    const source = tradeSeasonProfile(world, 'women')
    const completed = source.games.filter((game) => game.status === 'scheduled').reduce((current, game) => simulateAndApplyGame(current, game), world)
    const next = startNextSeasonFor(completed, source.season.id)
    const successor = Object.values(next.seasons)
      .filter((item) => item.competitionId === source.competition.id && item.id !== source.season.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!
    const successorGames = orderedRegularSeasonGames(next, successor)
    const successorRules = next.tradeRulesBySeasonId[successor.id]!

    expect(successorRules.tradeWindow!.opensOn).toBe(successorGames[0]!.date)
    expect(successorRules.tradeWindow!.closesOn).toBe(successorGames[Math.ceil(successorGames.length * source.fraction) - 1]!.date)
    expect(successorRules.tradeWindow!.closesOn).not.toBe(source.rules.tradeWindow!.closesOn)
  }, 60_000)

  it('keeps the ACB universe canonical FIBA-like: no rules, no window, no NBA-style trading', () => {
    const world = createAcbTestGame()
    const season = world.seasons[world.currentSeasonId]!
    const participants = world.competitions[season.competitionId]!.participantTeamIds
    const user = getUserTeam(world)!

    expect(participants).toContain(user.id)
    expect(world.tradeRulesBySeasonId[season.id]).toBeUndefined()
    expect(Object.keys(world.tradeRulesBySeasonId)).toEqual([])
    // The ecosystem never declares an NBA/WNBA deadline policy, and materialization never invents one.
    expect(Object.values(world.ecosystems).every((ecosystem) => ecosystem.tradeDeadlinePolicy === undefined)).toBe(true)
    expect(Object.keys(materializeTradeWindows(world).tradeRulesBySeasonId)).toEqual([])

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

    // The canonical reason says this ecosystem has no NBA-style Trade system at all -- never that
    // somebody forgot to configure a window it was supposed to have.
    const result = proposeTradeNegotiation(world, proposal, user.id, { kind: 'USER' })
    expect(result.status).toBe('BLOCKED')
    expect(result.reasons).toEqual(['TRADE_SEASON_OR_ECOSYSTEM_UNAVAILABLE'])
  })
})
