import { createTradeRules, type TradeWindowRule } from '@/domain/trade'
import { isRegularSeasonGame } from '@/domain/season'
import type { Game } from '@/domain/game'
import type { Season } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * Canonical Trade Deadline derivation: the deadline is the GameDate of the configured schedule
 * position (`index = ceil(gameCount * fraction) - 1`, clamped) inside the CompetitionSeason's own
 * ordered regular-season schedule, so it never depends on wall-clock time, a fixed month/day, the
 * user's club or NBA real-world data. Games sharing the deadline date push the effective fraction a
 * little above the configured one; that is expected.
 */
export function deriveTradeWindowFromSchedule(games: readonly Game[], fraction: number): TradeWindowRule | undefined {
  const ordered = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  if (ordered.length === 0) return undefined
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1))
  return Object.freeze({ opensOn: ordered[0]!.date, closesOn: ordered[index]!.date })
}

/** The CompetitionSeason's own regular-season Games, ordered deterministically by date then id. */
export function regularSeasonGamesOfSeason(world: GameWorld, season: Season): readonly Game[] {
  return Object.values(world.games)
    .filter((game) => game.seasonId === season.id && isRegularSeasonGame(season, game))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/**
 * Competition/season generation owns the Trade Deadline: every CompetitionSeason that carries
 * TradeRules under an ecosystem with a `tradeDeadlinePolicy` materializes its own explicit
 * `tradeWindow` from its own schedule. The Trade engine never recalculates it and never receives a
 * deadline before it is real (a season without a schedule stays windowless and therefore closed to
 * trading). Re-running this is idempotent, and it is what makes a successor edition derive new
 * absolute dates instead of rolling the previous edition's dates forward.
 */
export function materializeTradeWindows(world: GameWorld): GameWorld {
  let current = world
  for (const season of Object.values(world.seasons)) {
    const rules = current.tradeRulesBySeasonId[season.id]
    if (rules === undefined) continue
    const competition = current.competitions[season.competitionId]
    const policy = competition === undefined ? undefined : current.ecosystems[competition.ecosystemId]?.tradeDeadlinePolicy
    if (policy === undefined) continue
    const window = deriveTradeWindowFromSchedule(regularSeasonGamesOfSeason(current, season), policy.fraction)
    if (window === undefined) continue
    if (rules.tradeWindow?.opensOn === window.opensOn && rules.tradeWindow?.closesOn === window.closesOn) continue
    current = updateGameWorld(current, { tradeRulesBySeasonId: { ...current.tradeRulesBySeasonId, [season.id]: createTradeRules({ ...rules, tradeWindow: window }) } })
  }
  return current
}
