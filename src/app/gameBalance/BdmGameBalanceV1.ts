/**
 * BDM_GAME_BALANCE_V1 — versioned video-game parameters for Facilities, Governance and the opening economy.
 *
 * WHAT THIS IS. Every number below is a GAME-BALANCE DECISION made explicitly for playability by the BS17 mandate
 * of 2026-10-10. None of it is a statement about the real world: no real arena, owner, executive, company, price or
 * balance sheet is represented. Everything the preset creates is labeled as simulated (`bdm-balance-v1:` ids,
 * "(simulated)" display names, `GAME_BALANCE_PRESET` provenance). It never overwrites a documented World DB fact and
 * never touches an existing Finance fact.
 *
 * HOW IT IS USED. The preset is DATA. Finance, Governance and Facilities contain no branch for it: its opening
 * treasury enters through Finance's own opening-state authority, its authorization through an APPROVED budget
 * fact, its prices through the catalog contract, its people through Governance appointments and grants.
 *
 * SCALE. Currencies and economic scale are never mixed: every table is keyed by (ecosystem kind, scale band) and
 * stated in the organization's own canonical currency. No exchange rate exists or is invented.
 *
 * Money is in canonical minor units (1 EUR = 100). Tables are tuned against the shipped economy measured at
 * 2032-10-01: club player+staff salary authorizations of 6.65M-14.15M EUR (fiba-like), 10.9M-13.8M USD (NBA-like)
 * and 0.6M EUR (college), with whole-season payroll payables of up to 11.7M / 10.3M / 0.13M.
 */

export const BDM_GAME_BALANCE_V1_ID = 'BDM_GAME_BALANCE_V1' as const
export const BDM_GAME_BALANCE_V1_VERSION = 1 as const
export const BDM_GAME_BALANCE_V1_AUTHORIZATION = 'user-mandate:2026-10-10:BS17-GLOBAL-COMPLETION' as const
export const BDM_BALANCE_ID_PREFIX = 'bdm-balance-v1:' as const

export type GameBalanceEcosystemKind = 'fibaLike' | 'nbaLike' | 'ncaaLike'
export type GameBalanceScaleBand = 'SMALL' | 'MEDIUM' | 'LARGE'
export const GAME_BALANCE_SCALE_BANDS: readonly GameBalanceScaleBand[] = ['SMALL', 'MEDIUM', 'LARGE']

export interface GameBalanceMarket {
  readonly key: string
  readonly currencyCode: 'EUR' | 'USD'
  /** Simulated opening treasury per scale band (minor units). A game parameter, never derived from a budget or revenue. */
  readonly openingTreasuryMinorUnits: Readonly<Record<GameBalanceScaleBand, number>>
  /** Annual FACILITY maintenance authorization per scale band (minor units): permission to spend, never cash. */
  readonly facilityAuthorizationMinorUnits: Readonly<Record<GameBalanceScaleBand, number>>
  /** Annual CAPITAL_EXPENDITURE-class FACILITY investment authorization per scale band (minor units). */
  readonly capitalAuthorizationMinorUnits: Readonly<Record<GameBalanceScaleBand, number>>
  /** Base price per work kind (minor units). The relative order of these figures is the balance: see WORK_KIND_ORDER. */
  readonly basePriceMinorUnits: Readonly<Record<GameBalanceWorkKind, number>>
  /** Base price per capital investment kind (minor units): renovation < replacement < expansion. */
  readonly investmentPriceMinorUnits: Readonly<Record<GameBalanceInvestmentKind, number>>
}

export const GAME_BALANCE_INVESTMENT_KINDS = ['RENOVATION', 'REPLACEMENT', 'EXPANSION'] as const
export type GameBalanceInvestmentKind = (typeof GAME_BALANCE_INVESTMENT_KINDS)[number]

export const GAME_BALANCE_WORK_KINDS = ['ROUTINE_MAINTENANCE', 'PREVENTIVE_MAINTENANCE', 'MINOR_REPAIR', 'MAJOR_REPAIR', 'MINOR_REPLACEMENT'] as const
export type GameBalanceWorkKind = (typeof GAME_BALANCE_WORK_KINDS)[number]
/** Relative balance, cheapest to dearest: routine < preventive < minor repair < minor replacement < major repair. */
export const WORK_KIND_ORDER: readonly GameBalanceWorkKind[] = ['ROUTINE_MAINTENANCE', 'PREVENTIVE_MAINTENANCE', 'MINOR_REPAIR', 'MINOR_REPLACEMENT', 'MAJOR_REPAIR']

