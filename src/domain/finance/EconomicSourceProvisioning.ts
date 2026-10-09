import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, type CompetitionId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { applicableEconomicProfile, operatingCostPolicyOf, revenuePolicyOf, type CompetitionEconomicProfile, type CompetitionOperatingCostPolicy, type CompetitionRevenuePolicy } from './CompetitionEconomicProfile'
import { createOperatingCostSource, type OperatingCostSource } from './OperatingCostEngine'
import { createRevenueSource, type RevenueSource } from './RevenueEngine'
import { getFinanceFiscalYearFor } from './FinanceFoundation'
import { createMoney, type Money } from './FinancialLedger'

/**
 * BS16K-C — deterministic economic source provisioning.
 *
 * It transforms an approved `CompetitionEconomicProfile` into the existing canonical source types and nothing
 * else: a `RevenueSource` (participation distribution with explicit installments) and an `OperatingCostSource`
 * (match operations, one declared term per real home Game). The engines keep owning recognition, payables,
 * receivables and ledger postings, so there is no second revenue or operating-cost engine.
 *
 * Properties: deterministic ids derived from the profile and the Organization; idempotent (an existing source is
 * never rewritten); Organization-scoped; currency-safe (a profile currency that is not the Organization's base
 * currency is an explicit conflict and creates nothing); save-safe (both collections are persisted by Save V4);
 * and precedence-aware — an explicit shipped/World DB economic source always wins over a profile, so a profile can
 * never silently replace database economic truth. A competition with no applicable profile receives nothing:
 * there is no global fallback economy.
 */
export const ECONOMIC_POLICY_NOT_PROVISIONED = 'ECONOMIC_POLICY_NOT_PROVISIONED' as const

export const ECONOMIC_SOURCE_PROVISIONING_STATUSES = [
  'PROVISIONED',
  'ALREADY_PROVISIONED',
  'PARTIALLY_PROVISIONED',
  'ECONOMIC_POLICY_NOT_PROVISIONED',
  'ECONOMIC_POLICY_INACTIVE',
  'FINANCE_PROFILE_UNAVAILABLE',
  'CURRENCY_MISMATCH',
  'FISCAL_PERIOD_MISMATCH',
  'EXPLICIT_ECONOMIC_SOURCE_PRESERVED',
] as const
export type EconomicSourceProvisioningStatus = (typeof ECONOMIC_SOURCE_PROVISIONING_STATUSES)[number]

export interface OrganizationEconomicSourceProvisioningResult {
  readonly organizationId: OrganizationId
  readonly status: EconomicSourceProvisioningStatus
  readonly revenueSourceId: string | null
  readonly operatingCostSourceId: string | null
  readonly participationInstallments: number
  readonly participationAnnualMinorUnits: number
  readonly matchOperationsEvents: number
  readonly matchOperationsMinorUnits: number
  readonly sourcesCreated: number
  readonly reason: string | null
}

export interface CompetitionEconomicSourceProvisioningResult {
  readonly competitionId: CompetitionId
  readonly profileId: string | null
  readonly status: EconomicSourceProvisioningStatus
  readonly sourcesCreated: number
  readonly organizations: readonly OrganizationEconomicSourceProvisioningResult[]
  readonly reason: string | null
}

export interface EconomicSourceProvisioningApplication {
  readonly world: GameWorld
  readonly results: readonly CompetitionEconomicSourceProvisioningResult[]
  readonly sourcesCreated: number
  readonly competitionsWithoutPolicy: number
}

/**
 * One Organization's planned sources. Planning never touches the world, so a whole competition is provisioned
 * through a single validated world update instead of one update per Organization: the world validation a source
 * creation triggers is the expensive part, not the source itself.
 */
interface OrganizationEconomicSourcePlan {
  readonly result: OrganizationEconomicSourceProvisioningResult
  readonly revenueSource: RevenueSource | null
  readonly operatingCostSource: OperatingCostSource | null
}

