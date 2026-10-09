import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { competitionIdFromString, seasonIdFromString, type CompetitionId, type SeasonId } from '@/domain/ids'
import { createTreasuryCounterparty, type TreasuryCounterparty } from './Treasury'
import type { OperatingCostCategory } from './OperatingCostEngine'
import type { RevenueCategory } from './RevenueEngine'
import { createFinancialSource, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'

/**
 * BS16K-C — the canonical CompetitionEconomicProfile V1 data authority.
 *
 * This is DATA, never Finance logic. A competition declares WHY an Organization economically earns or incurs an
 * amount and WHEN that occurrence happens; the existing canonical engines
 * (`RevenueSource`/`materializeRevenueForDate`, `OperatingCostSource`/`materializeOperatingCostsForDate`) own the
 * accounting. Nothing here branches on a league name, an ecosystem or a club: adding a new league means adding a
 * profile, not engine code, and a competition with no profile simply receives nothing
 * (`ECONOMIC_POLICY_NOT_PROVISIONED`). There is deliberately no global fallback economy.
 *
 * The only two approved families in V1 are:
 * - `COMPETITION_PARTICIPATION_DISTRIBUTION`: money a competition distributes to an Organization because it
 *   participates in that competition/season, with explicit installments.
 * - `MATCH_OPERATIONS`: the non-payroll operating cost of hosting a home game, whose timing authority is the real
 *   canonical Game schedule.
 *
 * A policy may never derive its amount from a salary budget, payroll, reputation, prestige, roster value, arena
 * capacity or solvency, and it may never represent payroll: the amount is declared here and nowhere else.
 */
export const COMPETITION_ECONOMIC_PROFILE_VERSION = 1 as const
export type CompetitionEconomicProfileVersion = typeof COMPETITION_ECONOMIC_PROFILE_VERSION

/**
 * Provenance kind of every source an economic policy provisions. It is the single marker that tells canonical
 * Finance (and the economic-source authority guard) that this fact is grounded in an approved policy rather than
 * manufactured, so the specific policy is identified by `id` (the profile id) and described by the policy label.
 */
export const ECONOMIC_POLICY_PROVENANCE_KIND = 'COMPETITION_ECONOMIC_PROFILE'

export const ECONOMIC_REVENUE_POLICY_CODES = ['COMPETITION_PARTICIPATION_DISTRIBUTION'] as const
export type EconomicRevenuePolicyCode = (typeof ECONOMIC_REVENUE_POLICY_CODES)[number]

export const ECONOMIC_OPERATING_COST_POLICY_CODES = ['MATCH_OPERATIONS'] as const
export type EconomicOperatingCostPolicyCode = (typeof ECONOMIC_OPERATING_COST_POLICY_CODES)[number]

/** Recipient scope of a revenue policy: only Organizations competing in that competition, never a world default. */
export const ECONOMIC_REVENUE_RECIPIENT_SCOPES = ['PARTICIPATING_ORGANIZATIONS'] as const
export type EconomicRevenueRecipientScope = (typeof ECONOMIC_REVENUE_RECIPIENT_SCOPES)[number]

/** The cost policy is borne by the Organization hosting the game, and by no one else. */
export const ECONOMIC_OPERATING_COST_BEARERS = ['HOME_ORGANIZATION'] as const
export type EconomicOperatingCostBearer = (typeof ECONOMIC_OPERATING_COST_BEARERS)[number]

/** Timing authority of an operating cost policy. V1 only accepts the real canonical Game schedule. */
export const ECONOMIC_OPERATING_COST_TIMING_AUTHORITIES = ['HOME_GAME_SCHEDULE'] as const
export type EconomicOperatingCostTimingAuthority = (typeof ECONOMIC_OPERATING_COST_TIMING_AUTHORITIES)[number]

export const ECONOMIC_PROFILE_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export type EconomicProfileStatus = (typeof ECONOMIC_PROFILE_STATUSES)[number]

export interface EconomicPolicyInstallment {
  readonly recognitionOn: GameDate
  readonly dueOn: GameDate
  readonly amount: Money
}

export interface CompetitionRevenuePolicy {
  readonly code: EconomicRevenuePolicyCode
  readonly category: RevenueCategory
  readonly currencyCode: CurrencyCode
  /** The approved total for one recipient over the profile period; the installments must sum to exactly this. */
  readonly annualAmount: Money
  readonly recipientScope: EconomicRevenueRecipientScope
  readonly generationPolicy: 'EXPLICIT_SCHEDULE'
  readonly dueDatePolicy: 'ON_RECOGNITION'
  readonly sourceAuthority: 'COMPETITION'
  readonly installments: readonly EconomicPolicyInstallment[]
  readonly counterparty: TreasuryCounterparty | null
  readonly provenance: FinancialSource
}

export interface CompetitionOperatingCostPolicy {
  readonly code: EconomicOperatingCostPolicyCode
  readonly category: OperatingCostCategory
  readonly currencyCode: CurrencyCode
  /** The approved amount of one occurrence (one hosted home game), declared by the policy. */
  readonly perEventAmount: Money
  readonly bearer: EconomicOperatingCostBearer
  readonly timingAuthority: EconomicOperatingCostTimingAuthority
  readonly costNature: 'OPERATING'
  readonly generationPolicy: 'EXPLICIT_SCHEDULE'
  readonly dueDatePolicy: 'ON_RECOGNITION'
  readonly sourceAuthority: 'COMPETITION'
  readonly counterparty: TreasuryCounterparty | null
  readonly provenance: FinancialSource
}

export interface CompetitionEconomicProfile {
  readonly profileId: string
  readonly version: CompetitionEconomicProfileVersion
  readonly label: string
  readonly competitionId: CompetitionId
  /** Optional applicability narrowing; `null` means the profile applies to the competition itself. */
  readonly seasonId: SeasonId | null
  readonly ecosystemId: string | null
  /** The fiscal anchor the profile's installment dates were authored against. */
  readonly fiscalYearStartMonth: number
  readonly currencyCode: CurrencyCode
  readonly status: EconomicProfileStatus
  readonly revenuePolicies: readonly CompetitionRevenuePolicy[]
  readonly operatingCostPolicies: readonly CompetitionOperatingCostPolicy[]
  /** Human-readable approval label, e.g. "BDM Demo Economic Policy V1". */
  readonly approvedPolicyLabel: string
  readonly provenance: FinancialSource
}

/** Stable profile identity: the same competition + version always resolves the same profile id. */
export function competitionEconomicProfileIdFor(competitionId: CompetitionId | string, version: CompetitionEconomicProfileVersion = COMPETITION_ECONOMIC_PROFILE_VERSION): string {
  return `competition-economic-profile:${competitionIdFromString(competitionId)}:v${version}`
}

export function createCompetitionRevenuePolicy(input: {
  readonly code: EconomicRevenuePolicyCode
  readonly category: RevenueCategory
  readonly currencyCode: string
  readonly annualAmount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly recipientScope?: EconomicRevenueRecipientScope
  readonly installments: readonly { readonly recognitionOn: GameDate | string; readonly dueOn?: GameDate | string | null; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number } }[]
  readonly counterparty?: TreasuryCounterparty | null
  readonly provenance: FinancialSource
}): CompetitionRevenuePolicy {
  if (!ECONOMIC_REVENUE_POLICY_CODES.includes(input.code)) throw new TypeError(`Unsupported economic revenue policy code: ${String(input.code)}`)
  const currencyCode = createCurrencyCodeOf(input.currencyCode)
  const annualAmount = positivePolicyMoney(input.annualAmount, 'Economic revenue policy annual amount', currencyCode)
  if (input.installments.length === 0) throw new TypeError('Economic revenue policy requires at least one installment')
  let previous: GameDate | null = null
  const installments = Object.freeze(input.installments.map((term) => {
    const recognitionOn = parseGameDate(term.recognitionOn)
    const dueOn = term.dueOn === undefined || term.dueOn === null ? recognitionOn : parseGameDate(term.dueOn)
    if (compareGameDates(dueOn, recognitionOn) < 0) throw new RangeError('Economic revenue installment dueOn cannot precede recognitionOn')
    if (previous !== null && compareGameDates(recognitionOn, previous) <= 0) throw new RangeError('Economic revenue installments must be declared in strictly increasing date order')
    previous = recognitionOn
    return Object.freeze({ recognitionOn, dueOn, amount: positivePolicyMoney(term.amount, 'Economic revenue installment amount', currencyCode) })
  }))
  // The approved total is an invariant of the data, not something an engine recomputes.
  const total = installments.reduce((sum, term) => sum + term.amount.minorUnits, 0)
  if (total !== annualAmount.minorUnits) throw new RangeError(`Economic revenue policy installments must sum to the annual amount (${total} != ${annualAmount.minorUnits})`)
  return Object.freeze({
    code: input.code,
    category: input.category,
    currencyCode,
    annualAmount,
    recipientScope: input.recipientScope ?? 'PARTICIPATING_ORGANIZATIONS',
    generationPolicy: 'EXPLICIT_SCHEDULE' as const,
    dueDatePolicy: 'ON_RECOGNITION' as const,
    sourceAuthority: 'COMPETITION' as const,
    installments,
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createTreasuryCounterparty(input.counterparty),
    provenance: createFinancialSource(input.provenance),
  })
}

