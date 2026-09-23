import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { competitionIdFromString, ecosystemIdFromString, organizationIdFromString, organizationLicenseIdFromString, seasonIdFromString, type CompetitionId, type EcosystemId, type OrganizationId, type OrganizationLicenseId, type SeasonId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'

export type OrganizationLicenseScope = { readonly kind: 'COMPETITION'; readonly competitionId: CompetitionId } | { readonly kind: 'ECOSYSTEM'; readonly ecosystemId: EcosystemId }
export const ORGANIZATION_LICENSE_STATUSES = ['ACTIVE', 'CONDITIONAL', 'SUSPENDED', 'REVOKED', 'EXPIRED'] as const
export type OrganizationLicenseStatus = typeof ORGANIZATION_LICENSE_STATUSES[number]

export interface OrganizationLicense {
  readonly id: OrganizationLicenseId
  readonly issuerOrganizationId: OrganizationId
  readonly holderOrganizationId: OrganizationId
  readonly scope: OrganizationLicenseScope
  readonly seasonId: SeasonId | null
  readonly status: OrganizationLicenseStatus
  readonly validFrom: GameDate
  readonly validTo: GameDate | null
  readonly conditions: readonly string[]
}

export interface CreateOrganizationLicenseInput {
  readonly id: OrganizationLicenseId | string
  readonly issuerOrganizationId: OrganizationId | string
  readonly holderOrganizationId: OrganizationId | string
  readonly scope: OrganizationLicenseScope
  readonly seasonId?: SeasonId | string | null
  readonly status: OrganizationLicenseStatus
  readonly validFrom: GameDate | string
  readonly validTo?: GameDate | string | null
  readonly conditions?: readonly string[]
}

export function createOrganizationLicense(input: CreateOrganizationLicenseInput): OrganizationLicense {
  const validFrom = parseGameDate(input.validFrom); const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validTo !== null && compareGameDates(validTo, validFrom) < 0) throw new RangeError('Organization license validTo cannot precede validFrom')
  if (!ORGANIZATION_LICENSE_STATUSES.includes(input.status)) throw new TypeError('Organization license status is invalid')
  const scope = input.scope.kind === 'COMPETITION' ? { kind: 'COMPETITION' as const, competitionId: competitionIdFromString(input.scope.competitionId) } : input.scope.kind === 'ECOSYSTEM' ? { kind: 'ECOSYSTEM' as const, ecosystemId: ecosystemIdFromString(input.scope.ecosystemId) } : (() => { throw new TypeError('Organization license scope is invalid') })()
  return Object.freeze({ id: organizationLicenseIdFromString(input.id), issuerOrganizationId: organizationIdFromString(input.issuerOrganizationId), holderOrganizationId: organizationIdFromString(input.holderOrganizationId), scope, seasonId: input.seasonId === undefined || input.seasonId === null ? null : seasonIdFromString(input.seasonId), status: input.status, validFrom, validTo, conditions: Object.freeze([...(input.conditions ?? [])]) })
}

export function isOrganizationLicenseValidOn(license: OrganizationLicense, onDate: GameDate | string): boolean {
  const date = parseGameDate(onDate)
  return (license.status === 'ACTIVE' || license.status === 'CONDITIONAL') && license.validFrom <= date && (license.validTo === null || date <= license.validTo)
}

export function getOrganizationLicensesValidOn(world: GameWorld, holderOrganizationId: OrganizationId, onDate: GameDate | string = world.currentDate): readonly OrganizationLicense[] {
  return Object.values(world.organizationLicensesById).filter((license) => license.holderOrganizationId === holderOrganizationId && isOrganizationLicenseValidOn(license, onDate)).sort((left, right) => left.id.localeCompare(right.id))
}