function applyOrganizationEconomicSourcePlans(world: GameWorld, plans: readonly OrganizationEconomicSourcePlan[]): GameWorld {
  const revenueSources = plans.flatMap((plan) => plan.revenueSource === null ? [] : [plan.revenueSource])
  const operatingCostSources = plans.flatMap((plan) => plan.operatingCostSource === null ? [] : [plan.operatingCostSource])
  if (revenueSources.length === 0 && operatingCostSources.length === 0) return world
  return updateGameWorld(world, {
    ...(revenueSources.length === 0 ? {} : { revenueSources: [...Object.values(world.revenueSourcesById), ...revenueSources] }),
    ...(operatingCostSources.length === 0 ? {} : { operatingCostSources: [...Object.values(world.operatingCostSourcesById), ...operatingCostSources] }),
  })
}

export function economicRevenueSourceId(profile: CompetitionEconomicProfile, organizationId: OrganizationId | string): string {
  return `economic-source:participation-distribution:${profile.profileId}:${String(organizationId)}`
}

export function economicMatchOperationsSourceId(profile: CompetitionEconomicProfile, organizationId: OrganizationId | string): string {
  return `economic-source:match-operations:${profile.profileId}:${String(organizationId)}`
}

/**
 * Provisions every competition that has an applicable profile and reports every competition that does not. It
 * never touches a competition without a profile, never overwrites an existing source, and never creates money.
 */
export function provisionEconomicSources(world: GameWorld, input: { readonly profiles: readonly CompetitionEconomicProfile[]; readonly asOfDate?: GameDate | string }): EconomicSourceProvisioningApplication {
  const asOfDate = parseGameDate(input.asOfDate ?? world.currentDate)
  let current = world
  const results: CompetitionEconomicSourceProvisioningResult[] = []
  let sourcesCreated = 0
  let competitionsWithoutPolicy = 0

  for (const competition of Object.values(world.competitions).sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    const profile = applicableEconomicProfile(input.profiles, competition.id)
    if (profile === undefined) {
      competitionsWithoutPolicy += 1
      results.push(Object.freeze({ competitionId: competition.id, profileId: null, status: ECONOMIC_POLICY_NOT_PROVISIONED, sourcesCreated: 0, organizations: Object.freeze([]), reason: `No EconomicPolicyProfile applies to ${competition.id}; no revenue or operating cost source is created for it.` }))
      continue
    }
    if (profile.status !== 'ACTIVE') {
      results.push(Object.freeze({ competitionId: competition.id, profileId: profile.profileId, status: 'ECONOMIC_POLICY_INACTIVE' as const, sourcesCreated: 0, organizations: Object.freeze([]), reason: `Economic profile ${profile.profileId} is INACTIVE, so it provisions nothing.` }))
      continue
    }
    const plans = participantOrganizationIds(world, competition.participantTeamIds).map((organizationId) => planOrganizationEconomicSources(current, profile, organizationId, asOfDate))
    current = applyOrganizationEconomicSourcePlans(current, plans)
    const organizations = plans.map((plan) => plan.result)
    const competitionSources = organizations.reduce((sum, entry) => sum + entry.sourcesCreated, 0)
    sourcesCreated += competitionSources
    const reasons = organizations.map((entry) => entry.reason).filter((reason): reason is string => reason !== null)
    results.push(Object.freeze({ competitionId: competition.id, profileId: profile.profileId, status: summarizeOrganizationStatuses(organizations), sourcesCreated: competitionSources, organizations: Object.freeze(organizations), reason: reasons.length === 0 ? null : reasons.join(' ') }))
  }

  return Object.freeze({ world: current, results: Object.freeze(results), sourcesCreated, competitionsWithoutPolicy })
}

