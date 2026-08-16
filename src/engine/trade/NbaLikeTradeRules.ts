import type { EcosystemId, SeasonId } from '@/domain/ids'
import { createTradeRules, type TradeRules } from '@/domain/trade'

export function createNbaLikeTradeRules(seasonId: SeasonId, ecosystemId: EcosystemId): TradeRules {
  return createTradeRules({ seasonId, ecosystemId, maxTeamsPerTrade: 4, allowedAssetKinds: ['player', 'draftPick', 'futureDraftPick', 'playerRights', 'draftPickSwapRight', 'cash'], maxFutureDraftCyclesTradable: 4, retainedSalary: { allowed: true, maximumPercentage: .5, maximumContractsPerTeam: 3 }, cashConsideration: { allowed: true, maximumAmount: 5_000_000 }, createTradeException: { enabled: true, expiresAfterSeasons: 1 } })
}
