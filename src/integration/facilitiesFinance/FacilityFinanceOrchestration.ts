/**
 * CFI7 orchestration layer — the only place that combines a Facilities engine command with a real
 * Finance fact inside one atomic `GameWorld` update. Every exported command here:
 *
 *   1. validates the Facilities entity/command shape (by delegating to the real CFI1-CFI6a engine);
 *   2. validates the financial input (an explicit, caller-supplied amount/currency/date — CFI7 does
 *      not decide pricing; see the CFI7 brief's "COST INPUT" section);
 *   3. creates the Finance fact(s) (a `FinancialCommitment`, optionally an `ExpenseRecognition`
 *      ledger transaction through CF8's `OperatingCostEngine`, per the caller's choice);
 *   4. executes the Facilities operation;
 *   5. records a `FacilityFinancialBinding` connecting the two;
 *   6. returns a combined `FacilityFinanceIntegrationOutcome`.
 *
 * ATOMICITY: every command below builds its whole result against a single, growing `GameWorld`
 * value and calls `updateGameWorld` (via the underlying Facilities engine commands and the Finance
 * factories) — if ANY step throws, the function does not catch it: it propagates immediately and the
 * caller's original `world` reference is never touched, because nothing here mutates in place and no
 * partial `world` is ever returned on failure. There is no separate "commit" step that could apply
 * only part of the result: TypeScript control flow guarantees every intermediate `world` value is
 * discarded if a later step throws, since only the final returned value is ever handed back.
 *
 * IDEMPOTENCY: every generated id (binding id, commitment id, recognition id) is content-addressed
 * from the caller-supplied `idempotencyKey` (defaults to the natural key: maintenance action id /
 * project id + a role suffix), exactly like every other CF1-CF9/CFI1-CFI6a id in this repository.
 * Re-invoking a command with the same key attempts to create already-existing ids, which
 * `GameWorld`'s own duplicate-id guard (the same mechanism CFI5/CFI6/CF1-CF9 all already rely on)
 * rejects — no new idempotency ledger was introduced.
 */

import { parseGameDate, type GameDate } from '@/domain/date'
import {
  applyFacilityMaintenanceAction,
  completeFacilityDevelopmentProject,
  startFacilityDevelopmentProject,
  type FacilityDevelopmentCommandResult,
} from '@/engine/facilities'
import { createFacilityMaintenanceAction, type FacilityMaintenanceAction, type FacilityMaintenanceActionType, type FacilityMaintenanceActionOutcome } from '@/domain/facilities'
import type { FacilityDevelopmentProjectId, FacilityId, FacilityMaintenanceActionId, FacilityMaintenanceNeedId, OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  createAuthorizedOperatingCostFact,
  createFinancialCommitment,
  createExpenseRecognitionLedgerTransaction,
  createExpenseRecognitionFromCommitment,
  type FinancialSource,
} from '@/domain/finance'
import { createFacilityFinancialBinding } from '@/domain/facilities'

export interface FacilityFinanceMoneyInput {
  readonly currencyCode: string
  readonly minorUnits: number
}

/**
 * The combined outcome every CFI7 orchestration command returns. Deliberately plain, derivable data
 * (never persisted itself, per the CFI7 brief) — a future RPG/Event Engine consumer inspects this
 * shape directly rather than CFI7 emitting an event bus entry.
 */
export interface FacilityFinanceIntegrationOutcome {
  readonly facilityEntityId: FacilityId | null
  readonly facilityActionOrProjectId: FacilityMaintenanceActionId | FacilityDevelopmentProjectId
  readonly createdCommitmentIds: readonly string[]
  readonly createdTransactionIds: readonly string[]
  readonly createdBindingIds: readonly string[]
  readonly debtInstrumentIds: readonly string[]
  readonly physicalOutcome: 'MAINTENANCE_ACTION_RECORDED' | 'PROJECT_STARTED' | 'PROJECT_COMPLETED'
  readonly financialOutcome: 'FACILITY_EXPENDITURE_AUTHORIZED' | 'FACILITY_EXPENDITURE_COMMITTED' | 'FACILITY_PAYMENT_MADE'
}

export interface FacilityFinanceOrchestrationResult {
  readonly world: GameWorld
  readonly outcome: FacilityFinanceIntegrationOutcome
}

