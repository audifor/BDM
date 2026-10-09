import { parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, type OrganizationId, type TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import type { FinancialPlanningPeriod } from './BudgetForecasting'
import type { FinancialCommitmentDecision, FinancialCommitmentLiquidity, FinancialDecisionStatus, FinancialReasonCode, FinancialReservation } from './FinancialAuthority'
import { evaluateOrganizationFinancialCommitment, reserveOrganizationFinancialCommitment } from './FinancialAuthorization'
import { getContractFinancialSchedule } from './ContractFinancialSchedule'
import { consumeFinancialReservation } from './FinancialAuthority'
import { legacyMajorUnitsToMoney, resolveOrganizationCurrency } from './FinanceCurrencyPolicy'
import { createMoney, type CurrencyCode, type Money } from './FinancialLedger'

/**
 * BS16M-A. The single gameplay-facing Finance seam.
 *
 * Gameplay services used to answer "can this club afford this salary?" from the legacy `TeamFinances`
 * payroll pools (`playerSalaryBudget` / `staffSalaryBudget`), which are planning numbers, not money.
 * They now ask this seam instead, and this seam owns no rule of its own: it resolves the gameplay
 * action to the canonical commitment category and delegates, unchanged, to
 * `evaluateOrganizationFinancialCommitment` (candidate commitment authority) which reads ledger
 * liquidity, canonical obligations, approved authorization and canonical reservations.
 *
 * It is therefore deliberately NOT a second Finance authority: no threshold, budget, cash or
 * reservation arithmetic happens here. Only two things are added on top of the canonical decision:
 * the gameplay action → canonical category mapping, and the single legacy → canonical money
 * conversion for callers that still hold legacy whole-major-unit salaries.
 *
 * Placement is Domain and not `src/app` because both `src/engine` (market, retention) and `src/app`
 * (signing services) must consume the same seam, and Engine may never depend on App.
 */
export type GameplayFinancialActionKind = 'PLAYER_SIGNING' | 'MARKET_OFFER' | 'PLAYER_RETENTION' | 'STAFF_HIRING'

/**
 * Gameplay actions never invent a category: player actions are canonical `PLAYER_SALARY`, staff
 * actions are canonical `STAFF_SALARY`, which are exactly the categories the activation authority
 * materializes as `BudgetLine`s.
 */
export const GAMEPLAY_FINANCIAL_ACTION_CATEGORY: Readonly<Record<GameplayFinancialActionKind, string>> = Object.freeze({
  PLAYER_SIGNING: 'PLAYER_SALARY',
  MARKET_OFFER: 'PLAYER_SALARY',
  PLAYER_RETENTION: 'PLAYER_SALARY',
  STAFF_HIRING: 'STAFF_SALARY',
})

/**
 * AI/consumer-understandable reading of a canonical decision. It names the binding constraint only;
 * the canonical `status` and `reasonCodes` are always carried next to it, so nothing is lost or
 * reduced to a single "over budget" verdict.
 */
export type GameplayFinancialOutcome =
  | 'CAN_AFFORD'
  | 'HAS_AUTHORIZATION_BUT_NO_LIQUIDITY'
  | 'HAS_LIQUIDITY_BUT_NO_AUTHORIZATION'
  | 'INSUFFICIENT_AUTHORIZATION_AND_LIQUIDITY'
  | 'RESERVED_CAPACITY_CONFLICT'
  | 'REQUIRES_FINANCING'
  | 'INVALID_FINANCE_STATE'

export interface GameplayFinancialAuthorizationState {
  readonly state: 'ACTIVE' | 'NOT_PROVISIONED' | 'OUT_OF_PERIOD'
  /** Signed canonical headroom for the action category, or null when authorization is not modelled. */
  readonly availableHeadroom: Money | null
}

export interface GameplayFinancialDecision {
  /** True only for the canonical `AFFORDABLE_NOW` status. */
  readonly allowed: boolean
  readonly outcome: GameplayFinancialOutcome
  readonly status: FinancialDecisionStatus
  readonly reasons: readonly FinancialReasonCode[]
  readonly action: GameplayFinancialActionKind
  readonly category: string
  readonly organizationId: OrganizationId
  /** Null only when the Organization has no canonical currency at all, so no amount can be expressed. */
  readonly currency: CurrencyCode | null
  readonly amount: Money | null
  readonly effectiveDate: GameDate
  readonly liquidity: FinancialCommitmentLiquidity | null
  readonly authorization: GameplayFinancialAuthorizationState
  readonly reservations: readonly FinancialReservation[]
  readonly fundingGap: Money | null
  /** Attribution of the asking gameplay decision. It is recorded, never an economic input. */
  readonly sourceAuthority: string
  readonly sourceEntityId: string
}

export interface GameplayFinancialDecisionInput {
  readonly organizationId: OrganizationId | string
  readonly action: GameplayFinancialActionKind
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly category?: string
  readonly effectiveDate?: GameDate | string
  readonly sourceAuthority: string
  readonly sourceEntityId: string
  readonly reservations?: readonly FinancialReservation[]
  readonly period?: FinancialPlanningPeriod
}

export interface TeamGameplayFinancialDecisionInput {
  readonly teamId: TeamId
  readonly action: GameplayFinancialActionKind
  /**
   * Legacy whole-major-unit annual amount (contract salary / `TeamFinances` pool units). It crosses
   * into canonical Money exactly once, inside this seam.
   */
  readonly legacyAnnualAmountMajorUnits?: number
  /** Canonical amount for callers that already hold canonical Money. Mutually exclusive with the legacy amount. */
  readonly amount?: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly effectiveDate?: GameDate | string
  readonly sourceAuthority: string
  readonly sourceEntityId: string
  readonly reservations?: readonly FinancialReservation[]
  readonly period?: FinancialPlanningPeriod
}

/**
 * BS16M-B1. The reservation of a binding contract belongs to the economic contract, not to the
 * gameplay action that created it: this is the single provenance authority the payroll
 * `AuthorizedEconomicEvent` already carries (`sourceAuthority = CONTRACT`, `sourceEntityId = contractId`),
 * so `contractId → reservation → payroll event → FinancialCommitment` is exact and deterministic.
 * `PLAYER_SIGNING` / `PLAYER_RETENTION` / `STAFF_HIRING` stay diagnostic action kinds only.
 */
export const CONTRACT_RESERVATION_SOURCE_AUTHORITY = 'CONTRACT'

export interface TeamGameplayContractCapacityInput {
  readonly teamId: TeamId
  readonly action: GameplayFinancialActionKind
  /** Legacy whole-major-unit annual amount of the contract; crossed into canonical Money exactly once. */
  readonly legacyAnnualAmountMajorUnits: number
  /** Final canonical contract id: player `ContractId` or `StaffContractId`, exactly as the payroll event uses it. */
  readonly contractId: string
  readonly effectiveDate?: GameDate | string
  readonly reservations?: readonly FinancialReservation[]
}

export interface TeamGameplayContractCapacityResult {
  /** True only when canonical Finance allowed the binding and its bridge exists in the returned collection. */
  readonly allowed: boolean
  readonly decision: GameplayFinancialDecision
  /** The bridge reservation of this exact contract: `CONSUMED` for the world the caller publishes. */
  readonly reservation: FinancialReservation | null
  /** Canonical reservation collection to publish with the binding mutation: the bridge is `CONSUMED`, never `OPEN`. */
  readonly reservations: readonly FinancialReservation[]
}

/**
 * Canonical status → gameplay/AI outcome. Precedence is explicit so two different canonical
 * situations can never collapse into one label.
 */
export function gameplayFinancialOutcomeFor(decision: FinancialCommitmentDecision): GameplayFinancialOutcome {
  switch (decision.status) {
    case 'AFFORDABLE_NOW':
      return 'CAN_AFFORD'
    case 'REQUIRES_FINANCING':
      return 'REQUIRES_FINANCING'
    case 'CURRENCY_MISMATCH':
    case 'FINANCE_PROFILE_UNAVAILABLE':
      return 'INVALID_FINANCE_STATE'
    case 'RESERVED_CAPACITY_CONFLICT':
      return 'RESERVED_CAPACITY_CONFLICT'
    case 'INSUFFICIENT_LIQUIDITY':
      return 'HAS_AUTHORIZATION_BUT_NO_LIQUIDITY'
    case 'INSUFFICIENT_AUTHORIZED_HEADROOM': {
      const capacity = decision.liquidity.availableCapacity
      if (capacity === null) return 'REQUIRES_FINANCING'
      return decision.amount.minorUnits <= capacity.minorUnits
        ? 'HAS_LIQUIDITY_BUT_NO_AUTHORIZATION'
        : 'INSUFFICIENT_AUTHORIZATION_AND_LIQUIDITY'
    }
  }
}

/**
 * Compact canonical evidence for downstream consumers (feasibility, offer intelligence, AI). It keeps
 * the canonical status/outcome/reasons visible where a product-facing label such as `OVER_BUDGET` is
 * still required by an existing contract.
 */
export interface GameplayFinancialEvidence {
  readonly allowed: boolean
  readonly outcome: GameplayFinancialOutcome
  readonly status: FinancialDecisionStatus
  readonly reasons: readonly FinancialReasonCode[]
}

export function gameplayFinancialEvidence(decision: GameplayFinancialDecision): GameplayFinancialEvidence {
  return Object.freeze({ allowed: decision.allowed, outcome: decision.outcome, status: decision.status, reasons: decision.reasons })
}

/**
 * Truthful reason text for a blocked gameplay decision: the canonical status plus the canonical
 * reason codes. A blocked consumer never has to invent a budget verdict.
 */
export function gameplayFinancialBlockReason(decision: GameplayFinancialDecision): string {
  return `${decision.status}:${decision.reasons.join('|')}`
}

/**
 * Canonical organization-scoped decision for one gameplay action. `reservations` is only forwarded
 * when a caller already resolved them; otherwise the canonical reservations are read exactly as
 * `evaluateOrganizationFinancialCommitment` reads them, so gameplay services never subtract reserved
 * capacity themselves.
 */
export function evaluateGameplayFinancialDecision(world: GameWorld, input: GameplayFinancialDecisionInput): GameplayFinancialDecision {
  const category = input.category ?? GAMEPLAY_FINANCIAL_ACTION_CATEGORY[input.action]
  const decision = evaluateOrganizationFinancialCommitment(world, {
    organizationId: input.organizationId,
    currency: input.amount.currencyCode,
    amount: input.amount,
    category,
    ...(input.effectiveDate === undefined ? {} : { asOfDate: input.effectiveDate }),
    ...(input.reservations === undefined ? {} : { reservations: input.reservations }),
    ...(input.period === undefined ? {} : { period: input.period }),
  })
  return freezeDecision(world, decision, input, category)
}

/**
 * Team-addressed entry point for gameplay services that only know a `TeamId` and hold legacy
 * whole-major-unit salaries. The Organization boundary is resolved here, so every consumer asks the
 * same question about the same canonical Organization.
 */
export function evaluateTeamGameplayFinancialDecision(world: GameWorld, input: TeamGameplayFinancialDecisionInput): GameplayFinancialDecision {
  const team = world.teams[input.teamId]
  if (team === undefined) throw new RangeError(`Gameplay finance decision needs a known Team (${input.teamId})`)
  const hasLegacy = input.legacyAnnualAmountMajorUnits !== undefined
  const hasCanonical = input.amount !== undefined
  if (hasLegacy === hasCanonical) throw new TypeError('Gameplay finance decision needs exactly one amount')
  const organizationId = organizationIdFromString(team.organizationId)
  const category = GAMEPLAY_FINANCIAL_ACTION_CATEGORY[input.action]
  const currencyCode = resolveGameplayFinanceCurrencyCode(world, organizationId)
  if (currencyCode === null) return unavailableCurrencyDecision(world, input, organizationId, category)
  const amount = hasCanonical
    ? createMoney(input.amount!)
    : legacyMajorUnitsToMoney(input.legacyAnnualAmountMajorUnits!, currencyCode)
  return evaluateGameplayFinancialDecision(world, {
    organizationId,
    action: input.action,
    amount,
    sourceAuthority: input.sourceAuthority,
    sourceEntityId: input.sourceEntityId,
    ...(input.effectiveDate === undefined ? {} : { effectiveDate: input.effectiveDate }),
    ...(input.reservations === undefined ? {} : { reservations: input.reservations }),
    ...(input.period === undefined ? {} : { period: input.period }),
  })
}

/**
 * BS16M-B1C thin binding helper. A gameplay action that creates a contract must both re-evaluate
 * canonical Finance against the current world *and* reserve the exact evaluated amount, so several
 * sequential binding actions can never spend the same authorized capacity. It owns no rule of its
 * own: it resolves the Team's Organization and currency exactly as the preview seam does, maps the
 * action onto the canonical category, and delegates evaluate → reserve to
 * `reserveOrganizationFinancialCommitment` (which creates a reservation only for `AFFORDABLE_NOW`).
 *
 * The reservation is an **atomic bridge**, never a published long-lived hold: canonical Finance
 * already derives salary commitment from `ContractFinancialSchedule` the moment the contract exists,
 * so keeping the bridge OPEN after binding would count the same obligation twice. The returned
 * `reservations` collection therefore already carries the bridge as `CONSUMED`, and the caller
 * publishes it in the *same* `updateGameWorld` transition that creates the contract. A blocked or
 * failed binding returns the original world, so no OPEN bridge can escape a transaction and no
 * contract can exist without the capacity authority that follows it.
 */
export function bindTeamContractCapacity(world: GameWorld, input: TeamGameplayContractCapacityInput): TeamGameplayContractCapacityResult {
  const team = world.teams[input.teamId]
  if (team === undefined) throw new RangeError(`Gameplay contract capacity binding needs a known Team (${input.teamId})`)
  const organizationId = organizationIdFromString(team.organizationId)
  const category = GAMEPLAY_FINANCIAL_ACTION_CATEGORY[input.action]
  const currencyCode = resolveGameplayFinanceCurrencyCode(world, organizationId)
  if (currencyCode === null) {
    return Object.freeze({
      allowed: false,
      decision: unavailableCurrencyDecision(world, { action: input.action, effectiveDate: input.effectiveDate, sourceAuthority: CONTRACT_RESERVATION_SOURCE_AUTHORITY, sourceEntityId: input.contractId }, organizationId, category),
      reservation: null,
      reservations: Object.freeze([...(input.reservations ?? Object.values(world.financialReservationsById))]),
    })
  }
  const amount = legacyMajorUnitsToMoney(input.legacyAnnualAmountMajorUnits, currencyCode)
  const reserved = reserveOrganizationFinancialCommitment(world, {
    organizationId,
    currency: currencyCode,
    amount,
    category,
    ...(input.effectiveDate === undefined ? {} : { asOfDate: input.effectiveDate }),
    ...(input.reservations === undefined ? {} : { reservations: input.reservations }),
    sourceAuthority: CONTRACT_RESERVATION_SOURCE_AUTHORITY,
    sourceEntityId: input.contractId,
    createdOn: input.effectiveDate ?? world.currentDate,
  })
  const decisionInput: GameplayFinancialDecisionInput = {
    organizationId,
    action: input.action,
    amount,
    sourceAuthority: CONTRACT_RESERVATION_SOURCE_AUTHORITY,
    sourceEntityId: input.contractId,
    ...(input.effectiveDate === undefined ? {} : { effectiveDate: input.effectiveDate }),
    ...(input.reservations === undefined ? {} : { reservations: input.reservations }),
  }
  const bridge = reserved.reservation !== null && reserved.reservation.status === 'OPEN' ? consumeFinancialReservation(reserved.reservation) : reserved.reservation
  const handedOff = reserved.reservation !== null && reserved.reservation.status === 'OPEN'
    ? reserved.reservations.map((reservation) => reservation === reserved.reservation ? bridge! : reservation)
    : reserved.reservations
  return Object.freeze({
    allowed: reserved.outcome !== 'REJECTED' && reserved.decision.status === 'AFFORDABLE_NOW',
    decision: freezeDecision(world, reserved.decision, decisionInput, category),
    reservation: bridge,
    reservations: Object.freeze([...handedOff]),
  })
}

/**
 * BS16M-B1C capacity-authority proof. The published world may only carry the bridge as `CONSUMED`
 * when the canonical contract-derived authority already sees the contract's obligation, i.e. when the
 * contractual schedule that `knownCommitments` reads derives at least one GUARANTEED entry for it.
 * A binding site calls this on the world it is about to publish and returns the original world when
 * it is false, so capacity is never released without an authority that owns it.
 *
 * It deliberately does not require the entry to fall inside the current authorization period:
 * a contract that starts next season is excluded from the current period by `FinancialAuthority`
 * itself, and that canonical period semantics is preserved rather than overridden here.
 */
export function contractOwnsCapacityAuthority(world: GameWorld, input: { readonly contractId: string; readonly organizationId: OrganizationId | string; readonly currencyCode?: string }): boolean {
  const organizationId = organizationIdFromString(input.organizationId)
  const currencyCode = input.currencyCode ?? resolveGameplayFinanceCurrencyCode(world, organizationId)
  if (currencyCode === null) return false
  return getContractFinancialSchedule(world, { organizationId, contractId: input.contractId, currencyCode, includeConditional: true })
    .some((entry) => entry.compensationStatus === 'GUARANTEED')
}

/**
 * Persisted canonical currency wins, exactly as the activation authority decides it: an Organization
 * whose profile exists keeps its currency even when a policy would derive a different one, and an
 * Organization with no profile resolves its currency from the currency policy. Null means Finance
 * cannot express any amount for this Organization at all — a canonical blocker, never a legacy
 * fallback.
 */
function resolveGameplayFinanceCurrencyCode(world: GameWorld, organizationId: OrganizationId): string | null {
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile !== undefined) return String(profile.baseCurrencyCode)
  const resolution = resolveOrganizationCurrency(world, organizationId)
  return resolution.status === 'RESOLVED' ? String(resolution.currencyCode) : null
}