export function createCompetitionOperatingCostPolicy(input: {
  readonly code: EconomicOperatingCostPolicyCode
  readonly category: OperatingCostCategory
  readonly currencyCode: string
  readonly perEventAmount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly bearer?: EconomicOperatingCostBearer
  readonly timingAuthority?: EconomicOperatingCostTimingAuthority
  readonly counterparty?: TreasuryCounterparty | null
  readonly provenance: FinancialSource
}): CompetitionOperatingCostPolicy {
  if (!ECONOMIC_OPERATING_COST_POLICY_CODES.includes(input.code)) throw new TypeError(`Unsupported economic operating cost policy code: ${String(input.code)}`)
  if (input.category !== input.code) throw new TypeError(`Economic operating cost policy ${input.code} must use the ${input.code} category so no other cost family is conflated with it`)
  const currencyCode = createCurrencyCodeOf(input.currencyCode)
  const perEventAmount = positivePolicyMoney(input.perEventAmount, 'Economic operating cost per-event amount', currencyCode)
  return Object.freeze({
    code: input.code,
    category: input.category,
    currencyCode,
    perEventAmount,
    bearer: input.bearer ?? 'HOME_ORGANIZATION',
    timingAuthority: input.timingAuthority ?? 'HOME_GAME_SCHEDULE',
    costNature: 'OPERATING' as const,
    generationPolicy: 'EXPLICIT_SCHEDULE' as const,
    dueDatePolicy: 'ON_RECOGNITION' as const,
    sourceAuthority: 'COMPETITION' as const,
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createTreasuryCounterparty(input.counterparty),
    provenance: createFinancialSource(input.provenance),
  })
}