export function provisionOrganizationEconomicSources(world: GameWorld, profile: CompetitionEconomicProfile, organizationIdInput: OrganizationId | string, asOfDateInput?: GameDate | string): { readonly world: GameWorld; readonly result: OrganizationEconomicSourceProvisioningResult } {
  const plan = planOrganizationEconomicSources(world, profile, organizationIdInput, asOfDateInput)
  return { world: applyOrganizationEconomicSourcePlans(world, [plan]), result: plan.result }
}

function planOrganizationEconomicSources(world: GameWorld, profile: CompetitionEconomicProfile, organizationIdInput: OrganizationId | string, asOfDateInput?: GameDate | string): OrganizationEconomicSourcePlan {
  const organizationId = organizationIdFromString(organizationIdInput)
  const asOfDate = parseGameDate(asOfDateInput ?? world.currentDate)
  const voidPlan = (status: EconomicSourceProvisioningStatus, reason: string): OrganizationEconomicSourcePlan => ({
    revenueSource: null,
    operatingCostSource: null,
    result: Object.freeze({ organizationId, status, revenueSourceId: null, operatingCostSourceId: null, participationInstallments: 0, participationAnnualMinorUnits: 0, matchOperationsEvents: 0, matchOperationsMinorUnits: 0, sourcesCreated: 0, reason }),
  })

  const organizationProfile = world.organizationFinancialProfilesById[organizationId]
  if (organizationProfile === undefined) return voidPlan('FINANCE_PROFILE_UNAVAILABLE', `Organization ${organizationId} has no canonical finance profile, so no economic source can be attributed to it.`)
  if (organizationProfile.baseCurrencyCode !== profile.currencyCode) return voidPlan('CURRENCY_MISMATCH', `Economic profile currency ${profile.currencyCode} does not match Organization ${organizationId} base currency ${organizationProfile.baseCurrencyCode}; no FX is applied and no source is created.`)

  // Fiscal truth stays canonical: the profile's occurrences must fall inside this Organization's fiscal period.
  const fiscalYear = getFinanceFiscalYearFor(organizationProfile, asOfDate)
  const revenuePolicy = revenuePolicyOf(profile, 'COMPETITION_PARTICIPATION_DISTRIBUTION')
  const costPolicy = operatingCostPolicyOf(profile, 'MATCH_OPERATIONS')
  const outsidePeriod = revenuePolicy?.installments.find((installment) => compareGameDates(installment.recognitionOn, fiscalYear.startsOn) < 0 || compareGameDates(installment.recognitionOn, fiscalYear.endsOn) > 0)
  if (outsidePeriod !== undefined) {
    return voidPlan('FISCAL_PERIOD_MISMATCH', `Economic revenue installment ${outsidePeriod.recognitionOn} falls outside Organization ${organizationId} fiscal period ${fiscalYear.startsOn}..${fiscalYear.endsOn}; no source was created.`)
  }

  // An explicit shipped/World DB source of the same economic family is never replaced by a profile.
  const foreignRevenue = revenuePolicy === undefined ? null : foreignSourceOf('REVENUE', world, organizationId, revenuePolicy.category, profile)
  const foreignCost = costPolicy === undefined ? null : foreignSourceOf('OPERATING_COST', world, organizationId, costPolicy.category, profile)
  if (foreignRevenue !== null || foreignCost !== null) {
    return voidPlan('EXPLICIT_ECONOMIC_SOURCE_PRESERVED', `Organization ${organizationId} already declares ${foreignRevenue ?? foreignCost} from another authority, so the profile provisions nothing for it.`)
  }

  const homeGames = costPolicy === undefined ? [] : homeGamesOf(world, profile, organizationId, fiscalYear.startsOn, fiscalYear.endsOn)
  const revenueSourceId = revenuePolicy === undefined ? null : economicRevenueSourceId(profile, organizationId)
  const costSourceId = costPolicy === undefined || homeGames.length === 0 ? null : economicMatchOperationsSourceId(profile, organizationId)
  const existingRevenue = revenueSourceId === null ? undefined : world.revenueSourcesById[revenueSourceId as never]
  const existingCost = costSourceId === null ? undefined : world.operatingCostSourcesById[costSourceId as never]
  const revenueToCreate = revenuePolicy === undefined || existingRevenue !== undefined ? null : buildParticipationRevenueSource(profile, revenuePolicy, organizationId, fiscalYear.label)
  const costToCreate = costPolicy === undefined || costSourceId === null || existingCost !== undefined ? null : buildMatchOperationsSource(profile, costPolicy, organizationId, homeGames)

  const revenueSource: RevenueSource | undefined = existingRevenue ?? revenueToCreate ?? undefined
  const costSource: OperatingCostSource | undefined = existingCost ?? costToCreate ?? undefined
  const sourcesCreated = (revenueToCreate === null ? 0 : 1) + (costToCreate === null ? 0 : 1)

  const missingHomeGames = costPolicy !== undefined && homeGames.length === 0
  const status: EconomicSourceProvisioningStatus = sourcesCreated === 0
    ? (revenueSource !== undefined || costSource !== undefined ? 'ALREADY_PROVISIONED' : 'PARTIALLY_PROVISIONED')
    : revenueSource !== undefined && (costSource !== undefined || costPolicy === undefined) ? 'PROVISIONED' : 'PARTIALLY_PROVISIONED'

  return {
    revenueSource: revenueToCreate,
    operatingCostSource: costToCreate,
    result: Object.freeze({
      organizationId,
      status,
      revenueSourceId: revenueSource === undefined ? null : String(revenueSource.id),
      operatingCostSourceId: costSource === undefined ? null : String(costSource.id),
      participationInstallments: revenueSource === undefined ? 0 : revenueSource.paymentSchedule.length,
      participationAnnualMinorUnits: revenueSource === undefined ? 0 : revenueSource.amount.minorUnits,
      matchOperationsEvents: costSource === undefined ? 0 : costSource.paymentSchedule.length,
      matchOperationsMinorUnits: costSource === undefined ? 0 : costSource.paymentSchedule.reduce((sum, term) => sum + term.amount.minorUnits, 0),
      sourcesCreated,
      reason: missingHomeGames ? `Organization ${organizationId} has no home game inside its fiscal period ${fiscalYear.startsOn}..${fiscalYear.endsOn}, so no match operations source was provisioned.` : null,
    }),
  }
}

