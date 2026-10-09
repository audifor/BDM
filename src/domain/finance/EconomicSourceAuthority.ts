import type { GameWorld } from '@/domain/world'
import { ECONOMIC_POLICY_PROVENANCE_KIND } from './CompetitionEconomicProfile'

/**
 * BS16K / BS16K-C — shipped economic source authority.
 *
 * Canonical Finance already knows HOW to account for economic events (`RevenueSource` +
 * `materializeRevenueForDate`, `OperatingCostSource` + `materializeOperatingCostsForDate`,
 * `CompetitionDistributionFact` + `materializeCompetitionEconomyForDate`, all through the CF4 adapter). BS16K
 * asked a different question: WHERE does the amount come from, and WHEN is it due?
 *
 * The BS16K audit found that no shipped *data* supplied a defensible recurring amount together with its timing,
 * so nothing was activated and the missing product authorities were registered instead of being invented. The
 * product owner then approved BDM DEMO ECONOMIC POLICY V1, and BS16K-C closed the gap with a generic authority
 * rather than league-specific code: a competition may carry a `CompetitionEconomicProfile` that declares the
 * approved amount and the explicit occurrence schedule, and `provisionEconomicSources` turns it into canonical
 * `RevenueSource`/`OperatingCostSource` facts. Two families are now live:
 * `COMPETITION_PARTICIPATION_DISTRIBUTION` (revenue) and `MATCH_OPERATIONS` (operating cost).
 *
 * This module still records the whole audit as data (not prose) so it is testable, including everything that
 * remains ungrounded: authorization figures, physical drivers, soft ratings and canonical types with no shipped
 * producer. The rule it protects is unchanged: revenue must be earned and cost must be caused, so if Finance
 * cannot explain "why did this Organization receive or incur this amount on this date?" it must not create it.
 */
export const ECONOMIC_SOURCE_KINDS = ['REVENUE', 'OPERATING_COST'] as const
export type EconomicSourceKind = (typeof ECONOMIC_SOURCE_KINDS)[number]

/**
 * `SHIPPED_ECONOMIC_SOURCE` is the only classification that may become a shipped producer. No shipped candidate
 * currently reaches it.
 */
export const ECONOMIC_SOURCE_CLASSIFICATIONS = [
  'SHIPPED_ECONOMIC_SOURCE',
  'CANONICAL_TYPE_NO_SHIPPED_PRODUCER',
  'AUTHORIZATION_ONLY',
  'FORECAST_ONLY',
  'PHYSICAL_DRIVER_ONLY',
  'INSUFFICIENT_SEMANTICS',
] as const
export type EconomicSourceClassification = (typeof ECONOMIC_SOURCE_CLASSIFICATIONS)[number]

export const ECONOMIC_MONEY_SCALES = ['MINOR_UNITS', 'LEGACY_MAJOR_UNITS'] as const
export type EconomicMoneyScale = (typeof ECONOMIC_MONEY_SCALES)[number]

export interface ShippedEconomicSourceCandidate {
  readonly source: string
  readonly kind: EconomicSourceKind
  readonly meaning: string
  readonly classification: EconomicSourceClassification
  /** A canonical type/engine for this concept exists. */
  readonly canonicalTypeExists: boolean
  /** Shipped data supplies an amount that Finance could materialize. */
  readonly amountAuthority: boolean
  /** Shipped data supplies the date/period/recurrence an occurrence needs. */
  readonly timingAuthority: boolean
  /** Shipped (production) data actually carries rows/values for it. */
  readonly shippedData: boolean
  /** Money scale of the shipped values, when any exist; `null` when the concept carries no monetary value. */
  readonly moneyScale: EconomicMoneyScale | null
  /** True only for a source family an approved economic policy actually activates into canonical Finance. */
  readonly materialized: boolean
  readonly evidence: string
}