export interface LedgerAccountMapping {
  /** The account credited/offset by the expense (a PAYABLE or LIABILITY account). */
  readonly offsetAccountId: string
  /** The EXPENSE account the cost is recognized against. */
  readonly resultAccountId: string
}

/**
 * Maintenance financial flow, step "financial commitment / operating cost fact": authorizes a
 * monetary amount for an ALREADY-DECIDED `FacilityMaintenanceAction` (the action itself is created by
 * the caller through the normal CFI5 domain factory before this is invoked — CFI7 never invents a
 * maintenance action on Finance's behalf). Per the brief's explicit distinction, a
 * `FacilityMaintenanceNeed` alone is never enough to reach this function; only an authorized ACTION
 * is. Uses CF8's `OperatingCostEngine` `AuthorizedOperatingCostFact` (authority `FACILITY`, category
 * `FACILITY`) — the exact pre-existing Finance seam for this, not a new primitive.
 *
 * `recognizeImmediately: true` (the default) also creates the CF3 `ExpenseRecognition` + ledger
 * `FinancialTransaction` in the same call (requires `ledger`); `false` records only the
 * `FinancialCommitment`/`AuthorizedOperatingCostFact`, deferring recognition to a later, separate
 * Finance-side materialization — both are legitimate per the brief ("committed cost" vs "recognized
 * cost" are allowed to diverge in time).
 */
export function authorizeFacilityMaintenanceExpenditure(
  world: GameWorld,
  input: {
    readonly maintenanceActionId: FacilityMaintenanceActionId | string
    readonly organizationId: OrganizationId | string
    readonly amount: FacilityFinanceMoneyInput
    readonly financialDate: GameDate | string
    readonly recognizeImmediately?: boolean
    readonly ledger?: LedgerAccountMapping
    readonly idempotencyKey?: string
  },
): FacilityFinanceOrchestrationResult {
  const action = world.facilityMaintenanceActionsById[input.maintenanceActionId as FacilityMaintenanceActionId]
  if (action === undefined) throw new RangeError(`Unknown facility maintenance action: ${input.maintenanceActionId}`)
  if (action.completedAt === null || action.outcome === null) {
    throw new RangeError('Facility maintenance expenditure can only be authorized for a completed maintenance action; a need or in-progress action alone is never sufficient')
  }

  const key = input.idempotencyKey ?? String(action.id)
  const financialDate = parseGameDate(input.financialDate)
  const provenance: FinancialSource = { kind: 'FACILITY_MAINTENANCE_ACTION', id: String(action.id) }

  const fact = createAuthorizedOperatingCostFact({
    id: `operating-cost-fact:maintenance:${key}`,
    authority: 'FACILITY',
    sourceEntityId: String(action.id),
    organizationId: input.organizationId,
    category: 'FACILITY',
    costNature: 'OPERATING',
    amount: input.amount,
    incurredOn: financialDate,
    dueOn: financialDate,
    facilityId: String(action.facilityId),
    provenance,
  })

  const shouldRecognize = input.recognizeImmediately ?? true
  let currentWorld = updateGameWorld(world, { operatingCostFacts: [...Object.values(world.operatingCostFactsById), fact] })
  const createdTransactionIds: string[] = []
  let financialOutcome: FacilityFinanceIntegrationOutcome['financialOutcome'] = 'FACILITY_EXPENDITURE_AUTHORIZED'

  if (shouldRecognize) {
    if (input.ledger === undefined) throw new TypeError('authorizeFacilityMaintenanceExpenditure requires a ledger account mapping to recognize immediately')
    const commitment = createFinancialCommitment({
      id: `commitment:maintenance:${key}`,
      organizationId: input.organizationId,
      amount: input.amount,
      startsOn: financialDate,
      dueOn: financialDate,
      category: 'FACILITY',
      provenance,
    })
    currentWorld = updateGameWorld(currentWorld, { financialCommitments: [...Object.values(currentWorld.financialCommitmentsById), commitment] })
    const recognitionBase = createExpenseRecognitionFromCommitment(commitment, { id: `expense:maintenance:${key}`, category: 'FACILITY', amount: commitment.amount, recognizedOn: financialDate, provenance })
    const ledgerResult = createExpenseRecognitionLedgerTransaction(currentWorld, recognitionBase, { transactionId: `financial:maintenance:${key}`, offsetAccountId: input.ledger.offsetAccountId, resultAccountId: input.ledger.resultAccountId })
    currentWorld = updateGameWorld(currentWorld, {
      expenseRecognitions: [...Object.values(currentWorld.expenseRecognitionsById), ledgerResult.recognition],
      financialTransactions: [...Object.values(currentWorld.financialTransactionsById), ledgerResult.transaction],
    })
    createdTransactionIds.push(String(ledgerResult.transaction.id))
    financialOutcome = 'FACILITY_PAYMENT_MADE'
  }

  const binding = createFacilityFinancialBinding({
    id: `facility-financial-binding:maintenance:${key}`,
    sourceKind: 'FACILITY_MAINTENANCE_ACTION',
    sourceId: action.id,
    facilityId: action.facilityId,
    factKind: 'OPERATING_COST_FACT',
    factId: fact.id,
    organizationId: input.organizationId,
    createdOn: financialDate,
    role: shouldRecognize ? 'MAINTENANCE_EXPENSE_RECOGNIZED' : 'MAINTENANCE_EXPENSE_AUTHORIZED',
  })
  currentWorld = updateGameWorld(currentWorld, { facilityFinancialBindings: [...Object.values(currentWorld.facilityFinancialBindingsById), binding] })

  return {
    world: currentWorld,
    outcome: Object.freeze({
      facilityEntityId: action.facilityId,
      facilityActionOrProjectId: action.id,
      createdCommitmentIds: Object.freeze(shouldRecognize ? [`commitment:maintenance:${key}`] : []),
      createdTransactionIds: Object.freeze(createdTransactionIds),
      createdBindingIds: Object.freeze([binding.id]),
      debtInstrumentIds: Object.freeze([]),
      physicalOutcome: 'MAINTENANCE_ACTION_RECORDED',
      financialOutcome,
    }),
  }
}