function buildParticipationRevenueSource(profile: CompetitionEconomicProfile, policy: CompetitionRevenuePolicy, organizationId: OrganizationId, fiscalYearLabel: string): RevenueSource {
  return createRevenueSource({
    id: economicRevenueSourceId(profile, organizationId),
    organizationId,
    category: policy.category,
    currencyCode: policy.currencyCode,
    amount: policy.annualAmount,
    startsOn: policy.installments[0]!.recognitionOn,
    endsOn: policy.installments[policy.installments.length - 1]!.recognitionOn,
    sourceAuthority: policy.sourceAuthority,
    generationPolicy: policy.generationPolicy,
    dueDatePolicy: policy.dueDatePolicy,
    competitionId: profile.competitionId,
    counterparty: policy.counterparty,
    paymentSchedule: policy.installments.map((installment) => ({ recognitionOn: installment.recognitionOn, dueOn: installment.dueOn, amount: installment.amount })),
    provenance: { kind: policy.provenance.kind, id: policy.provenance.id, description: `${profile.approvedPolicyLabel} — ${policy.code}, fiscal year ${fiscalYearLabel}` },
  })
}

/** One declared term per real home Game: the Game schedule is the timing authority, the policy the amount. */
function buildMatchOperationsSource(profile: CompetitionEconomicProfile, policy: CompetitionOperatingCostPolicy, organizationId: OrganizationId, homeGames: readonly { readonly id: string; readonly date: GameDate }[]): OperatingCostSource {
  const perGame: Money = createMoney(policy.perEventAmount)
  const total: Money = Object.freeze({ currencyCode: perGame.currencyCode, minorUnits: perGame.minorUnits * homeGames.length })
  return createOperatingCostSource({
    id: economicMatchOperationsSourceId(profile, organizationId),
    organizationId,
    category: policy.category,
    costNature: policy.costNature,
    currencyCode: policy.currencyCode,
    amount: total,
    startsOn: homeGames[0]!.date,
    endsOn: homeGames[homeGames.length - 1]!.date,
    sourceAuthority: policy.sourceAuthority,
    generationPolicy: policy.generationPolicy,
    dueDatePolicy: policy.dueDatePolicy,
    competitionId: profile.competitionId,
    counterparty: policy.counterparty,
    paymentSchedule: homeGames.map((game) => ({ recognitionOn: game.date, dueOn: game.date, amount: perGame })),
    provenance: { kind: policy.provenance.kind, id: policy.provenance.id, description: `${profile.approvedPolicyLabel} — ${policy.code} (${homeGames.length} home game occurrences)` },
  })
}

