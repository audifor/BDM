import {
  evaluateTeamGameplayFinancialDecision,
  getCategoryAuthorizedHeadroom,
  getOrganizationFinancialAuthorization,
  isCategoryAuthorized,
  gameplayFinancialBlockReason,
  type GameplayFinancialDecision,
} from '@/domain/finance'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

export const TRANSFER_FEE_CATEGORY = 'TRANSFER_FEE'

/**
 * What the buyer is allowed to pay selling clubs this period, kept apart from the salary budget and from the treasury.
 * `spentMinorUnits` is the compensation already recognised in the authorization period: canonical Finance counts only OUTSTANDING
 * commitments against an authorization line, and a transfer fee is paid the day it is agreed, so without this the same permission
 * could be spent again every day.
 */
export interface TransferFeeAuthorization {
  readonly state: 'AVAILABLE' | 'NOT_MODELLED' | 'NO_ACTIVE_AUTHORIZATION'
  readonly currencyCode: string | null
  readonly authorizedMinorUnits: number | null
  readonly spentMinorUnits: number | null
  readonly committedMinorUnits: number | null
  readonly headroomMinorUnits: number | null
}

export function transferFeeAuthorization(world: GameWorld, teamId: TeamId): TransferFeeAuthorization {
  const team = world.teams[teamId]
  const profile = team === undefined ? undefined : world.organizationFinancialProfilesById[team.organizationId]
  if (team === undefined || profile === undefined) return { state: 'NO_ACTIVE_AUTHORIZATION', currencyCode: null, authorizedMinorUnits: null, spentMinorUnits: null, committedMinorUnits: null, headroomMinorUnits: null }
  const currencyCode = String(profile.baseCurrencyCode)
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId: team.organizationId, currencyCode, asOfDate: world.currentDate })
  if (authorization.state !== 'ACTIVE' || authorization.period === null) return { state: 'NO_ACTIVE_AUTHORIZATION', currencyCode, authorizedMinorUnits: null, spentMinorUnits: null, committedMinorUnits: null, headroomMinorUnits: null }
  if (!isCategoryAuthorized(authorization, TRANSFER_FEE_CATEGORY)) return { state: 'NOT_MODELLED', currencyCode, authorizedMinorUnits: null, spentMinorUnits: null, committedMinorUnits: null, headroomMinorUnits: null }
  const line = getCategoryAuthorizedHeadroom(authorization, TRANSFER_FEE_CATEGORY)
  const period = authorization.period
  const spentMinorUnits = Object.values(world.expenseRecognitionsById)
    .filter((item) => item.organizationId === team.organizationId && item.category === TRANSFER_FEE_CATEGORY && String(item.amount.currencyCode) === currencyCode
      && item.recognizedOn >= period.startsOn && item.recognizedOn <= period.endsOn)
    .reduce((sum, item) => sum + item.amount.minorUnits, 0)
  return {
    state: 'AVAILABLE', currencyCode,
    authorizedMinorUnits: line.authorizedMinorUnits, spentMinorUnits, committedMinorUnits: line.committedMinorUnits,
    headroomMinorUnits: line.authorizedMinorUnits - line.committedMinorUnits - spentMinorUnits,
  }
}

export interface TransferFeeDecision {
  readonly allowed: boolean
  /** Canonical Finance status plus the extra period-spend check, in the words of the canonical reason codes. */
  readonly reason: string | null
  readonly decision: GameplayFinancialDecision | null
}

/** Canonical Finance for the compensation: its own authorization, liquidity, and what was already spent in the period. */
export function evaluateTransferFee(world: GameWorld, teamId: TeamId, feeMajorUnits: number, sourceEntityId: string): TransferFeeDecision {
  const authorization = transferFeeAuthorization(world, teamId)
  if (authorization.state === 'NOT_MODELLED') return { allowed: false, reason: 'BUDGET_AUTHORIZATION_NOT_MODELLED:TRANSFER_FEE', decision: null }
  if (authorization.state === 'NO_ACTIVE_AUTHORIZATION') return { allowed: false, reason: 'AUTHORIZATION_OUT_OF_PERIOD:TRANSFER_FEE', decision: null }
  const decision = evaluateTeamGameplayFinancialDecision(world, {
    teamId, action: 'TRANSFER_FEE', legacyAnnualAmountMajorUnits: feeMajorUnits, effectiveDate: world.currentDate, sourceAuthority: 'PLAYER_TRANSFER', sourceEntityId,
  })
  if (!decision.allowed) return { allowed: false, reason: gameplayFinancialBlockReason(decision), decision }
  const feeMinorUnits = decision.amount?.minorUnits ?? 0
  if (authorization.headroomMinorUnits === null || feeMinorUnits > authorization.headroomMinorUnits) {
    return { allowed: false, reason: 'INSUFFICIENT_AUTHORIZED_HEADROOM:TRANSFER_FEE_ALREADY_SPENT_IN_PERIOD', decision }
  }
  return { allowed: true, reason: null, decision }
}
