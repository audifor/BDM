import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { Season } from '@/domain/season'
import type { TradeRules } from '@/domain/trade'
import type { GameWorld } from '@/domain/world'
import { resolveActiveCompetitionSeasonsForTeam } from '@/engine/competition'

export interface TradeSeasonAuthority {
  readonly season: Season
  readonly rules: TradeRules
}

/**
 * The CompetitionSeason whose TradeRules govern a club's trades on a GameDate: the club's own active
 * edition (see `resolveActiveCompetitionSeasonsForTeam`) that actually carries TradeRules for its
 * competition's ecosystem. `world.currentSeasonId` is a UI selection concern and never decides a
 * club's trade authority, so a manager changing clubs or competitions resolves the new club's own
 * edition. A club with no trade-enabled active edition -- and an ambiguous set of them -- has no
 * authority at all.
 */
export function resolveSharedTradeSeasonAuthority(world: GameWorld, teamIds: readonly TeamId[], date: GameDate = world.currentDate): TradeSeasonAuthority | undefined {
  const unique = [...new Set(teamIds)]
  const first = unique[0]
  if (first === undefined) return undefined
  const activeSeasonIdsByTeam = new Map(unique.map((teamId) => [teamId, new Set(resolveActiveCompetitionSeasonsForTeam(world, teamId, date).map((season) => season.id))]))
  const authorities = resolveActiveCompetitionSeasonsForTeam(world, first, date).flatMap((season) => {
    if (!unique.every((teamId) => activeSeasonIdsByTeam.get(teamId)!.has(season.id))) return []
    const rules = world.tradeRulesBySeasonId[season.id]
    const competition = world.competitions[season.competitionId]
    return rules === undefined || competition === undefined || rules.seasonId !== season.id || rules.ecosystemId !== competition.ecosystemId ? [] : [{ season, rules }]
  })
  return authorities.length === 1 ? authorities[0] : undefined
}

export function resolveTradeSeasonAuthorityForTeam(world: GameWorld, teamId: TeamId, date: GameDate = world.currentDate): TradeSeasonAuthority | undefined {
  return resolveSharedTradeSeasonAuthority(world, [teamId], date)
}