/**
 * Integrated maintenance execution: creates the `FacilityMaintenanceAction` itself (via the real CFI5
 * domain factory — never a bespoke reimplementation) AND authorizes its financial consequence in one
 * atomic call. Distinguishable from `authorizeFacilityMaintenanceExpenditure` because CFI6's own
 * `startFacilityDevelopmentProject`-style precedent (pure command with no Finance coupling) must
 * remain independently reachable — a caller who only wants the physical action, with no money at all
 * (e.g. a DEFERRED need that becomes a no-cost inspection), still uses the plain CFI5
 * `createFacilityMaintenanceAction` factory directly, entirely undisturbed by this module's existence.
 */
export function executeFundedMaintenanceAction(
  world: GameWorld,
  input: {
    readonly id: FacilityMaintenanceActionId | string
    readonly needId?: FacilityMaintenanceNeedId | string | null
    readonly facilityId: FacilityId | string
    readonly componentId?: string | null
    readonly type: FacilityMaintenanceActionType
    readonly startedAt: GameDate | string
    readonly completedAt: GameDate | string
    readonly outcome: FacilityMaintenanceActionOutcome
    readonly resultingCondition?: number | null
    readonly resultingServiceability?: import('@/domain/facilities').FacilityServiceability | null
    readonly organizationId: OrganizationId | string
    readonly amount: FacilityFinanceMoneyInput
    readonly ledger: LedgerAccountMapping
    readonly idempotencyKey?: string
  },
): FacilityFinanceOrchestrationResult {
  const action = createFacilityMaintenanceAction({
    id: input.id,
    needId: input.needId ?? null,
    facilityId: input.facilityId,
    componentId: input.componentId ?? null,
    type: input.type,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcome: input.outcome,
    resultingCondition: input.resultingCondition ?? null,
    resultingServiceability: input.resultingServiceability ?? null,
  })
  const worldWithAction = updateGameWorld(world, { facilityMaintenanceActions: [...Object.values(world.facilityMaintenanceActionsById), action] })
  const applied = applyFacilityMaintenanceAction(worldWithAction, action.id)
  return authorizeFacilityMaintenanceExpenditure(applied.world, {
    maintenanceActionId: action.id,
    organizationId: input.organizationId,
    amount: input.amount,
    financialDate: input.completedAt,
    recognizeImmediately: true,
    ledger: input.ledger,
    idempotencyKey: input.idempotencyKey,
  })
}

