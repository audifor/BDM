/**
 * CFI7 — `FacilityFinancialBinding`: canonical Facilities-side world truth cross-referencing a
 * Facilities fact to a Finance fact.
 *
 * This file is PURE FACILITIES DOMAIN and deliberately imports nothing from `@/domain/finance`. It
 * lives here rather than in `src/integration/facilitiesFinance/` because the binding is normalized
 * `GameWorld` state: `GameWorld` must construct and validate it, and `src/domain/world` may not
 * import an integration layer sitting ABOVE Domain in the `UI -> Application -> Engine -> Domain`
 * dependency direction docs/ARCHITECTURE.md fixes. The Finance-coupled behavior (orchestration and
 * queries) stays in `src/integration/facilitiesFinance/`, the only place importing both
 * `@/domain/facilities` and `@/domain/finance`.
 *
 * `factId` is a plain `string` rather than a Finance-branded id type precisely so this Domain file
 * stays Finance-free; referential integrity against the real Finance collections is enforced at
 * validation time by `validateFacilityFinancialBindingCollection`, which receives those collections
 * structurally from `GameWorld` without importing Finance.
 *
 * Authority boundary (restated because this entity exists only to respect it):
 *   FACILITIES = "what physically exists and what is being done" (Facility, FacilityComponent,
 *     FacilityMaintenanceNeed/Action, FacilityDevelopmentProject/Phase, FacilityOperationalIncident).
 *   FINANCE = "what it costs, how it is committed, recognized, paid and financed" (FinancialCommitment,
 *     ExpenseRecognition, Payable, OperatingCostSource/Fact, DebtInstrument, FinancialBudget).
 *
 * CFI7 never introduces a parallel ledger, debt model or budget inside Facilities. Facilities gains
 * no new monetary field: no maintenanceCost/constructionCost/renovationCost/monthlyExpense/
 * loanBalance/amountPaid anywhere. The binding record below is non-monetary by construction — it
 * carries no amount, currency or status; the amount always lives in the referenced Finance fact,
 * reached through `factKind`/`factId`, never copied here. See
 * docs/autopilot/CFI7_FINANCE_INTEGRATION_CERTIFICATION.md sections 10/11 for the audit matrix.
 */

import { parseGameDate, type GameDate } from '@/domain/date'
import type {
  FacilityDevelopmentProjectId,
  FacilityId,
  FacilityMaintenanceActionId,
  OrganizationId,
} from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/**
 * The kind of Facilities fact a financial binding is attached to. Deliberately a closed, small set —
 * exactly the entities the CFI7 brief names as candidates for financial consequences (maintenance
 * actions and development projects). `FacilityMaintenanceNeed` and `FacilityOperationalIncident` are
 * intentionally NOT sourceKinds here: per the brief, a need/incident existing does not by itself mean
 * an expense was incurred — only an authorized action or an explicit financial fact does.
 */
export const FACILITY_FINANCIAL_BINDING_SOURCE_KINDS = [
  'FACILITY_MAINTENANCE_ACTION',
  'FACILITY_DEVELOPMENT_PROJECT',
] as const
export type FacilityFinancialBindingSourceKind = (typeof FACILITY_FINANCIAL_BINDING_SOURCE_KINDS)[number]

/**
 * The kind of Finance fact being referenced. A closed set matching real CF1-CF9 primitives only —
 * never an invented kind.
 */
export const FACILITY_FINANCIAL_FACT_KINDS = [
  'FINANCIAL_COMMITMENT',
  'EXPENSE_RECOGNITION',
  'FINANCIAL_TRANSACTION',
  'OPERATING_COST_SOURCE',
  'OPERATING_COST_FACT',
  'DEBT_INSTRUMENT',
] as const
export type FacilityFinancialFactKind = (typeof FACILITY_FINANCIAL_FACT_KINDS)[number]

/**
 * A single, additive, non-monetary cross-reference: "this Facilities fact has this Finance fact
 * associated with it". One project or one maintenance action can have MANY bindings (1:N, never
 * 1:1) — this is exactly how "one project, many financial facts" (initial commitment + N payments +
 * debt drawdowns + adjustments) and "multiple funding sources" (cash + loan + owner injection, etc.)
 * are represented: as multiple `FacilityFinancialBinding` records referencing the same
 * `sourceId`, each pointing at a different Finance fact. No amount, currency or status is stored
 * here — that is exactly the "no duplicate ledger state in Facilities" rule; the amount always lives
 * in the referenced Finance record, looked up through `factId`/`factKind`.
 */