export function createCompetitionEconomicProfile(input: {
  readonly competitionId: CompetitionId | string
  readonly seasonId?: SeasonId | string | null
  readonly ecosystemId?: string | null
  readonly fiscalYearStartMonth: number
  readonly currencyCode: string
  readonly label: string
  readonly approvedPolicyLabel: string
  readonly status?: EconomicProfileStatus
  readonly version?: CompetitionEconomicProfileVersion
  readonly revenuePolicies?: readonly CompetitionRevenuePolicy[]
  readonly operatingCostPolicies?: readonly CompetitionOperatingCostPolicy[]
}): CompetitionEconomicProfile {
  const version = input.version ?? COMPETITION_ECONOMIC_PROFILE_VERSION
  if (version !== COMPETITION_ECONOMIC_PROFILE_VERSION) throw new RangeError(`Unsupported CompetitionEconomicProfile version: ${String(version)}`)
  const currencyCode = createCurrencyCodeOf(input.currencyCode)
  if (!Number.isInteger(input.fiscalYearStartMonth) || input.fiscalYearStartMonth < 1 || input.fiscalYearStartMonth > 12) throw new RangeError('Economic profile fiscalYearStartMonth must be an integer from 1 to 12')
  const revenuePolicies = Object.freeze([...(input.revenuePolicies ?? [])])
  const operatingCostPolicies = Object.freeze([...(input.operatingCostPolicies ?? [])])
  if (revenuePolicies.length === 0 && operatingCostPolicies.length === 0) throw new TypeError('A CompetitionEconomicProfile must declare at least one economic policy')
  for (const policy of revenuePolicies) {
    if (policy.currencyCode !== currencyCode) throw new RangeError(`Economic revenue policy ${policy.code} currency must match the profile currency ${currencyCode}`)
  }
  for (const policy of operatingCostPolicies) {
    if (policy.currencyCode !== currencyCode) throw new RangeError(`Economic operating cost policy ${policy.code} currency must match the profile currency ${currencyCode}`)
  }
  const duplicateRevenue = firstDuplicate(revenuePolicies.map((policy) => policy.code))
  if (duplicateRevenue !== null) throw new TypeError(`Duplicate economic revenue policy ${duplicateRevenue}`)
  const duplicateCost = firstDuplicate(operatingCostPolicies.map((policy) => policy.code))
  if (duplicateCost !== null) throw new TypeError(`Duplicate economic operating cost policy ${duplicateCost}`)
  return Object.freeze({
    profileId: competitionEconomicProfileIdFor(input.competitionId, version),
    version,
    label: nonEmpty(input.label, 'Economic profile label'),
    competitionId: competitionIdFromString(input.competitionId),
    seasonId: input.seasonId === undefined || input.seasonId === null ? null : seasonIdFromString(input.seasonId),
    ecosystemId: input.ecosystemId === undefined || input.ecosystemId === null ? null : nonEmpty(input.ecosystemId, 'Economic profile ecosystemId'),
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    currencyCode,
    status: input.status ?? 'ACTIVE',
    revenuePolicies,
    operatingCostPolicies,
    approvedPolicyLabel: nonEmpty(input.approvedPolicyLabel, 'Economic profile approved policy label'),
    provenance: Object.freeze({ kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: competitionEconomicProfileIdFor(input.competitionId, version) }),
  })
}