/**
 * Capital/development financial binding, step "financial commitment": records a `FinancialCommitment`
 * for a `FacilityDevelopmentProject` WITHOUT starting it — usable before, at, or independently of
 * `startFacilityDevelopmentProject`, matching the brief's explicit "a project can start without
 * Finance" / "fully funded does not imply physically complete" requirement (physical and financial
 * progress are never coupled into one call unless the caller explicitly composes them, as
 * `executeFundedFacilityProjectStart` below does). Multiple calls with different `idempotencyKey`
 * values are how "one project, many financial facts" (several payments/commitments over its
 * lifetime) is represented — never a 1:1 `project.financialTransactionId` field.
 */
export function prepareFacilityProjectFinance(
  world: GameWorld,
  input: {
    readonly projectId: FacilityDevelopmentProjectId | string
    readonly facilityId?: FacilityId | string | null
    readonly organizationId: OrganizationId | string
    readonly amount: FacilityFinanceMoneyInput
    readonly startsOn: GameDate | string
    readonly dueOn: GameDate | string
    readonly role?: string
    readonly idempotencyKey?: string
  },
): { readonly world: GameWorld; readonly commitmentId: string; readonly bindingId: string } {
  const project = world.facilityDevelopmentProjectsById[input.projectId as FacilityDevelopmentProjectId]
  if (project === undefined) throw new RangeError(`Unknown facility development project: ${input.projectId}`)
  const key = input.idempotencyKey ?? `${String(project.id)}:${input.role ?? 'commitment'}`
  const provenance: FinancialSource = { kind: 'FACILITY_DEVELOPMENT_PROJECT', id: String(project.id) }
  const commitment = createFinancialCommitment({
    id: `commitment:project:${key}`,
    organizationId: input.organizationId,
    amount: input.amount,
    startsOn: input.startsOn,
    dueOn: input.dueOn,
    category: 'FACILITY_DEVELOPMENT',
    provenance,
  })
  const worldWithCommitment = updateGameWorld(world, { financialCommitments: [...Object.values(world.financialCommitmentsById), commitment] })
  const binding = createFacilityFinancialBinding({
    id: `facility-financial-binding:project:${key}`,
    sourceKind: 'FACILITY_DEVELOPMENT_PROJECT',
    sourceId: project.id,
    facilityId: input.facilityId ?? project.facilityId,
    factKind: 'FINANCIAL_COMMITMENT',
    factId: commitment.id,
    organizationId: input.organizationId,
    createdOn: input.startsOn,
    role: input.role ?? 'CAPITAL_COMMITMENT',
  })
  const finalWorld = updateGameWorld(worldWithCommitment, { facilityFinancialBindings: [...Object.values(worldWithCommitment.facilityFinancialBindingsById), binding] })
  return { world: finalWorld, commitmentId: commitment.id, bindingId: binding.id }
}

/**
 * Atomic composition: prepares (or reuses, if already committed under the same idempotencyKey — see
 * idempotency notes at module top) the project's capital commitment AND starts it via the real CFI6
 * `startFacilityDevelopmentProject` command, in one call. If the Finance step fails (invalid amount,
 * unknown Organization, etc.) `startFacilityDevelopmentProject` never runs, and the caller's original
 * `world` is returned untouched because the exception propagates before any Facilities mutation. If
 * the Facilities step fails (invalid transition, unknown project, ...), the exception propagates too
 * — but note the commitment was already durably created in this call's local `world` chain; because
 * nothing is returned on a thrown exception, that intermediate `world` value is simply discarded by
 * the caller (who still holds only their original, pre-call `world`), so no partially-funded,
 * non-started project is ever visible to anyone. This is the same "throw discards the whole call"
 * atomicity guarantee every command in this module relies on.
 */