export const GAME_BALANCE_MARKETS: Readonly<Record<GameBalanceEcosystemKind, GameBalanceMarket>> = Object.freeze({
  fibaLike: Object.freeze({
    key: 'BDM-SIM-EUR-FIBA', currencyCode: 'EUR' as const,
    openingTreasuryMinorUnits: Object.freeze({ SMALL: 3_600_000_000, MEDIUM: 4_200_000_000, LARGE: 5_000_000_000 }),
    facilityAuthorizationMinorUnits: Object.freeze({ SMALL: 60_000_000, MEDIUM: 80_000_000, LARGE: 100_000_000 }),
    capitalAuthorizationMinorUnits: Object.freeze({ SMALL: 400_000_000, MEDIUM: 600_000_000, LARGE: 900_000_000 }),
    basePriceMinorUnits: Object.freeze({ ROUTINE_MAINTENANCE: 1_200_000, PREVENTIVE_MAINTENANCE: 2_000_000, MINOR_REPAIR: 4_000_000, MINOR_REPLACEMENT: 9_000_000, MAJOR_REPAIR: 18_000_000 }),
    investmentPriceMinorUnits: Object.freeze({ RENOVATION: 100_000_000, REPLACEMENT: 200_000_000, EXPANSION: 280_000_000 }),
  }),
  nbaLike: Object.freeze({
    key: 'BDM-SIM-USD-NBA', currencyCode: 'USD' as const,
    openingTreasuryMinorUnits: Object.freeze({ SMALL: 4_000_000_000, MEDIUM: 4_800_000_000, LARGE: 5_600_000_000 }),
    facilityAuthorizationMinorUnits: Object.freeze({ SMALL: 100_000_000, MEDIUM: 130_000_000, LARGE: 160_000_000 }),
    capitalAuthorizationMinorUnits: Object.freeze({ SMALL: 700_000_000, MEDIUM: 1_000_000_000, LARGE: 1_300_000_000 }),
    basePriceMinorUnits: Object.freeze({ ROUTINE_MAINTENANCE: 1_800_000, PREVENTIVE_MAINTENANCE: 3_000_000, MINOR_REPAIR: 6_000_000, MINOR_REPLACEMENT: 13_500_000, MAJOR_REPAIR: 27_000_000 }),
    investmentPriceMinorUnits: Object.freeze({ RENOVATION: 150_000_000, REPLACEMENT: 300_000_000, EXPANSION: 420_000_000 }),
  }),
  ncaaLike: Object.freeze({
    key: 'BDM-SIM-EUR-COLLEGE', currencyCode: 'EUR' as const,
    openingTreasuryMinorUnits: Object.freeze({ SMALL: 300_000_000, MEDIUM: 400_000_000, LARGE: 500_000_000 }),
    facilityAuthorizationMinorUnits: Object.freeze({ SMALL: 12_000_000, MEDIUM: 16_000_000, LARGE: 20_000_000 }),
    capitalAuthorizationMinorUnits: Object.freeze({ SMALL: 90_000_000, MEDIUM: 130_000_000, LARGE: 180_000_000 }),
    basePriceMinorUnits: Object.freeze({ ROUTINE_MAINTENANCE: 480_000, PREVENTIVE_MAINTENANCE: 800_000, MINOR_REPAIR: 1_600_000, MINOR_REPLACEMENT: 3_600_000, MAJOR_REPAIR: 7_200_000 }),
    investmentPriceMinorUnits: Object.freeze({ RENOVATION: 40_000_000, REPLACEMENT: 80_000_000, EXPANSION: 112_000_000 }),
  }),
})

/** Result of each work kind on the component, as an absolute target (0-100) the contract promises. Game parameters. */
export const WORK_KIND_RESULT: Readonly<Record<GameBalanceWorkKind, { readonly mode: 'ADD' | 'SET'; readonly points: number }>> = Object.freeze({
  ROUTINE_MAINTENANCE: Object.freeze({ mode: 'ADD' as const, points: 8 }),
  PREVENTIVE_MAINTENANCE: Object.freeze({ mode: 'ADD' as const, points: 12 }),
  MINOR_REPAIR: Object.freeze({ mode: 'SET' as const, points: 80 }),
  MINOR_REPLACEMENT: Object.freeze({ mode: 'SET' as const, points: 90 }),
  MAJOR_REPAIR: Object.freeze({ mode: 'SET' as const, points: 94 }),
})

