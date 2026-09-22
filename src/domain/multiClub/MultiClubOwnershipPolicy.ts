import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { ecosystemIdFromString, competitionIdFromString, multiClubOwnershipPolicyIdFromString, type CompetitionId, type EcosystemId, type MultiClubOwnershipPolicyId } from '@/domain/ids'

export type MultiClubOwnershipPolicyScope =
  | { readonly kind: 'COMPETITION'; readonly competitionId: CompetitionId }
  | { readonly kind: 'ECOSYSTEM'; readonly ecosystemId: EcosystemId }

export type MultiClubCommonControlRule = 'IGNORE' | 'CONFLICT'
export type MultiClubPolicyEnforcement = 'ADVISORY' | 'BLOCK'

export interface MultiClubOwnershipPolicy {
  readonly id: MultiClubOwnershipPolicyId
  readonly scope: MultiClubOwnershipPolicyScope
  readonly effectiveFrom: GameDate | null
  readonly effectiveTo: GameDate | null
  readonly commonControlRule: MultiClubCommonControlRule
  readonly ownershipThresholdPercentage: number | null
  readonly includeIndirectOwnership: boolean
  readonly enforcement: MultiClubPolicyEnforcement
}

export interface CreateMultiClubOwnershipPolicyInput {
  readonly id: MultiClubOwnershipPolicyId | string
  readonly scope: MultiClubOwnershipPolicyScope
  readonly effectiveFrom?: GameDate | string | null
  readonly effectiveTo?: GameDate | string | null
  readonly commonControlRule: MultiClubCommonControlRule
  readonly ownershipThresholdPercentage: number | null
  readonly includeIndirectOwnership: boolean
  readonly enforcement: MultiClubPolicyEnforcement
}

export function createMultiClubOwnershipPolicy(input: CreateMultiClubOwnershipPolicyInput): MultiClubOwnershipPolicy {
  const effectiveFrom = nullableDate(input.effectiveFrom)
  const effectiveTo = nullableDate(input.effectiveTo)
  if (effectiveFrom !== null && effectiveTo !== null && compareGameDates(effectiveTo, effectiveFrom) < 0) throw new RangeError('Multi-club ownership policy effectiveTo cannot precede effectiveFrom')
  if (input.commonControlRule !== 'IGNORE' && input.commonControlRule !== 'CONFLICT') throw new TypeError('Multi-club ownership policy common control rule is invalid')
  if (input.ownershipThresholdPercentage !== null && (!Number.isFinite(input.ownershipThresholdPercentage) || input.ownershipThresholdPercentage < 0 || input.ownershipThresholdPercentage > 100)) throw new RangeError('Multi-club ownership policy ownership threshold must be null or between 0 and 100')
  if (typeof input.includeIndirectOwnership !== 'boolean') throw new TypeError('Multi-club ownership policy includeIndirectOwnership must be boolean')
  if (input.enforcement !== 'ADVISORY' && input.enforcement !== 'BLOCK') throw new TypeError('Multi-club ownership policy enforcement is invalid')
  const scope = input.scope.kind === 'COMPETITION'
    ? Object.freeze({ kind: 'COMPETITION' as const, competitionId: competitionIdFromString(input.scope.competitionId) })
    : input.scope.kind === 'ECOSYSTEM'
      ? Object.freeze({ kind: 'ECOSYSTEM' as const, ecosystemId: ecosystemIdFromString(input.scope.ecosystemId) })
      : (() => { throw new TypeError('Multi-club ownership policy scope is invalid') })()
  return Object.freeze({
    id: multiClubOwnershipPolicyIdFromString(input.id),
    scope,
    effectiveFrom,
    effectiveTo,
    commonControlRule: input.commonControlRule,
    ownershipThresholdPercentage: input.ownershipThresholdPercentage,
    includeIndirectOwnership: input.includeIndirectOwnership,
    enforcement: input.enforcement,
  })
}

export function isMultiClubOwnershipPolicyActiveOn(policy: MultiClubOwnershipPolicy, onDate: GameDate): boolean {
  return (policy.effectiveFrom === null || compareGameDates(policy.effectiveFrom, onDate) <= 0)
    && (policy.effectiveTo === null || compareGameDates(onDate, policy.effectiveTo) <= 0)
}

function nullableDate(value: GameDate | string | null | undefined): GameDate | null {
  return value === undefined || value === null ? null : parseGameDate(value)
}