export function executeFundedFacilityProjectStart(
  world: GameWorld,
  input: {
    readonly projectId: FacilityDevelopmentProjectId | string
    readonly organizationId: OrganizationId | string
    readonly amount: FacilityFinanceMoneyInput
    readonly startedAt: GameDate | string
    readonly dueOn?: GameDate | string
    readonly idempotencyKey?: string
  },
): FacilityFinanceOrchestrationResult {
  const project = world.facilityDevelopmentProjectsById[input.projectId as FacilityDevelopmentProjectId]
  if (project === undefined) throw new RangeError(`Unknown facility development project: ${input.projectId}`)
  const prepared = prepareFacilityProjectFinance(world, {
    projectId: project.id,
    facilityId: project.facilityId,
    organizationId: input.organizationId,
    amount: input.amount,
    startsOn: input.startedAt,
    dueOn: input.dueOn ?? input.startedAt,
    role: 'CAPITAL_COMMITMENT',
    idempotencyKey: input.idempotencyKey,
  })
  const started: FacilityDevelopmentCommandResult = startFacilityDevelopmentProject(prepared.world, project.id, parseGameDate(input.startedAt))
  return {
    world: started.world,
    outcome: Object.freeze({
      facilityEntityId: started.outcome.createdFacilityIds[0] ?? project.facilityId,
      facilityActionOrProjectId: project.id,
      createdCommitmentIds: Object.freeze([prepared.commitmentId]),
      createdTransactionIds: Object.freeze([]),
      createdBindingIds: Object.freeze([prepared.bindingId]),
      debtInstrumentIds: Object.freeze([]),
      physicalOutcome: 'PROJECT_STARTED',
      financialOutcome: 'FACILITY_EXPENDITURE_COMMITTED',
    }),
  }
}

/**
 * A single capital payment against a project: recognizes and posts a real expense (CF3 recognition +
 * CF1 ledger transaction) bound to the project, independent of the project's own physical status.
 * Callable any number of times per project (again: 1:N, never 1:1) — this is how "multiple payments
 * can reference the same project" is represented, and how physical COMPLETED and financial settlement
 * are kept decoupled (a project can be COMPLETED with this never having been called enough times to
 * cover its full committed amount, and this can keep being called after COMPLETED to pay down a
 * remaining payable).
 */
export function executeFacilityProjectCapitalPayment(
  world: GameWorld,
  input: {
    readonly projectId: FacilityDevelopmentProjectId | string
    readonly organizationId: OrganizationId | string
    readonly amount: FacilityFinanceMoneyInput
    readonly paidOn: GameDate | string
    readonly ledger: LedgerAccountMapping
    readonly paymentSequence: number | string
  },
): FacilityFinanceOrchestrationResult {
  const project = world.facilityDevelopmentProjectsById[input.projectId as FacilityDevelopmentProjectId]
  if (project === undefined) throw new RangeError(`Unknown facility development project: ${input.projectId}`)
  const key = `${String(project.id)}:payment:${input.paymentSequence}`
  const provenance: FinancialSource = { kind: 'FACILITY_DEVELOPMENT_PROJECT', id: String(project.id) }
  const commitment = createFinancialCommitment({
    id: `commitment:project:${key}`,
    organizationId: input.organizationId,
    amount: input.amount,
    startsOn: input.paidOn,
    dueOn: input.paidOn,
    category: 'FACILITY_DEVELOPMENT',
    provenance,
  })
  let currentWorld = updateGameWorld(world, { financialCommitments: [...Object.values(world.financialCommitmentsById), commitment] })
  const recognitionBase = createExpenseRecognitionFromCommitment(commitment, { id: `expense:project:${key}`, category: 'FACILITY_DEVELOPMENT', amount: commitment.amount, recognizedOn: input.paidOn, provenance })
  const ledgerResult = createExpenseRecognitionLedgerTransaction(currentWorld, recognitionBase, { transactionId: `financial:project:${key}`, offsetAccountId: input.ledger.offsetAccountId, resultAccountId: input.ledger.resultAccountId })
  currentWorld = updateGameWorld(currentWorld, {
    expenseRecognitions: [...Object.values(currentWorld.expenseRecognitionsById), ledgerResult.recognition],
    financialTransactions: [...Object.values(currentWorld.financialTransactionsById), ledgerResult.transaction],
  })
  const binding = createFacilityFinancialBinding({
    id: `facility-financial-binding:project:${key}`,
    sourceKind: 'FACILITY_DEVELOPMENT_PROJECT',
    sourceId: project.id,
    facilityId: project.facilityId,
    factKind: 'FINANCIAL_TRANSACTION',
    factId: ledgerResult.transaction.id,
    organizationId: input.organizationId,
    createdOn: input.paidOn,
    role: 'CAPITAL_PAYMENT',
  })
  currentWorld = updateGameWorld(currentWorld, { facilityFinancialBindings: [...Object.values(currentWorld.facilityFinancialBindingsById), binding] })
  return {
    world: currentWorld,
    outcome: Object.freeze({
      facilityEntityId: project.facilityId,
      facilityActionOrProjectId: project.id,
      createdCommitmentIds: Object.freeze([commitment.id]),
      createdTransactionIds: Object.freeze([String(ledgerResult.transaction.id)]),
      createdBindingIds: Object.freeze([binding.id]),
      debtInstrumentIds: Object.freeze([]),
      physicalOutcome: 'PROJECT_STARTED',
      financialOutcome: 'FACILITY_PAYMENT_MADE',
    }),
  }
}

