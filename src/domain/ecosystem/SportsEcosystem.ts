import type { CompetitionId, EcosystemId } from '@/domain/ids'
import { ecosystemIdFromString } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import type { SportsCategory } from '@/domain/primitives'

export interface DomesticCompetitionTier { readonly competitionId: CompetitionId; readonly level: number }
export interface TierMovementRule { readonly upperCompetitionId: CompetitionId; readonly lowerCompetitionId: CompetitionId; readonly exchangeCount: number }
export type SportsEcosystemKind = 'fibaLike' | 'nbaLike' | 'ncaaLike'
export interface SportsEcosystem { readonly id: EcosystemId; readonly name: string; readonly kind: SportsEcosystemKind; readonly category: SportsCategory; readonly domesticTiers: readonly DomesticCompetitionTier[]; readonly tierMovementRules: readonly TierMovementRule[] }
export function createSportsEcosystem(input: Omit<SportsEcosystem, 'category' | 'domesticTiers' | 'tierMovementRules'> & Partial<Pick<SportsEcosystem, 'category' | 'domesticTiers' | 'tierMovementRules'>>): SportsEcosystem {
  if (input.kind !== 'fibaLike' && input.kind !== 'nbaLike' && input.kind !== 'ncaaLike') throw new RangeError('Sports ecosystem kind is unsupported')
  const tiers = [...(input.domesticTiers ?? [])].map((tier) => ({ competitionId: tier.competitionId, level: tier.level }))
  if (tiers.some((tier) => !Number.isInteger(tier.level) || tier.level < 1) || new Set(tiers.map((tier) => tier.level)).size !== tiers.length || new Set(tiers.map((tier) => tier.competitionId)).size !== tiers.length) throw new RangeError('Domestic competition tiers are invalid')
  const rules = [...(input.tierMovementRules ?? [])].map((rule) => ({ ...rule }))
  if (rules.some((rule) => !Number.isInteger(rule.exchangeCount) || rule.exchangeCount < 1 || rule.upperCompetitionId === rule.lowerCompetitionId) || new Set(rules.map((rule) => `${rule.upperCompetitionId}:${rule.lowerCompetitionId}`)).size !== rules.length) throw new RangeError('Tier movement rules are invalid')
  if ((input.kind === 'nbaLike' || input.kind === 'ncaaLike') && (tiers.length !== 0 || rules.length !== 0)) throw new RangeError('Closed and NCAA-like ecosystems cannot have domestic tier movement')
  const category = input.category ?? 'men'
  if (category !== 'men' && category !== 'women') throw new RangeError('Sports ecosystem category is unsupported')
  return Object.freeze({ id: ecosystemIdFromString(requireNonEmptyString(input.id, 'Sports ecosystem id')), name: requireNonEmptyString(input.name, 'Sports ecosystem name'), kind: input.kind, category, domesticTiers: Object.freeze(tiers), tierMovementRules: Object.freeze(rules) })
}
export const DEFAULT_FIBA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0001')
export const DEFAULT_NBA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0002')
export const DEFAULT_NCAA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0003')