/** The Board approves a non-urgent (MINOR) quote only while it is at most this share (permille) of the remaining FACILITY authorization. */
export const GAME_BALANCE_BOARD_ROUTINE_SHARE_PERMILLE = 250
/** Capital investments: duration at the standard provider, promised result, and when the situation justifies the investment. */
export const GAME_BALANCE_INVESTMENT = Object.freeze({
  RENOVATION: Object.freeze({ durationDays: 30, promisedCondition: 96, eligibleAtOrBelowCondition: 85 }),
  REPLACEMENT: Object.freeze({ durationDays: 45, promisedCondition: 100, eligibleAtOrBelowCondition: 65 }),
  EXPANSION: Object.freeze({ durationDays: 60, promisedCondition: 100, eligibleWhenPracticeCourtsBelow: 2 }),
})
/** Contractual payment milestones (permille of the price) recognized by Finance when the trigger is reached. */
export const GAME_BALANCE_CAPITAL_TRANCHES = Object.freeze([
  Object.freeze({ label: 'MOBILIZATION', permille: 300, trigger: 'WORK_STARTED' as const }),
  Object.freeze({ label: 'ACCEPTANCE', permille: 700, trigger: 'WORK_ACCEPTED' as const }),
])
/** The Board approves an investment only if Finance also allows this share (permille) of the annual FACILITY maintenance authorization on top of the price. */
export const GAME_BALANCE_BOARD_CAPITAL_LIQUIDITY_BUFFER_PERMILLE = 2_000
export const GAME_BALANCE_OFFER_VALID_DAYS = 14
export const GAME_BALANCE_PAYMENT_DUE_DAYS = 30

/** Three synthetic providers: a cheaper-slower, a standard and a dearer-faster one. Identity and offers persist; none is regenerated. */
export interface GameBalanceProviderSpec {
  readonly slug: string
  readonly displayName: string
  readonly specialty: 'GENERAL' | 'COURTS_AND_SURFACES' | 'EQUIPMENT_AND_SYSTEMS'
  /** Price factor in permille of the base price. */
  readonly priceFactorPermille: number
  readonly executionDays: number
  /** Capital works take this share (permille) of the standard duration with this provider. */
  readonly capitalDurationPermille: number
  readonly workKinds: readonly GameBalanceWorkKind[]
}
export const GAME_BALANCE_PROVIDERS: readonly GameBalanceProviderSpec[] = Object.freeze([
  Object.freeze({ slug: 'budget-works', displayName: 'Budget Facility Works (simulated)', specialty: 'GENERAL' as const, priceFactorPermille: 920, executionDays: 6, capitalDurationPermille: 1_500, workKinds: GAME_BALANCE_WORK_KINDS }),
  Object.freeze({ slug: 'standard-services', displayName: 'Standard Court Services (simulated)', specialty: 'COURTS_AND_SURFACES' as const, priceFactorPermille: 1_000, executionDays: 4, capitalDurationPermille: 1_000, workKinds: GAME_BALANCE_WORK_KINDS }),
  Object.freeze({ slug: 'rapid-systems', displayName: 'Rapid Equipment & Systems (simulated)', specialty: 'EQUIPMENT_AND_SYSTEMS' as const, priceFactorPermille: 1_120, executionDays: 2, capitalDurationPermille: 700, workKinds: GAME_BALANCE_WORK_KINDS }),
])

/** Generic simulated training facility each organization starts with when no documented Facility exists. */
export const GAME_BALANCE_FACILITY_COMPONENTS = Object.freeze([
  Object.freeze({ slug: 'court', type: 'PRACTICE_COURT' as const, name: 'Practice Court (simulated)', conditionRange: [60, 78] as const }),
  Object.freeze({ slug: 'strength', type: 'STRENGTH_ROOM' as const, name: 'Strength Room (simulated)', conditionRange: [58, 74] as const }),
  Object.freeze({ slug: 'physio', type: 'PHYSIO_ROOM' as const, name: 'Physiotherapy Room (simulated)', conditionRange: [58, 72] as const }),
])

export const GAME_BALANCE_ACTOR_PREFIX = 'simulated:bdm-game-balance-v1' as const

export function gameBalanceId(...parts: readonly string[]): string {
  return `${BDM_BALANCE_ID_PREFIX}${parts.join(':')}`
}

/** Stable FNV-1a: the preset's only source of per-organization variety, so every run is reproducible with no RNG. */
export function gameBalanceHash(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export interface BdmGameBalancePreset {
  readonly id: typeof BDM_GAME_BALANCE_V1_ID
  readonly version: typeof BDM_GAME_BALANCE_V1_VERSION
}
export const BDM_GAME_BALANCE_V1: BdmGameBalancePreset = Object.freeze({ id: BDM_GAME_BALANCE_V1_ID, version: BDM_GAME_BALANCE_V1_VERSION })