/**
 * Binds an already-existing CF9 `DebtInstrument` (created and drawn entirely through
 * `@/domain/finance`'s own `DebtEngine` — CFI7 never creates, schedules or amortizes debt itself) to a
 * `FacilityDevelopmentProject`, as one funding source among potentially several. Facilities stores no
 * principal/interest/drawdown/outstanding-balance field anywhere — only this stable reference.
 */
export function bindFacilityProjectDebtFinancing(
  world: GameWorld,
  input: {
    readonly projectId: FacilityDevelopmentProjectId | string
    readonly debtInstrumentId: string
    readonly organizationId: OrganizationId | string
    readonly boundOn: GameDate | string
    readonly role?: string
  },
): { readonly world: GameWorld; readonly bindingId: string } {
  const project = world.facilityDevelopmentProjectsById[input.projectId as FacilityDevelopmentProjectId]
  if (project === undefined) throw new RangeError(`Unknown facility development project: ${input.projectId}`)
  const debt = world.debtInstrumentsById[input.debtInstrumentId]
  if (debt === undefined) throw new RangeError(`Unknown debt instrument: ${input.debtInstrumentId}`)
  const binding = createFacilityFinancialBinding({
    id: `facility-financial-binding:project-debt:${String(project.id)}:${input.debtInstrumentId}`,
    sourceKind: 'FACILITY_DEVELOPMENT_PROJECT',
    sourceId: project.id,
    facilityId: project.facilityId,
    factKind: 'DEBT_INSTRUMENT',
    factId: debt.id,
    organizationId: input.organizationId,
    createdOn: input.boundOn,
    role: input.role ?? 'DEBT_FINANCING',
  })
  const finalWorld = updateGameWorld(world, { facilityFinancialBindings: [...Object.values(world.facilityFinancialBindingsById), binding] })
  return { world: finalWorld, bindingId: binding.id }
}

/**
 * Atomic composition of `completeFacilityDevelopmentProject` — exists only so callers have a single
 * named seam for "physical completion" that is explicitly documented as NOT implying financial
 * settlement (per the brief's "physical completion vs financial settlement" rule). It is a thin
 * pass-through to the real CFI6 command; CFI7 does not gate physical completion on any funding
 * check, and does not automatically pay anything on completion.
 */
export function completeFundedFacilityDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, completedAt: GameDate | string): FacilityFinanceOrchestrationResult {
  const project = world.facilityDevelopmentProjectsById[projectId as FacilityDevelopmentProjectId]
  if (project === undefined) throw new RangeError(`Unknown facility development project: ${projectId}`)
  const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate(completedAt))
  return {
    world: result.world,
    outcome: Object.freeze({
      facilityEntityId: project.facilityId,
      facilityActionOrProjectId: project.id,
      createdCommitmentIds: Object.freeze([]),
      createdTransactionIds: Object.freeze([]),
      createdBindingIds: Object.freeze([]),
      debtInstrumentIds: Object.freeze([]),
      physicalOutcome: 'PROJECT_COMPLETED',
      financialOutcome: 'FACILITY_EXPENDITURE_COMMITTED',
    }),
  }
}
