import type { CompetitionId, EcosystemId } from '@/domain/ids'
import { ecosystemIdFromString } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import type { SportsCategory } from '@/domain/primitives'
import type { DraftRules } from '@/domain/draft'
import type { RecruitingRules } from '@/domain/recruiting'

export interface DomesticCompetitionTier { readonly competitionId: CompetitionId; readonly level: number }
export interface TierMovementRule { readonly upperCompetitionId: CompetitionId; readonly lowerCompetitionId: CompetitionId; readonly exchangeCount: number }
export type SportsEcosystemKind = 'fibaLike' | 'nbaLike' | 'ncaaLike'
/**
 * How a CompetitionSeason derives its Trade Deadline. The policy is ecosystem configuration: NBA-like
 * and WNBA-like ecosystems each own their own value, so they can diverge without an engine change.
 */
export interface TradeDeadlinePolicy { readonly kind: 'REGULAR_SEASON_GAME_FRACTION'; readonly fraction: number }
export interface SportsEcosystem { readonly id: EcosystemId; readonly name: string; readonly kind: SportsEcosystemKind; readonly category: SportsCategory; readonly domesticTiers: readonly DomesticCompetitionTier[]; readonly tierMovementRules: readonly TierMovementRule[]; readonly draftRules?: DraftRules; readonly recruitingRules?: RecruitingRules; readonly tradeDeadlinePolicy?: TradeDeadlinePolicy }

export function createTradeDeadlinePolicy(input: TradeDeadlinePolicy): TradeDeadlinePolicy {
  if (input.kind !== 'REGULAR_SEASON_GAME_FRACTION') throw new RangeError('Trade deadline policy kind is unsupported')
  if (!Number.isFinite(input.fraction) || input.fraction <= 0 || input.fraction > 1) throw new RangeError('Trade deadline policy fraction must be within (0, 1]')
  return Object.freeze({ kind: input.kind, fraction: input.fraction })
}
export function createSportsEcosystem(input: Omit<SportsEcosystem, 'category' | 'domesticTiers' | 'tierMovementRules' | 'draftRules' | 'recruitingRules'> & Partial<Pick<SportsEcosystem, 'category' | 'domesticTiers' | 'tierMovementRules' | 'draftRules' | 'recruitingRules'>>): SportsEcosystem {
  if (input.kind !== 'fibaLike' && input.kind !== 'nbaLike' && input.kind !== 'ncaaLike') throw new RangeError('Sports ecosystem kind is unsupported')
  const tiers = [...(input.domesticTiers ?? [])].map((tier) => ({ competitionId: tier.competitionId, level: tier.level }))
  if (tiers.some((tier) => !Number.isInteger(tier.level) || tier.level < 1) || new Set(tiers.map((tier) => tier.level)).size !== tiers.length || new Set(tiers.map((tier) => tier.competitionId)).size !== tiers.length) throw new RangeError('Domestic competition tiers are invalid')
  const rules = [...(input.tierMovementRules ?? [])].map((rule) => ({ ...rule }))
  if (rules.some((rule) => !Number.isInteger(rule.exchangeCount) || rule.exchangeCount < 1 || rule.upperCompetitionId === rule.lowerCompetitionId) || new Set(rules.map((rule) => `${rule.upperCompetitionId}:${rule.lowerCompetitionId}`)).size !== rules.length) throw new RangeError('Tier movement rules are invalid')
  if ((input.kind === 'nbaLike' || input.kind === 'ncaaLike') && (tiers.length !== 0 || rules.length !== 0)) throw new RangeError('Closed and NCAA-like ecosystems cannot have domestic tier movement')
  const category = input.category ?? 'men'
  if (category !== 'men' && category !== 'women') throw new RangeError('Sports ecosystem category is unsupported')
  if (input.draftRules !== undefined && (input.kind !== 'nbaLike' || !Number.isInteger(input.draftRules.rounds) || input.draftRules.rounds < 1 || input.draftRules.orderMethod !== 'reverseStandings' || !Number.isInteger(input.draftRules.scheduledAfterDays) || input.draftRules.scheduledAfterDays < 0)) throw new RangeError('Draft rules are invalid for ecosystem')
  if (input.recruitingRules !== undefined && input.kind !== 'ncaaLike') throw new RangeError('Recruiting rules are invalid for ecosystem')
  // Only the NBA-like trade ecosystems declare a deadline policy; FIBA-like and NCAA-like roster
  // movement never inherits the NBA-style Trade system by accident.
  if (input.tradeDeadlinePolicy !== undefined && input.kind !== 'nbaLike') throw new RangeError('Trade deadline policy is only valid for an NBA-like ecosystem')
  const tradeDeadlinePolicy = input.tradeDeadlinePolicy === undefined ? undefined : createTradeDeadlinePolicy(input.tradeDeadlinePolicy)
  return Object.freeze({ id: ecosystemIdFromString(requireNonEmptyString(input.id, 'Sports ecosystem id')), name: requireNonEmptyString(input.name, 'Sports ecosystem name'), kind: input.kind, category, domesticTiers: Object.freeze(tiers), tierMovementRules: Object.freeze(rules), ...(input.draftRules === undefined ? {} : { draftRules: Object.freeze({ ...input.draftRules }) }), ...(input.recruitingRules === undefined ? {} : { recruitingRules: Object.freeze({ ...input.recruitingRules, costs: Object.freeze({ ...input.recruitingRules.costs }) }) }), ...(tradeDeadlinePolicy === undefined ? {} : { tradeDeadlinePolicy }) })
}
export const DEFAULT_FIBA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0001')
export const DEFAULT_NBA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0002')
export const DEFAULT_NCAA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0003')
