import { createTradeDeadlinePolicy, type TradeDeadlinePolicy } from '@/domain/ecosystem'
import type { EcosystemId, SeasonId } from '@/domain/ids'
import { createTradeRules, type TradeRules } from '@/domain/trade'

/**
 * Canonical NBA-like trade policy: trading opens on the CompetitionSeason's first regular-season
 * GameDate and closes at the 65% schedule checkpoint, which competition/season generation
 * materializes into that season's own explicit `tradeWindow` (`materializeTradeWindows`).
 */
export const NBA_LIKE_TRADE_DEADLINE_POLICY: TradeDeadlinePolicy = createTradeDeadlinePolicy({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })

/**
 * WNBA-like trade policy, configured independently from the NBA-like one. Both currently default to
 * the same fraction because BDM has no separate WNBA deadline authority yet: current defaults happen
 * to match, the policies are not coupled, and they can diverge without an engine change.
 */
export const WNBA_LIKE_TRADE_DEADLINE_POLICY: TradeDeadlinePolicy = createTradeDeadlinePolicy({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })

/**
 * The NBA-like rule preset carries only competition/season-configurable trade rules: no window is
 * invented here, because the Trade Deadline is derived from the season's own schedule once it exists.
 * `rollForwardTradeRules` likewise never copies absolute dates into a successor edition.
 */
export function createNbaLikeTradeRules(seasonId: SeasonId, ecosystemId: EcosystemId): TradeRules {
  return createTradeRules({ seasonId, ecosystemId, maxTeamsPerTrade: 4, allowedAssetKinds: ['player', 'draftPick', 'futureDraftPick', 'playerRights', 'draftPickSwapRight', 'cash'], maxFutureDraftCyclesTradable: 4, retainedSalary: { allowed: true, maximumPercentage: .5, maximumContractsPerTeam: 3 }, cashConsideration: { allowed: true, maximumAmount: 5_000_000 }, createTradeException: { enabled: true, expiresAfterSeasons: 1 } })
}