export const SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION: readonly ShippedEconomicSourceCandidate[] = Object.freeze([
  Object.freeze({ source: 'CompetitionEconomicProfile — COMPETITION_PARTICIPATION_DISTRIBUTION', kind: 'REVENUE' as const, meaning: 'Money a competition distributes to an Organization because it participates in that competition/season, with an explicit approved amount and explicit installments.', classification: 'SHIPPED_ECONOMIC_SOURCE' as const, canonicalTypeExists: true, amountAuthority: true, timingAuthority: true, shippedData: true, moneyScale: 'MINOR_UNITS' as const, materialized: true, evidence: 'src/domain/finance/CompetitionEconomicProfile.ts + EconomicSourceProvisioning.ts, shipped by src/app/game/AcbDemoEconomicPolicy.ts' }),
  Object.freeze({ source: 'RevenueSource (CF7)', kind: 'REVENUE' as const, meaning: 'Canonical recurring revenue source: category, amount, period, generation policy and payment schedule.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/RevenueEngine.ts — the accounting engine, provisioned only from an approved economic policy' }),
  Object.freeze({ source: 'World DB revenue_stream', kind: 'REVENUE' as const, meaning: 'Organization revenue stream with stream_type, expected_annual_amount, currency_code, valid_from/valid_to.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db revenue_stream: 0 rows; no repo code reads it. An explicit World DB source always wins over a profile, so it stays the future authority for the same canonical types.' }),
  Object.freeze({ source: 'World DB budget', kind: 'REVENUE' as const, meaning: 'Owner/season budget with budget_type, amount and currency_code — a permission figure, never earned value.', classification: 'AUTHORIZATION_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db budget: 0 rows' }),
  Object.freeze({ source: 'TeamFinances.playerSalaryBudget / staffSalaryBudget', kind: 'REVENUE' as const, meaning: 'Legacy per-team salary spending pools derived from active payroll; permission to spend, not liquidity or earnings.', classification: 'AUTHORIZATION_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: 'LEGACY_MAJOR_UNITS' as const, materialized: false, evidence: 'src/engine/world/TeamFinancesGenerator.ts; src/domain/finance/TeamFinances.ts' }),
  Object.freeze({ source: 'FinancialBudget (APPROVED)', kind: 'REVENUE' as const, meaning: 'Canonical approved budget fact: a category authorization for a planning period, materialized from legacy budgets.', classification: 'AUTHORIZATION_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: 'MINOR_UNITS' as const, materialized: false, evidence: 'src/domain/finance/FinanceActivation.ts' }),
  Object.freeze({ source: 'Salary rules / salary cap', kind: 'REVENUE' as const, meaning: 'Competition salary rules (cap, apron, exceptions) constrain what may be spent; they are not money the club holds.', classification: 'AUTHORIZATION_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: null, materialized: false, evidence: 'src/engine/salary; src/domain/world salaryRulesBySeasonId' }),
  Object.freeze({ source: 'CompetitionDistributionFact (CF9)', kind: 'REVENUE' as const, meaning: 'Prize, participation, media, solidarity, revenue-share and league distributions with amount, category, effective date, due date and source rule.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/CompetitionEconomy.ts; no competition configures a prize/media/solidarity pool, and only tests create facts' }),
  Object.freeze({ source: 'Competition runtime bundle', kind: 'REVENUE' as const, meaning: 'Shipped competition runtime content (format, rules, structure) loaded by the app.', classification: 'INSUFFICIENT_SEMANTICS' as const, canonicalTypeExists: false, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'C:/BDM_DB/phase1-competition-runtime-bundle.json — contains no monetary key at all' }),
  Object.freeze({ source: 'TicketRevenueFact + attendance', kind: 'REVENUE' as const, meaning: 'Canonical ticket-revenue fact contract (ticketsSold, attendance, grossRevenue) awaiting a producer; no ticket price policy exists anywhere.', classification: 'PHYSICAL_DRIVER_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/RevenueEngine.ts createTicketRevenueFact (test-only); no ticketPrice/gateReceipt concept in src' }),
  Object.freeze({ source: 'Facility capacity', kind: 'REVENUE' as const, meaning: 'Seating capacity of a venue (e.g. 14 804, 7 035) — a physical driver with no price attached.', classification: 'PHYSICAL_DRIVER_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: null, materialized: false, evidence: 'World DB facility.capacity: 522 populated rows; facility component CAPACITY specifications' }),
  Object.freeze({ source: 'FacilityUsageRight / team_facility_usage', kind: 'REVENUE' as const, meaning: 'Who may use which facility, for what purpose, with priority and validity — no rent, fee or price field exists.', classification: 'PHYSICAL_DRIVER_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: null, materialized: false, evidence: 'src/domain/facilities/FacilityUsageRight.ts (agreementReferenceId only); World DB team_facility_usage: 948 rows' }),
  Object.freeze({ source: 'Media audience / credibility snapshots', kind: 'REVENUE' as const, meaning: 'Per-person media reach and credibility snapshots (reach is a 0–100 soft rating, e.g. 65.0) — not money and not even an attendance count.', classification: 'INSUFFICIENT_SEMANTICS' as const, canonicalTypeExists: false, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: null, materialized: false, evidence: 'World DB media_audience_snapshot.reach: 235 rows; src has no media-money concept' }),
  Object.freeze({ source: 'Sponsor / branding records', kind: 'REVENUE' as const, meaning: 'Branding rows may name a sponsor; no contract amount, period or payer exists.', classification: 'INSUFFICIENT_SEMANTICS' as const, canonicalTypeExists: false, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'World DB team_branding.sponsor_name and competition_branding.sponsor_name: 0 rows' }),
  Object.freeze({ source: 'BudgetForecasting / FinanceAI', kind: 'REVENUE' as const, meaning: 'Forecast and advisory projections over a nominal or indexed revenue source; planning output, never an economic fact.', classification: 'FORECAST_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/BudgetForecasting.ts; src/domain/finance/FinanceAI.ts' }),

  Object.freeze({ source: 'CompetitionEconomicProfile — MATCH_OPERATIONS', kind: 'OPERATING_COST' as const, meaning: 'The non-payroll operating cost of hosting a home game, amount declared by the competition policy and timed by the real canonical Game schedule, borne by the home Organization only.', classification: 'SHIPPED_ECONOMIC_SOURCE' as const, canonicalTypeExists: true, amountAuthority: true, timingAuthority: true, shippedData: true, moneyScale: 'MINOR_UNITS' as const, materialized: true, evidence: 'src/domain/finance/CompetitionEconomicProfile.ts + EconomicSourceProvisioning.ts, shipped by src/app/game/AcbDemoEconomicPolicy.ts' }),
  Object.freeze({ source: 'OperatingCostSource (CF8)', kind: 'OPERATING_COST' as const, meaning: 'Canonical recurring non-payroll operating cost (category, cost nature, amount, period, generation policy, due policy).', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/OperatingCostEngine.ts — the accounting engine, provisioned only from an approved economic policy' }),
  Object.freeze({ source: 'World DB expense_commitment', kind: 'OPERATING_COST' as const, meaning: 'Recurring organization expense with commitment_type, expected_annual_amount, currency_code, valid_from/valid_to.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db expense_commitment: 0 rows; no repo code reads it' }),
  Object.freeze({ source: 'World DB facility_development_project.cost_amount', kind: 'OPERATING_COST' as const, meaning: 'One-off facility project cost with dates — capital expenditure, never a recurring operating cost.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db facility_development_project: 0 rows' }),
  Object.freeze({ source: 'FacilityMaintenanceNeed / FacilityMaintenanceAction', kind: 'OPERATING_COST' as const, meaning: 'Physical condition, severity and executed maintenance action; CFI6/CFI7 deliberately store no maintenanceCost/amountPaid field.', classification: 'PHYSICAL_DRIVER_ONLY' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: null, materialized: false, evidence: 'src/domain/facilities/FacilityMaintenanceAction.ts — "No monetary cost field exists anywhere here"' }),
  Object.freeze({ source: 'FacilityDevelopmentProject capital commitment', kind: 'OPERATING_COST' as const, meaning: 'A club facility project is started with an explicit caller-supplied capital commitment amount; the amount is a decision input, and the amount lives in Finance, never in Facilities.', classification: 'INSUFFICIENT_SEMANTICS' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: true, moneyScale: null, materialized: false, evidence: 'src/app/facilities/FacilityProjectCommands.ts (commitment supplied per call); src/domain/facilities/FacilityFinancialBinding.ts (binding stores no amount)' }),
  Object.freeze({ source: 'Travel / medical / scouting / administration / venue', kind: 'OPERATING_COST' as const, meaning: 'Canonical operating cost categories exist with no shipped amount or cadence for any of them.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/OperatingCostEngine.ts OPERATING_COST_CATEGORIES; no shipped data supplies amounts' }),
  Object.freeze({ source: 'Competition prize / solidarity / media-pool distribution', kind: 'REVENUE' as const, meaning: 'The other competition distribution families (prize money, solidarity, media pool, revenue share) have canonical types but no approved amounts, dates or rules.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/CompetitionEconomy.ts; no competition configures a prize/media/solidarity pool' }),
  Object.freeze({ source: 'Competition participation fee', kind: 'OPERATING_COST' as const, meaning: 'A club paying to enter a competition is routed through the operating-cost path (PARTICIPATION_FEE); no competition configures a fee.', classification: 'CANONICAL_TYPE_NO_SHIPPED_PRODUCER' as const, canonicalTypeExists: true, amountAuthority: false, timingAuthority: false, shippedData: false, moneyScale: null, materialized: false, evidence: 'src/domain/finance/CompetitionEconomy.ts createCompetitionParticipationFeeFact; no fee configured in any shipped competition' }),
])

/** Concepts that are deliberately outside BS16K even though they move money. */
export const ECONOMIC_SOURCES_EXCLUDED_FROM_BS16K: readonly { readonly source: string; readonly reason: string }[] = Object.freeze([
  Object.freeze({ source: 'CONTRACT_PAYROLL', reason: 'Already materialized by BS16I as contract expense, and OperatingCostSource rejects payroll/salary categories, so it may never be restated as a BS16K operating cost.' }),
  Object.freeze({ source: 'OPENING_ECONOMIC_STATE', reason: 'BS16H authority; a pre-career position is not recurring revenue and no shipped source exists for it.' }),
  Object.freeze({ source: 'FINANCING_AND_CAPITAL', reason: 'Acquired liquidity (loans, owner contributions, capital) is BS16L, never revenue.' }),
  Object.freeze({ source: 'DEBT_SERVICE', reason: 'BS16L/CF9 scope; no shipped debt instrument exists.' }),
])

export const MISSING_ECONOMIC_SOURCE_AUTHORITIES = [
  'TICKETING_PRICE_AUTHORITY_NOT_MODELLED',
  'MEDIA_REVENUE_AUTHORITY_NOT_MODELLED',
  'COMMERCIAL_REVENUE_AUTHORITY_NOT_MODELLED',
  'COMPETITION_PRIZE_AND_MEDIA_DISTRIBUTION_NOT_MODELLED',
  'FACILITY_OPEX_AUTHORITY_NOT_MODELLED',
  'TRAVEL_MEDICAL_SCOUTING_ADMINISTRATION_COST_AUTHORITY_NOT_MODELLED',
] as const
export type MissingEconomicSourceAuthority = (typeof MISSING_ECONOMIC_SOURCE_AUTHORITIES)[number]

export interface MissingEconomicSourceAuthorityEntry {
  readonly code: MissingEconomicSourceAuthority
  readonly kind: EconomicSourceKind
  /** The exact product decision that must be approved before Finance may create such a fact. */
  readonly requiredDecision: string
  /** The audited evidence that no shipped authority exists today. */
  readonly evidence: string
}

export const MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER: readonly MissingEconomicSourceAuthorityEntry[] = Object.freeze([
  Object.freeze({ code: 'TICKETING_PRICE_AUTHORITY_NOT_MODELLED' as const, kind: 'REVENUE' as const, requiredDecision: 'Approve a ticket price / attendance model: what a ticket costs per competition and seat category, and how attendance is determined, so gross ticket revenue can be derived from match day.', evidence: 'Arena capacity ships (World DB facility.capacity, 522 rows) but no price exists anywhere in the repository.' }),
  Object.freeze({ code: 'MEDIA_REVENUE_AUTHORITY_NOT_MODELLED' as const, kind: 'REVENUE' as const, requiredDecision: 'Approve a media rights model: which pool pays which Organizations, how much per right/period, and on what payment dates.', evidence: 'Only soft media ratings ship (media_audience_snapshot.reach), and the competition runtime bundle carries no monetary key.' }),
  Object.freeze({ code: 'COMMERCIAL_REVENUE_AUTHORITY_NOT_MODELLED' as const, kind: 'REVENUE' as const, requiredDecision: 'Approve a commercial model: who sponsors or licenses what, for which amount, over which period, and on what schedule.', evidence: 'Branding rows may name a sponsor; no contract, amount or period exists, and no sponsorship screen supplies a figure.' }),
  Object.freeze({ code: 'COMPETITION_PRIZE_AND_MEDIA_DISTRIBUTION_NOT_MODELLED' as const, kind: 'REVENUE' as const, requiredDecision: 'Approve the remaining competition distribution rules — prize money, solidarity, media pool and revenue share — with their amounts and dates per competition.', evidence: 'Competition participation distribution V1 is now modelled through a CompetitionEconomicProfile; no competition configures a prize, solidarity or media pool, and the canonical distribution type still has no shipped fact.' }),
  Object.freeze({ code: 'FACILITY_OPEX_AUTHORITY_NOT_MODELLED' as const, kind: 'OPERATING_COST' as const, requiredDecision: 'Approve a facility operating cost policy: what recurring cost a facility or component incurs, at what amount, and on what cadence.', evidence: 'Facilities store condition and maintenance actions with no cost field by design; the World DB expense tables ship empty.' }),
  Object.freeze({ code: 'TRAVEL_MEDICAL_SCOUTING_ADMINISTRATION_COST_AUTHORITY_NOT_MODELLED' as const, kind: 'OPERATING_COST' as const, requiredDecision: 'Approve the remaining non-payroll operating cost model (travel, medical, scouting, administration, venue): which costs exist, their amounts, and their timing.', evidence: 'Match operations V1 is now modelled through a CompetitionEconomicProfile; the canonical source type still ships with no amount for any other category.' }),
])

export interface EconomicSourceAuthorityReport {
  readonly candidates: number
  readonly materializableSources: readonly string[]
  readonly missingAuthorities: readonly MissingEconomicSourceAuthority[]
  readonly revenueSourceProducible: boolean
  readonly operatingCostSourceProducible: boolean
}

export function economicSourceCandidate(source: string): ShippedEconomicSourceCandidate | undefined {
  return SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.find((candidate) => candidate.source === source)
}

/** The single gate a candidate must pass before it may create a Finance fact. */
export function isMaterializableShippedEconomicSource(source: string): boolean {
  const candidate = economicSourceCandidate(source)
  return candidate?.classification === 'SHIPPED_ECONOMIC_SOURCE' && candidate.materialized
}

export function getEconomicSourceAuthorityReport(): EconomicSourceAuthorityReport {
  const materializable = SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.filter((candidate) => candidate.classification === 'SHIPPED_ECONOMIC_SOURCE' && candidate.materialized)
  return Object.freeze({
    candidates: SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.length,
    materializableSources: Object.freeze(materializable.map((candidate) => candidate.source)),
    missingAuthorities: Object.freeze(MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER.map((entry) => entry.code)),
    revenueSourceProducible: materializable.some((candidate) => candidate.kind === 'REVENUE'),
    operatingCostSourceProducible: materializable.some((candidate) => candidate.kind === 'OPERATING_COST'),
  })
}

export interface UngroundedEconomicSource {
  readonly kind: EconomicSourceKind
  readonly sourceId: string
  readonly detail: string
}

/**
 * Certification guard: an economic fact in a world that no approved economic policy or explicit source authority
 * justifies. A source is grounded when its provenance is a CompetitionEconomicProfile (an approved policy), which
 * is exactly what `provisionEconomicSources` writes and what an explicit World DB source would have to replace
 * deliberately — so a shipped world may hold no other revenue, operating cost or distribution source.
 */
export function getUngroundedEconomicSources(world: GameWorld): readonly UngroundedEconomicSource[] {
  const grounded = (provenance: { readonly kind: string }): boolean => provenance.kind === ECONOMIC_POLICY_PROVENANCE_KIND
  const ungrounded: UngroundedEconomicSource[] = []
  for (const source of Object.values(world.revenueSourcesById)) if (!grounded(source.provenance)) ungrounded.push(Object.freeze({ kind: 'REVENUE' as const, sourceId: String(source.id), detail: `Revenue source ${source.id} carries no approved economic policy provenance.` }))
  for (const source of Object.values(world.operatingCostSourcesById)) if (!grounded(source.provenance)) ungrounded.push(Object.freeze({ kind: 'OPERATING_COST' as const, sourceId: String(source.id), detail: `Operating cost source ${source.id} carries no approved economic policy provenance.` }))
  for (const fact of Object.values(world.competitionDistributionFactsById)) ungrounded.push(Object.freeze({ kind: fact.category === 'PARTICIPATION_FEE' ? 'OPERATING_COST' as const : 'REVENUE' as const, sourceId: String(fact.id), detail: `Competition economic fact ${fact.category} has no approved economic policy authority.` }))
  return Object.freeze(ungrounded)
}
