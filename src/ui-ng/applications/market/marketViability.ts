import { evaluateTeamGameplayFinancialDecision, getCategoryAuthorizedHeadroom, getOrganizationFinancialAuthorization, isCategoryAuthorized, type FinancialReasonCode } from '@/domain/finance'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { marketMinorUnitsToMajor } from './marketFinancialSummary'

/**
 * F3 · what the manager sees before negotiating: the authorized salary budget, what is already committed, the margin that is really
 * left, the treasury (a different thing), the cost of the contract being considered and, when it is not viable, the concrete reason.
 * Pure projection of canonical Finance (`evaluateTeamGameplayFinancialDecision` + `getOrganizationFinancialAuthorization`); it owns no
 * rule, invents no income and shows an unknown quantity as unknown (null), never as zero.
 */
export interface MarketViability {
  readonly verdict: 'VIABLE' | 'NOT_VIABLE' | 'UNKNOWN'
  readonly currencyCode: string | null
  /** Authorized PLAYER_SALARY for the current fiscal period (permission to spend, not cash). */
  readonly authorizedMajor: number | null
  /** Guaranteed contract-year obligations attributed to the period. */
  readonly committedMajor: number | null
  /** OPEN reservations that currently constrain the capacity. */
  readonly reservedMajor: number | null
  /** authorized − committed − reserved (signed: negative = already over the authorization). */
  readonly marginMajor: number | null
  /** Unrestricted treasury cash. Distinct from the margin: a cash balance never authorizes a salary. */
  readonly cashMajor: number | null
  readonly annualSalaryMajor: number | null
  readonly years: number | null
  /** Salary × years: the contractual commitment the club would take on. */
  readonly totalContractMajor: number | null
  readonly marginAfterMajor: number | null
  readonly salaryCap: 'NOT_APPLICABLE' | 'APPLICABLE' | 'UNKNOWN'
  readonly financeStatus: string | null
  readonly reasons: readonly string[]
}

const REASON_TEXT: Readonly<Record<FinancialReasonCode, string>> = Object.freeze({
  AFFORDABLE_NOW: 'Dentro del margen salarial autorizado y con tesorería suficiente.',
  INSUFFICIENT_LIQUIDITY: 'La tesorería no cubre el compromiso: una autorización no es dinero en caja.',
  INSUFFICIENT_AUTHORIZED_HEADROOM: 'Supera el margen salarial que el club tiene autorizado: tener caja no basta sin autorización.',
  RESERVED_CAPACITY_CONFLICT: 'La capacidad está reservada por otra operación en curso.',
  CURRENCY_MISMATCH: 'La moneda del contrato no coincide con la del club.',
  FINANCE_PROFILE_UNAVAILABLE: 'El club no tiene perfil financiero activo.',
  REQUIRES_FINANCING: 'Requiere financiación que el club no tiene autorizada.',
  BUDGET_AUTHORIZATION_NOT_MODELLED: 'No hay autorización presupuestaria de salarios para este club.',
  AUTHORIZATION_OUT_OF_PERIOD: 'La autorización presupuestaria no cubre el periodo actual.',
})

const empty = (reasons: readonly string[], verdict: MarketViability['verdict'] = 'UNKNOWN'): MarketViability => Object.freeze({
  verdict, currencyCode: null, authorizedMajor: null, committedMajor: null, reservedMajor: null, marginMajor: null, cashMajor: null,
  annualSalaryMajor: null, years: null, totalContractMajor: null, marginAfterMajor: null, salaryCap: 'UNKNOWN', financeStatus: null, reasons: Object.freeze([...reasons]),
})

export function buildMarketViability(world: GameWorld, teamId: TeamId, proposal: { readonly annualSalary?: number; readonly years?: number } = {}): MarketViability {
  const team = world.teams[teamId]
  if (team === undefined) return empty(['El club no existe en este mundo.'])
  const profile = world.organizationFinancialProfilesById[team.organizationId]
  if (profile === undefined) return empty(['El club no tiene perfil financiero: sin moneda no hay importes que mostrar.'])
  const currencyCode = String(profile.baseCurrencyCode)
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId: team.organizationId, currencyCode, asOfDate: world.currentDate })
  const major = (minor: number) => marketMinorUnitsToMajor(minor, currencyCode)
  const authorized = authorization.state === 'ACTIVE' && isCategoryAuthorized(authorization, 'PLAYER_SALARY')
  const headroom = authorized ? getCategoryAuthorizedHeadroom(authorization, 'PLAYER_SALARY') : undefined
  const reservedMinor = authorization.reservedMinorUnits
  const marginMinor = headroom === undefined ? null : headroom.authorizedMinorUnits - headroom.committedMinorUnits - reservedMinor
  const rules = world.salaryRulesBySeasonId[world.currentSeasonId]
  const salaryCap: MarketViability['salaryCap'] = rules === undefined ? 'UNKNOWN' : rules.capAccounting === undefined || rules.capAccounting === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'APPLICABLE'
  const base = {
    currencyCode,
    authorizedMajor: headroom === undefined ? null : major(headroom.authorizedMinorUnits),
    committedMajor: headroom === undefined ? null : major(headroom.committedMinorUnits),
    reservedMajor: major(reservedMinor),
    marginMajor: marginMinor === null ? null : major(marginMinor),
    salaryCap,
  }
  const salary = proposal.annualSalary
  const years = proposal.years
  if (salary === undefined || !Number.isFinite(salary) || salary <= 0) {
    return Object.freeze({
      ...base, verdict: 'UNKNOWN' as const, cashMajor: null, annualSalaryMajor: null, years: years ?? null, totalContractMajor: null, marginAfterMajor: null, financeStatus: null,
      reasons: Object.freeze(['El salario que pide el jugador aún es desconocido: contacta con su agente. No se estima ni se supone cero.', ...(authorized ? [] : [REASON_TEXT.BUDGET_AUTHORIZATION_NOT_MODELLED])]),
    })
  }
  const decision = evaluateTeamGameplayFinancialDecision(world, { teamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: salary, effectiveDate: world.currentDate, sourceAuthority: 'MARKET_VIABILITY_PREVIEW', sourceEntityId: `preview:${teamId}:${salary}` })
  const cashMinor = decision.liquidity?.availableCash?.minorUnits ?? null
  const marginAfter = base.marginMajor === null ? null : base.marginMajor - salary
  return Object.freeze({
    ...base,
    verdict: decision.allowed ? 'VIABLE' as const : 'NOT_VIABLE' as const,
    cashMajor: cashMinor === null ? null : major(cashMinor),
    annualSalaryMajor: salary,
    years: years ?? null,
    totalContractMajor: years === undefined ? null : salary * years,
    marginAfterMajor: marginAfter,
    financeStatus: decision.status,
    reasons: Object.freeze(decision.reasons.map((reason) => REASON_TEXT[reason])),
  })
}
