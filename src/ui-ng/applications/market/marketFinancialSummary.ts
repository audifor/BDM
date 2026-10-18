import { getCategoryAuthorizedHeadroom, getEffectiveAuthorizedHeadroomMinorUnits, getOrganizationFinancialAuthorization, isCategoryAuthorized } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'

export type MarketSalaryCategory = 'PLAYER_SALARY' | 'STAFF_SALARY'

export interface MarketSalaryAuthorization {
  readonly currencyCode: string
  readonly authorizedMinorUnits: number
  readonly committedMinorUnits: number
  readonly availableMinorUnits: number
}

export interface MarketSalarySummary {
  readonly currencyCode: string
  readonly players: MarketSalaryAuthorization | null
  readonly staff: MarketSalaryAuthorization | null
}

function currencyScale(currencyCode: string): number {
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits
  return 10 ** (digits ?? 2)
}

function categoryAuthorization(
  authorization: ReturnType<typeof getOrganizationFinancialAuthorization>,
  category: MarketSalaryCategory,
): MarketSalaryAuthorization | null {
  if (authorization.state !== 'ACTIVE' || !isCategoryAuthorized(authorization, category)) return null
  const headroom = getCategoryAuthorizedHeadroom(authorization, category)
  return {
    currencyCode: authorization.currencyCode,
    authorizedMinorUnits: headroom.authorizedMinorUnits,
    committedMinorUnits: headroom.committedMinorUnits,
    availableMinorUnits: getEffectiveAuthorizedHeadroomMinorUnits(authorization, category),
  }
}

export function getMarketSalarySummary(world: GameWorld, teamId: TeamId): MarketSalarySummary | null {
  const team = world.teams[teamId]
  if (team === undefined) return null
  const profile = world.organizationFinancialProfilesById[team.organizationId]
  if (profile === undefined) return null
  const authorization = getOrganizationFinancialAuthorization(world, {
    organizationId: team.organizationId,
    currencyCode: profile.baseCurrencyCode,
    asOfDate: world.currentDate,
  })
  return {
    currencyCode: authorization.currencyCode,
    players: categoryAuthorization(authorization, 'PLAYER_SALARY'),
    staff: categoryAuthorization(authorization, 'STAFF_SALARY'),
  }
}

export function marketMajorUnitsToMinor(amount: number, currencyCode: string): number {
  return Math.round(amount * currencyScale(currencyCode))
}

export function marketMinorUnitsToMajor(amount: number, currencyCode: string): number {
  return amount / currencyScale(currencyCode)
}