export interface FacilityFinancialBinding {
  readonly id: string
  readonly sourceKind: FacilityFinancialBindingSourceKind
  readonly sourceId: FacilityMaintenanceActionId | FacilityDevelopmentProjectId
  readonly facilityId: FacilityId | null
  readonly factKind: FacilityFinancialFactKind
  readonly factId: string
  readonly organizationId: OrganizationId
  readonly createdOn: GameDate
  readonly role: string
}

export interface CreateFacilityFinancialBindingInput {
  readonly id: string
  readonly sourceKind: FacilityFinancialBindingSourceKind
  readonly sourceId: FacilityMaintenanceActionId | FacilityDevelopmentProjectId | string
  readonly facilityId?: FacilityId | string | null
  readonly factKind: FacilityFinancialFactKind
  readonly factId: string
  readonly organizationId: OrganizationId | string
  readonly createdOn: GameDate | string
  readonly role: string
}

export function createFacilityFinancialBinding(input: CreateFacilityFinancialBindingInput): FacilityFinancialBinding {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) throw new TypeError('Facility financial binding id must be non-empty')
  if (!FACILITY_FINANCIAL_BINDING_SOURCE_KINDS.includes(input.sourceKind)) throw new TypeError('Facility financial binding sourceKind is invalid')
  if (!FACILITY_FINANCIAL_FACT_KINDS.includes(input.factKind)) throw new TypeError('Facility financial binding factKind is invalid')
  if (typeof input.sourceId !== 'string' || input.sourceId.trim().length === 0) throw new TypeError('Facility financial binding sourceId must be non-empty')
  if (typeof input.factId !== 'string' || input.factId.trim().length === 0) throw new TypeError('Facility financial binding factId must be non-empty')
  if (typeof input.role !== 'string' || input.role.trim().length === 0) throw new TypeError('Facility financial binding role must be non-empty')
  return Object.freeze({
    id: input.id,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId as FacilityMaintenanceActionId | FacilityDevelopmentProjectId,
    facilityId: input.facilityId === undefined || input.facilityId === null ? null : (String(input.facilityId) as FacilityId),
    factKind: input.factKind,
    factId: input.factId,
    organizationId: String(input.organizationId) as OrganizationId,
    createdOn: parseGameDate(input.createdOn),
    role: input.role,
  })
}

export function validateFacilityFinancialBindingCollection(
  bindings: readonly FacilityFinancialBinding[],
  world: Pick<GameWorld, 'organizationsById' | 'facilitiesById' | 'facilityMaintenanceActionsById' | 'facilityDevelopmentProjectsById' | 'financialCommitmentsById' | 'expenseRecognitionsById' | 'financialTransactionsById' | 'operatingCostSourcesById' | 'operatingCostFactsById' | 'debtInstrumentsById'>,
): void {
  const seen = new Set<string>()
  for (const binding of bindings) {
    if (seen.has(binding.id)) throw new Error(`Duplicate facility financial binding ${binding.id}`)
    seen.add(binding.id)
    if (world.organizationsById[binding.organizationId] === undefined) throw new Error(`Facility financial binding ${binding.id} references an unknown Organization`)
    if (binding.facilityId !== null && world.facilitiesById[binding.facilityId] === undefined) throw new Error(`Facility financial binding ${binding.id} references an unknown Facility`)
    if (binding.sourceKind === 'FACILITY_MAINTENANCE_ACTION' && world.facilityMaintenanceActionsById[binding.sourceId as FacilityMaintenanceActionId] === undefined) {
      throw new Error(`Facility financial binding ${binding.id} references an unknown FacilityMaintenanceAction`)
    }
    if (binding.sourceKind === 'FACILITY_DEVELOPMENT_PROJECT' && world.facilityDevelopmentProjectsById[binding.sourceId as FacilityDevelopmentProjectId] === undefined) {
      throw new Error(`Facility financial binding ${binding.id} references an unknown FacilityDevelopmentProject`)
    }
    const factExists =
      (binding.factKind === 'FINANCIAL_COMMITMENT' && world.financialCommitmentsById[binding.factId as never] !== undefined) ||
      (binding.factKind === 'EXPENSE_RECOGNITION' && world.expenseRecognitionsById[binding.factId as never] !== undefined) ||
      (binding.factKind === 'FINANCIAL_TRANSACTION' && world.financialTransactionsById[binding.factId as never] !== undefined) ||
      (binding.factKind === 'OPERATING_COST_SOURCE' && world.operatingCostSourcesById[binding.factId] !== undefined) ||
      (binding.factKind === 'OPERATING_COST_FACT' && world.operatingCostFactsById[binding.factId] !== undefined) ||
      (binding.factKind === 'DEBT_INSTRUMENT' && world.debtInstrumentsById[binding.factId] !== undefined)
    if (!factExists) throw new Error(`Facility financial binding ${binding.id} references an unknown ${binding.factKind} ${binding.factId}`)
  }
}