/** The approved profile for one competition, or `undefined` — absence is never replaced by a fallback economy. */
export function applicableEconomicProfile(profiles: readonly CompetitionEconomicProfile[], competitionId: CompetitionId | string): CompetitionEconomicProfile | undefined {
  const target = String(competitionId)
  return profiles.filter((profile) => String(profile.competitionId) === target).sort((left, right) => right.version - left.version || left.profileId.localeCompare(right.profileId))[0]
}

export function revenuePolicyOf(profile: CompetitionEconomicProfile, code: EconomicRevenuePolicyCode): CompetitionRevenuePolicy | undefined {
  return profile.revenuePolicies.find((policy) => policy.code === code)
}

export function operatingCostPolicyOf(profile: CompetitionEconomicProfile, code: EconomicOperatingCostPolicyCode): CompetitionOperatingCostPolicy | undefined {
  return profile.operatingCostPolicies.find((policy) => policy.code === code)
}

function createCurrencyCodeOf(value: string): CurrencyCode {
  return createMoney({ currencyCode: value, minorUnits: 1 }).currencyCode
}

function positivePolicyMoney(input: Money | { readonly currencyCode: string; readonly minorUnits: number }, label: string, currencyCode: CurrencyCode): Money {
  const amount = createMoney(input)
  if (amount.currencyCode !== currencyCode) throw new RangeError(`${label} currency must match the policy currency ${currencyCode}`)
  if (amount.minorUnits <= 0) throw new RangeError(`${label} must be greater than zero`)
  return amount
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`)
  return value
}