function freezeDecision(world: GameWorld, decision: FinancialCommitmentDecision, input: GameplayFinancialDecisionInput, category: string): GameplayFinancialDecision {
  return Object.freeze({
    allowed: decision.status === 'AFFORDABLE_NOW',
    outcome: gameplayFinancialOutcomeFor(decision),
    status: decision.status,
    reasons: Object.freeze([...decision.reasonCodes]),
    action: input.action,
    category,
    organizationId: decision.organizationId,
    currency: decision.currency,
    amount: decision.amount,
    effectiveDate: parseGameDate(input.effectiveDate ?? world.currentDate),
    liquidity: decision.liquidity,
    authorization: authorizationStateOf(decision),
    reservations: Object.freeze([...decision.reservationState]),
    fundingGap: decision.liquidity.fundingGap,
    sourceAuthority: input.sourceAuthority,
    sourceEntityId: input.sourceEntityId,
  })
}

function authorizationStateOf(decision: FinancialCommitmentDecision): GameplayFinancialAuthorizationState {
  return Object.freeze({
    state: decision.availableAuthorizedHeadroom !== null
      ? 'ACTIVE'
      : decision.reasonCodes.includes('AUTHORIZATION_OUT_OF_PERIOD') ? 'OUT_OF_PERIOD' : 'NOT_PROVISIONED',
    availableHeadroom: decision.availableAuthorizedHeadroom,
  })
}

function unavailableCurrencyDecision(world: GameWorld, input: Pick<TeamGameplayFinancialDecisionInput, 'action' | 'effectiveDate' | 'sourceAuthority' | 'sourceEntityId'>, organizationId: OrganizationId, category: string): GameplayFinancialDecision {
  return Object.freeze({
    allowed: false,
    outcome: 'INVALID_FINANCE_STATE' as const,
    status: 'FINANCE_PROFILE_UNAVAILABLE' as const,
    reasons: Object.freeze(['FINANCE_PROFILE_UNAVAILABLE'] as const),
    action: input.action,
    category,
    organizationId,
    currency: null,
    amount: null,
    effectiveDate: parseGameDate(input.effectiveDate ?? world.currentDate),
    liquidity: null,
    authorization: Object.freeze({ state: 'NOT_PROVISIONED' as const, availableHeadroom: null }),
    reservations: Object.freeze([]),
    fundingGap: null,
    sourceAuthority: input.sourceAuthority,
    sourceEntityId: input.sourceEntityId,
  })
}