function homeGamesOf(world: GameWorld, profile: CompetitionEconomicProfile, organizationId: OrganizationId, startsOn: GameDate, endsOn: GameDate): readonly { readonly id: string; readonly date: GameDate }[] {
  const teamIds = new Set(Object.values(world.teams).filter((team) => String(team.organizationId) === String(organizationId)).map((team) => String(team.id)))
  return Object.values(world.games)
    .filter((game) => String(game.competitionId) === String(profile.competitionId))
    .filter((game) => profile.seasonId === null || String(game.seasonId) === String(profile.seasonId))
    .filter((game) => teamIds.has(String(game.homeTeamId)))
    .filter((game) => compareGameDates(game.date, startsOn) >= 0 && compareGameDates(game.date, endsOn) <= 0)
    .sort((left, right) => compareGameDates(left.date, right.date) || String(left.id).localeCompare(String(right.id)))
    .map((game) => Object.freeze({ id: String(game.id), date: game.date }))
}

function participantOrganizationIds(world: GameWorld, teamIds: readonly string[]): readonly OrganizationId[] {
  return [...new Set(teamIds.map((teamId) => world.teams[teamId as never]?.organizationId).filter((organizationId): organizationId is OrganizationId => organizationId !== undefined))].sort((left, right) => String(left).localeCompare(String(right)))
}

/** An existing source of the same economic family from a different authority: an explicit source always wins. */
function foreignSourceOf(kind: 'REVENUE' | 'OPERATING_COST', world: GameWorld, organizationId: OrganizationId, category: string, profile: CompetitionEconomicProfile): string | null {
  const sources = kind === 'REVENUE' ? Object.values(world.revenueSourcesById) : Object.values(world.operatingCostSourcesById)
  const foreign = sources.find((source) => String(source.organizationId) === String(organizationId) && source.category === category && source.status === 'ACTIVE' && source.provenance.kind !== profile.provenance.kind)
  return foreign === undefined ? null : `${kind} source ${foreign.id} (${foreign.provenance.kind})`
}

function summarizeOrganizationStatuses(organizations: readonly OrganizationEconomicSourceProvisioningResult[]): EconomicSourceProvisioningStatus {
  if (organizations.length === 0) return 'ECONOMIC_POLICY_NOT_PROVISIONED'
  if (organizations.every((entry) => entry.status === 'PROVISIONED')) return 'PROVISIONED'
  if (organizations.every((entry) => entry.status === 'ALREADY_PROVISIONED')) return 'ALREADY_PROVISIONED'
  if (organizations.some((entry) => entry.status === 'PROVISIONED' || entry.status === 'ALREADY_PROVISIONED' || entry.status === 'PARTIALLY_PROVISIONED')) return 'PARTIALLY_PROVISIONED'
  return organizations[0]!.status
}
