/**
 * BS17E-A — Facilities maintenance/repair economic records.
 *
 * One append-only world collection (`facilityEconomyRecordsById`) carries four immutable record kinds:
 *
 *   COST_CATALOG_ENTRY  typed, versioned reference-cost contract (SIM-02). The repository ships ZERO
 *                       entries: no price, unit, formula or calibration is approved yet.
 *   PROVIDER            a counterparty identity. A documented entity or an explicitly labeled synthetic
 *                       one (SIM-05). The repository generates no providers.
 *   OFFER               an issued cost offer (SIM-03): stable identity, scope, origin, evidence, amount,
 *                       currency, explicit validity, version. Never recalculated by Save/Calendar.
 *   OPERATION_EVENT     the event-sourced history of one maintenance/repair operation. The lifecycle is
 *                       DERIVED from these events; there is no second mutable state machine.
 *
 * Authority boundary: this domain is Finance-free and Governance-free on purpose (same discipline as
 * `FacilityFinancialBinding`). An offer's quoted amount is cost EVIDENCE, not a ledger fact: balances,
 * reservations, commitments, recognition, payables and settlement belong to Finance and are only
 * REFERENCED here by id. Governance decisions are referenced by id as well.
 */

import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'

export const FACILITY_MAINTENANCE_INTERVENTION_TYPES = ['ROUTINE_MAINTENANCE', 'PREVENTIVE_MAINTENANCE', 'REPAIR'] as const
export type FacilityMaintenanceInterventionType = (typeof FACILITY_MAINTENANCE_INTERVENTION_TYPES)[number]

/**
 * BS17E-B capital interventions: improvements that change the physical asset (renovation to a promised condition,
 * capitalizable replacement of a component, expansion with a new component). They are CAPEX candidates by nature and
 * scope; mixed work is not representable (it needs an accredited breakdown and no source offers one).
 */
export const FACILITY_CAPITAL_INTERVENTION_TYPES = ['CAPITAL_RENOVATION', 'CAPITAL_REPLACEMENT', 'CAPITAL_EXPANSION'] as const
export type FacilityCapitalInterventionType = (typeof FACILITY_CAPITAL_INTERVENTION_TYPES)[number]
/**
 * BS17E-C recurring services: a recurring expense exists only because an explicit contract does. The conservation service is a
 * periodic maintenance visit that physically restores the facility; it is never charged merely for owning a facility.
 */
export const FACILITY_SERVICE_INTERVENTION_TYPES = ['SERVICE_CONSERVATION'] as const
export type FacilityServiceInterventionType = (typeof FACILITY_SERVICE_INTERVENTION_TYPES)[number]
export type FacilityOperationInterventionType = FacilityMaintenanceInterventionType | FacilityCapitalInterventionType | FacilityServiceInterventionType
const FACILITY_ALL_INTERVENTION_TYPES = [...FACILITY_MAINTENANCE_INTERVENTION_TYPES, ...FACILITY_CAPITAL_INTERVENTION_TYPES, ...FACILITY_SERVICE_INTERVENTION_TYPES] as const

/**
 * OPEX candidates approved by Economic Gameplay V1 for BS17E-A. A capitalizable improvement, a mixed work
 * or an integral replacement has NO classification here: it stays pending BS17E-B or a compatible source.
 */
export const FACILITY_MAINTENANCE_COST_CLASSIFICATIONS = ['OPEX_ROUTINE_MAINTENANCE', 'OPEX_RESTORATIVE_REPAIR', 'OPEX_MINOR_REPLACEMENT'] as const
export type FacilityMaintenanceCostClassification = (typeof FACILITY_MAINTENANCE_COST_CLASSIFICATIONS)[number]

const CLASSIFICATIONS_BY_INTERVENTION: Readonly<Record<FacilityMaintenanceInterventionType, readonly FacilityMaintenanceCostClassification[]>> = {
  ROUTINE_MAINTENANCE: ['OPEX_ROUTINE_MAINTENANCE'],
  PREVENTIVE_MAINTENANCE: ['OPEX_ROUTINE_MAINTENANCE'],
  REPAIR: ['OPEX_RESTORATIVE_REPAIR', 'OPEX_MINOR_REPLACEMENT'],
}

export const FACILITY_COST_SOURCE_KINDS = ['DOCUMENTED_CONTRACT', 'ACCREDITED_OFFER', 'WORLD_ECONOMIC_SOURCE', 'SIMULATED_MODEL'] as const
export type FacilityCostSourceKind = (typeof FACILITY_COST_SOURCE_KINDS)[number]

export const FACILITY_PROVIDER_IDENTITY_KINDS = ['DOCUMENTED_ENTITY', 'SYNTHETIC_SIMULATED'] as const
export type FacilityProviderIdentityKind = (typeof FACILITY_PROVIDER_IDENTITY_KINDS)[number]

export const FACILITY_CAPITAL_COST_CLASSIFICATIONS = ['CAPEX_RENOVATION', 'CAPEX_REPLACEMENT', 'CAPEX_EXPANSION'] as const
export type FacilityCapitalCostClassification = (typeof FACILITY_CAPITAL_COST_CLASSIFICATIONS)[number]
const CAPITAL_CLASSIFICATION_BY_INTERVENTION: Readonly<Record<FacilityCapitalInterventionType, FacilityCapitalCostClassification>> = { CAPITAL_RENOVATION: 'CAPEX_RENOVATION', CAPITAL_REPLACEMENT: 'CAPEX_REPLACEMENT', CAPITAL_EXPANSION: 'CAPEX_EXPANSION' }

export const FACILITY_OPERATION_EVENT_KINDS = [
  'PROPOSAL_CREATED',
  'OFFER_SELECTED',
  'APPROVAL_REQUESTED',
  'FUNDING_BLOCKED',
  'FUNDS_RESERVED',
  'CONTRACT_ACCEPTED',
  'WORK_STARTED',
  'WORK_COMPLETED',
  'COST_FACT_AUTHORIZED',
  'CANCELLATION_REQUESTED',
  'CANCELLED',
  'SERVICE_PERIOD_PROCESSED',
  'SERVICE_PERIOD_SKIPPED',
  'SERVICE_TERMINATION_NOTICED',
  'SERVICE_ENDED',
] as const
export type FacilityOperationEventKind = (typeof FACILITY_OPERATION_EVENT_KINDS)[number]

export interface FacilityEconomyMoney {
  readonly currencyCode: string
  readonly minorUnits: number
}

export interface FacilityCostCatalogEntry {
  readonly recordKind: 'COST_CATALOG_ENTRY'
  readonly id: string
  readonly interventionType: FacilityOperationInterventionType
  readonly physicalUnit: string
  readonly componentType: string | null
  readonly market: string
  readonly currencyCode: string
  readonly unitAmountMinorUnits: number
  readonly effectiveOn: GameDate
  readonly validUntil: GameDate | null
  readonly sourceKind: 'DOCUMENTED' | 'SIMULATED_MODEL'
  readonly sourceId: string
  readonly version: string
  /** Required for SIMULATED_MODEL: the authorized model and calibration evidence. Null for documented sources. */
  readonly calibration: { readonly modelId: string; readonly evidenceId: string; readonly authorizedBy: string } | null
}

export interface FacilityProvider {
  readonly recordKind: 'PROVIDER'
  readonly id: string
  readonly displayName: string
  readonly identityKind: FacilityProviderIdentityKind
  readonly market: string
  readonly provenance: { readonly kind: string; readonly id: string }
  readonly registeredOn: GameDate
}

export interface FacilityOfferTerms {
  /** Days between recognition and the payable due date. Null means the source gives none: contracting is blocked, never defaulted. */
  readonly paymentDueDays: number | null
  /** Source-provided execution window. Null means unknown; Facilities never invents a duration. */
  readonly executionDays: number | null
  /** The physical result the contract promises, as an absolute component condition (0-100). Null when the source states none. */
  readonly resultingCondition: number | null
}

export interface FacilityMaintenanceOffer {
  readonly recordKind: 'OFFER'
  readonly id: string
  readonly version: number
  readonly organizationId: string
  readonly facilityId: string
  readonly needId: string
  readonly componentId: string | null
  readonly interventionType: FacilityMaintenanceInterventionType
  readonly classification: FacilityMaintenanceCostClassification
  readonly providerId: string
  readonly sourceKind: FacilityCostSourceKind
  readonly evidence: { readonly sourceId: string; readonly catalogEntryId: string | null; readonly modelVersion: string | null }
  readonly amount: FacilityEconomyMoney
  readonly market: string
  readonly issuedOn: GameDate
  readonly validFrom: GameDate
  readonly validUntil: GameDate
  readonly terms: FacilityOfferTerms
}

/** One contractual payment milestone: a share (permille) of the price that Finance recognizes when the trigger is reached. */
export interface FacilityCapitalTranche {
  readonly label: string
  readonly permille: number
  readonly trigger: 'WORK_STARTED' | 'WORK_ACCEPTED'
}

export interface FacilityCapitalOffer {
  readonly recordKind: 'CAPITAL_OFFER'
  readonly id: string
  readonly version: number
  readonly organizationId: string
  readonly facilityId: string
  readonly projectId: string
  readonly componentId: string | null
  readonly interventionType: FacilityCapitalInterventionType
  readonly classification: FacilityCapitalCostClassification
  readonly providerId: string
  readonly sourceKind: FacilityCostSourceKind
  readonly evidence: { readonly sourceId: string; readonly catalogEntryId: string | null; readonly modelVersion: string | null }
  readonly amount: FacilityEconomyMoney
  readonly market: string
  readonly issuedOn: GameDate
  readonly validFrom: GameDate
  readonly validUntil: GameDate
  readonly paymentDueDays: number | null
  readonly executionDays: number | null
  /** The physical result the contract promises: the component condition after renovation, or the new component condition. */
  readonly promisedCondition: number | null
  readonly tranches: readonly FacilityCapitalTranche[]
}

/** A recurring-service offer: the contract terms the manager signs. Immutable like every issued offer; its terms ARE the contract. */
export interface FacilityServiceOffer {
  readonly recordKind: 'SERVICE_OFFER'
  readonly id: string
  readonly version: number
  readonly organizationId: string
  readonly facilityId: string
  readonly interventionType: FacilityServiceInterventionType
  readonly providerId: string
  readonly sourceKind: FacilityCostSourceKind
  readonly evidence: { readonly sourceId: string; readonly catalogEntryId: string | null; readonly modelVersion: string | null }
  /** The fee for one service period. Currency and amount are fixed for the whole term. */
  readonly amountPerPeriod: FacilityEconomyMoney
  readonly market: string
  readonly issuedOn: GameDate
  readonly validFrom: GameDate
  readonly validUntil: GameDate
  readonly periodDays: number
  readonly termPeriods: number
  /** Days of notice a termination needs; the contract keeps running (and billing) until the notice elapses. */
  readonly noticeDays: number
  readonly paymentDueDays: number
  /** The physical effect of one service period: condition points restored on the most worn serviceable component. */
  readonly restorationPoints: number
}

export interface FacilityOperationEvent {
  readonly recordKind: 'OPERATION_EVENT'
  readonly id: string
  readonly operationId: string
  readonly sequence: number
  readonly kind: FacilityOperationEventKind
  readonly effectiveOn: GameDate
  readonly actor: { readonly kind: string; readonly id: string } | null
  readonly organizationId: string | null
  readonly facilityId: string | null
  readonly needId: string | null
  readonly projectId: string | null
  readonly interventionType: FacilityOperationInterventionType | null
  readonly offerId: string | null
  readonly decisionId: string | null
  readonly reservationId: string | null
  readonly costFactId: string | null
  /** BS17E-B: the Finance expense recognition produced by a capital milestone (the tranche economic event). */
  readonly recognitionId: string | null
  readonly actionId: string | null
  /** BS17E-C: the date a termination notice takes effect. */
  readonly endsOn: GameDate | null
  readonly reasonCode: string | null
}

export type FacilityEconomyRecord = FacilityCostCatalogEntry | FacilityProvider | FacilityMaintenanceOffer | FacilityCapitalOffer | FacilityServiceOffer | FacilityOperationEvent

const CURRENCY = /^[A-Z]{3}$/

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value
}
function nullableText(value: unknown, label: string): string | null {
  return value === undefined || value === null ? null : text(value, label)
}
function positiveInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`)
  return value
}
function nullableNonNegativeInt(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be null or a non-negative integer`)
  return value
}
function currency(value: unknown, label: string): string {
  if (typeof value !== 'string' || !CURRENCY.test(value)) throw new RangeError(`${label} must be a three-letter uppercase currency code`)
  return value
}
function oneOf<T extends string>(list: readonly T[], value: unknown, label: string): T {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) throw new TypeError(`${label} is invalid: ${String(value)}`)
  return value as T
}

export interface CreateFacilityCostCatalogEntryInput {
  readonly id: string
  readonly interventionType: FacilityOperationInterventionType
  readonly physicalUnit: string
  readonly componentType?: string | null
  readonly market: string
  readonly currencyCode: string
  readonly unitAmountMinorUnits: number
  readonly effectiveOn: GameDate | string
  readonly validUntil?: GameDate | string | null
  readonly sourceKind: 'DOCUMENTED' | 'SIMULATED_MODEL'
  readonly sourceId: string
  readonly version: string
  readonly calibration?: { readonly modelId: string; readonly evidenceId: string; readonly authorizedBy: string } | null
}

export function createFacilityCostCatalogEntry(input: CreateFacilityCostCatalogEntryInput): FacilityCostCatalogEntry {
  const sourceKind = oneOf(['DOCUMENTED', 'SIMULATED_MODEL'] as const, input.sourceKind, 'Facility cost catalog sourceKind')
  const calibration = input.calibration === undefined || input.calibration === null ? null : Object.freeze({
    modelId: text(input.calibration.modelId, 'Facility cost calibration modelId'),
    evidenceId: text(input.calibration.evidenceId, 'Facility cost calibration evidenceId'),
    authorizedBy: text(input.calibration.authorizedBy, 'Facility cost calibration authorizedBy'),
  })
  if (sourceKind === 'SIMULATED_MODEL' && calibration === null) throw new RangeError('A simulated Facility cost catalog entry requires authorized calibration evidence')
  if (sourceKind === 'DOCUMENTED' && calibration !== null) throw new RangeError('A documented Facility cost catalog entry cannot carry model calibration')
  const effectiveOn = parseGameDate(input.effectiveOn)
  const validUntil = input.validUntil === undefined || input.validUntil === null ? null : parseGameDate(input.validUntil)
  if (validUntil !== null && compareGameDates(validUntil, effectiveOn) < 0) throw new RangeError('Facility cost catalog validUntil cannot precede effectiveOn')
  return Object.freeze({
    recordKind: 'COST_CATALOG_ENTRY' as const,
    id: text(input.id, 'Facility cost catalog id'),
    interventionType: oneOf(FACILITY_ALL_INTERVENTION_TYPES, input.interventionType, 'Facility cost catalog interventionType'),
    physicalUnit: text(input.physicalUnit, 'Facility cost catalog physicalUnit'),
    componentType: nullableText(input.componentType, 'Facility cost catalog componentType'),
    market: text(input.market, 'Facility cost catalog market'),
    currencyCode: currency(input.currencyCode, 'Facility cost catalog currency'),
    unitAmountMinorUnits: positiveInt(input.unitAmountMinorUnits, 'Facility cost catalog unitAmountMinorUnits'),
    effectiveOn,
    validUntil,
    sourceKind,
    sourceId: text(input.sourceId, 'Facility cost catalog sourceId'),
    version: text(input.version, 'Facility cost catalog version'),
    calibration,
  })
}

export interface CreateFacilityProviderInput {
  readonly id: string
  readonly displayName: string
  readonly identityKind: FacilityProviderIdentityKind
  readonly market: string
  readonly provenance: { readonly kind: string; readonly id: string }
  readonly registeredOn: GameDate | string
}

export function createFacilityProvider(input: CreateFacilityProviderInput): FacilityProvider {
  const identityKind = oneOf(FACILITY_PROVIDER_IDENTITY_KINDS, input.identityKind, 'Facility provider identityKind')
  const displayName = text(input.displayName, 'Facility provider displayName')
  // A synthetic counterparty must never read as a real company: the label is part of the identity.
  if (identityKind === 'SYNTHETIC_SIMULATED' && !/\(simulated\)$/i.test(displayName.trim())) throw new RangeError('A synthetic Facility provider displayName must end with "(simulated)"')
  return Object.freeze({
    recordKind: 'PROVIDER' as const,
    id: text(input.id, 'Facility provider id'),
    displayName,
    identityKind,
    market: text(input.market, 'Facility provider market'),
    provenance: Object.freeze({ kind: text(input.provenance.kind, 'Facility provider provenance kind'), id: text(input.provenance.id, 'Facility provider provenance id') }),
    registeredOn: parseGameDate(input.registeredOn),
  })
}

export interface CreateFacilityMaintenanceOfferInput {
  readonly id: string
  readonly version?: number
  readonly organizationId: string
  readonly facilityId: string
  readonly needId: string
  readonly componentId?: string | null
  readonly interventionType: FacilityMaintenanceInterventionType
  readonly classification: FacilityMaintenanceCostClassification
  readonly providerId: string
  readonly sourceKind: FacilityCostSourceKind
  readonly evidence: { readonly sourceId: string; readonly catalogEntryId?: string | null; readonly modelVersion?: string | null }
  readonly amount: FacilityEconomyMoney
  readonly market: string
  readonly issuedOn: GameDate | string
  readonly validFrom: GameDate | string
  readonly validUntil: GameDate | string
  readonly terms?: { readonly paymentDueDays?: number | null; readonly executionDays?: number | null; readonly resultingCondition?: number | null }
}

export function createFacilityMaintenanceOffer(input: CreateFacilityMaintenanceOfferInput): FacilityMaintenanceOffer {
  const interventionType = oneOf(FACILITY_MAINTENANCE_INTERVENTION_TYPES, input.interventionType, 'Facility offer interventionType')
  const classification = oneOf(FACILITY_MAINTENANCE_COST_CLASSIFICATIONS, input.classification, 'Facility offer classification')
  if (!CLASSIFICATIONS_BY_INTERVENTION[interventionType].includes(classification)) throw new RangeError(`Facility offer classification ${classification} is not valid for ${interventionType}`)
  const sourceKind = oneOf(FACILITY_COST_SOURCE_KINDS, input.sourceKind, 'Facility offer sourceKind')
  const catalogEntryId = nullableText(input.evidence.catalogEntryId, 'Facility offer catalogEntryId')
  const modelVersion = nullableText(input.evidence.modelVersion, 'Facility offer modelVersion')
  if (sourceKind === 'SIMULATED_MODEL' && (catalogEntryId === null || modelVersion === null)) throw new RangeError('A simulated Facility offer requires a calibrated catalog entry and a model version')
  if (sourceKind !== 'SIMULATED_MODEL' && (catalogEntryId !== null || modelVersion !== null)) throw new RangeError('Only a simulated Facility offer may reference a catalog entry or model version')
  const amount = Object.freeze({ currencyCode: currency(input.amount.currencyCode, 'Facility offer currency'), minorUnits: positiveInt(input.amount.minorUnits, 'Facility offer amount') })
  const issuedOn = parseGameDate(input.issuedOn)
  const validFrom = parseGameDate(input.validFrom)
  const validUntil = parseGameDate(input.validUntil)
  if (compareGameDates(validFrom, issuedOn) < 0) throw new RangeError('Facility offer validFrom cannot precede issuedOn')
  if (compareGameDates(validUntil, validFrom) < 0) throw new RangeError('Facility offer validUntil cannot precede validFrom')
  const version = input.version === undefined ? 1 : positiveInt(input.version, 'Facility offer version')
  const executionDays = nullableNonNegativeInt(input.terms?.executionDays, 'Facility offer executionDays')
  const resultingCondition = nullableNonNegativeInt(input.terms?.resultingCondition, 'Facility offer resultingCondition')
  if (resultingCondition !== null && resultingCondition > 100) throw new RangeError('Facility offer resultingCondition must be between 0 and 100')
  return Object.freeze({
    recordKind: 'OFFER' as const,
    id: text(input.id, 'Facility offer id'),
    version,
    organizationId: text(input.organizationId, 'Facility offer organizationId'),
    facilityId: text(input.facilityId, 'Facility offer facilityId'),
    needId: text(input.needId, 'Facility offer needId'),
    componentId: nullableText(input.componentId, 'Facility offer componentId'),
    interventionType,
    classification,
    providerId: text(input.providerId, 'Facility offer providerId'),
    sourceKind,
    evidence: Object.freeze({ sourceId: text(input.evidence.sourceId, 'Facility offer evidence sourceId'), catalogEntryId, modelVersion }),
    amount,
    market: text(input.market, 'Facility offer market'),
    issuedOn,
    validFrom,
    validUntil,
    terms: Object.freeze({ paymentDueDays: nullableNonNegativeInt(input.terms?.paymentDueDays, 'Facility offer paymentDueDays'), executionDays, resultingCondition }),
  })
}

export interface CreateFacilityCapitalOfferInput {
  readonly id: string
  readonly version?: number
  readonly organizationId: string
  readonly facilityId: string
  readonly projectId: string
  readonly componentId?: string | null
  readonly interventionType: FacilityCapitalInterventionType
  readonly providerId: string
  readonly sourceKind: FacilityCostSourceKind
  readonly evidence: { readonly sourceId: string; readonly catalogEntryId?: string | null; readonly modelVersion?: string | null }
  readonly amount: FacilityEconomyMoney
  readonly market: string
  readonly issuedOn: GameDate | string
  readonly validFrom: GameDate | string
  readonly validUntil: GameDate | string
  readonly paymentDueDays?: number | null
  readonly executionDays?: number | null
  readonly promisedCondition?: number | null
  readonly tranches: readonly FacilityCapitalTranche[]
}

export function createFacilityCapitalOffer(input: CreateFacilityCapitalOfferInput): FacilityCapitalOffer {
  const interventionType = oneOf(FACILITY_CAPITAL_INTERVENTION_TYPES, input.interventionType, 'Facility capital offer interventionType')
  const sourceKind = oneOf(FACILITY_COST_SOURCE_KINDS, input.sourceKind, 'Facility capital offer sourceKind')
  const catalogEntryId = nullableText(input.evidence.catalogEntryId, 'Facility capital offer catalogEntryId')
  const modelVersion = nullableText(input.evidence.modelVersion, 'Facility capital offer modelVersion')
  if (sourceKind === 'SIMULATED_MODEL' && (catalogEntryId === null || modelVersion === null)) throw new RangeError('A simulated Facility capital offer requires a calibrated catalog entry and a model version')
  if (sourceKind !== 'SIMULATED_MODEL' && (catalogEntryId !== null || modelVersion !== null)) throw new RangeError('Only a simulated Facility capital offer may reference a catalog entry or model version')
  const amount = Object.freeze({ currencyCode: currency(input.amount.currencyCode, 'Facility capital offer currency'), minorUnits: positiveInt(input.amount.minorUnits, 'Facility capital offer amount') })
  const issuedOn = parseGameDate(input.issuedOn)
  const validFrom = parseGameDate(input.validFrom)
  const validUntil = parseGameDate(input.validUntil)
  if (compareGameDates(validFrom, issuedOn) < 0) throw new RangeError('Facility capital offer validFrom cannot precede issuedOn')
  if (compareGameDates(validUntil, validFrom) < 0) throw new RangeError('Facility capital offer validUntil cannot precede validFrom')
  const tranches = Object.freeze(input.tranches.map((tranche) => Object.freeze({
    label: text(tranche.label, 'Facility capital tranche label'),
    permille: positiveInt(tranche.permille, 'Facility capital tranche permille'),
    trigger: oneOf(['WORK_STARTED', 'WORK_ACCEPTED'] as const, tranche.trigger, 'Facility capital tranche trigger'),
  })))
  if (tranches.length === 0 || tranches.reduce((sum, tranche) => sum + tranche.permille, 0) !== 1_000) throw new RangeError('Facility capital offer tranches must be present and add up to the whole price (1000 permille)')
  if (new Set(tranches.map((tranche) => tranche.label)).size !== tranches.length) throw new RangeError('Facility capital offer tranche labels must be unique')
  if (tranches.filter((tranche) => tranche.trigger === 'WORK_ACCEPTED').length !== 1) throw new RangeError('A Facility capital offer must have exactly one acceptance milestone')
  for (const tranche of tranches) if ((amount.minorUnits * tranche.permille) % 1_000 !== 0) throw new RangeError('Facility capital offer tranches must split the price into whole minor units')
  const promisedCondition = nullableNonNegativeInt(input.promisedCondition, 'Facility capital offer promisedCondition')
  if (promisedCondition !== null && promisedCondition > 100) throw new RangeError('Facility capital offer promisedCondition must be between 0 and 100')
  return Object.freeze({
    recordKind: 'CAPITAL_OFFER' as const,
    id: text(input.id, 'Facility capital offer id'),
    version: input.version === undefined ? 1 : positiveInt(input.version, 'Facility capital offer version'),
    organizationId: text(input.organizationId, 'Facility capital offer organizationId'),
    facilityId: text(input.facilityId, 'Facility capital offer facilityId'),
    projectId: text(input.projectId, 'Facility capital offer projectId'),
    componentId: nullableText(input.componentId, 'Facility capital offer componentId'),
    interventionType,
    classification: CAPITAL_CLASSIFICATION_BY_INTERVENTION[interventionType],
    providerId: text(input.providerId, 'Facility capital offer providerId'),
    sourceKind,
    evidence: Object.freeze({ sourceId: text(input.evidence.sourceId, 'Facility capital offer evidence sourceId'), catalogEntryId, modelVersion }),
    amount,
    market: text(input.market, 'Facility capital offer market'),
    issuedOn, validFrom, validUntil,
    paymentDueDays: nullableNonNegativeInt(input.paymentDueDays, 'Facility capital offer paymentDueDays'),
    executionDays: nullableNonNegativeInt(input.executionDays, 'Facility capital offer executionDays'),
    promisedCondition,
    tranches,
  })
}

/** The minor units recognized for one tranche. */
export function facilityCapitalTrancheAmount(offer: FacilityCapitalOffer, tranche: FacilityCapitalTranche): number { return (offer.amount.minorUnits * tranche.permille) / 1_000 }
export function facilityCapitalTrancheId(operationId: string, tranche: FacilityCapitalTranche): string { return `capital-tranche:${operationId}:${tranche.label.toLowerCase()}` }

export interface CreateFacilityServiceOfferInput {
  readonly id: string
  readonly version?: number
  readonly organizationId: string
  readonly facilityId: string
  readonly interventionType: FacilityServiceInterventionType
  readonly providerId: string
  readonly sourceKind: FacilityCostSourceKind
  readonly evidence: { readonly sourceId: string; readonly catalogEntryId?: string | null; readonly modelVersion?: string | null }
  readonly amountPerPeriod: FacilityEconomyMoney
  readonly market: string
  readonly issuedOn: GameDate | string
  readonly validFrom: GameDate | string
  readonly validUntil: GameDate | string
  readonly periodDays: number
  readonly termPeriods: number
  readonly noticeDays: number
  readonly paymentDueDays: number
  readonly restorationPoints: number
}

export function createFacilityServiceOffer(input: CreateFacilityServiceOfferInput): FacilityServiceOffer {
  const interventionType = oneOf(FACILITY_SERVICE_INTERVENTION_TYPES, input.interventionType, 'Facility service offer interventionType')
  const sourceKind = oneOf(FACILITY_COST_SOURCE_KINDS, input.sourceKind, 'Facility service offer sourceKind')
  const catalogEntryId = nullableText(input.evidence.catalogEntryId, 'Facility service offer catalogEntryId')
  const modelVersion = nullableText(input.evidence.modelVersion, 'Facility service offer modelVersion')
  if (sourceKind === 'SIMULATED_MODEL' && (catalogEntryId === null || modelVersion === null)) throw new RangeError('A simulated Facility service offer requires a calibrated catalog entry and a model version')
  if (sourceKind !== 'SIMULATED_MODEL' && (catalogEntryId !== null || modelVersion !== null)) throw new RangeError('Only a simulated Facility service offer may reference a catalog entry or model version')
  const issuedOn = parseGameDate(input.issuedOn)
  const validFrom = parseGameDate(input.validFrom)
  const validUntil = parseGameDate(input.validUntil)
  if (compareGameDates(validFrom, issuedOn) < 0) throw new RangeError('Facility service offer validFrom cannot precede issuedOn')
  if (compareGameDates(validUntil, validFrom) < 0) throw new RangeError('Facility service offer validUntil cannot precede validFrom')
  const restorationPoints = positiveInt(input.restorationPoints, 'Facility service offer restorationPoints')
  if (restorationPoints > 100) throw new RangeError('Facility service offer restorationPoints must be between 1 and 100')
  return Object.freeze({
    recordKind: 'SERVICE_OFFER' as const,
    id: text(input.id, 'Facility service offer id'),
    version: input.version === undefined ? 1 : positiveInt(input.version, 'Facility service offer version'),
    organizationId: text(input.organizationId, 'Facility service offer organizationId'),
    facilityId: text(input.facilityId, 'Facility service offer facilityId'),
    interventionType,
    providerId: text(input.providerId, 'Facility service offer providerId'),
    sourceKind,
    evidence: Object.freeze({ sourceId: text(input.evidence.sourceId, 'Facility service offer evidence sourceId'), catalogEntryId, modelVersion }),
    amountPerPeriod: Object.freeze({ currencyCode: currency(input.amountPerPeriod.currencyCode, 'Facility service offer currency'), minorUnits: positiveInt(input.amountPerPeriod.minorUnits, 'Facility service offer fee') }),
    market: text(input.market, 'Facility service offer market'),
    issuedOn, validFrom, validUntil,
    periodDays: positiveInt(input.periodDays, 'Facility service offer periodDays'),
    termPeriods: positiveInt(input.termPeriods, 'Facility service offer termPeriods'),
    noticeDays: nullableNonNegativeInt(input.noticeDays, 'Facility service offer noticeDays') ?? 0,
    paymentDueDays: nullableNonNegativeInt(input.paymentDueDays, 'Facility service offer paymentDueDays') ?? 0,
    restorationPoints,
  })
}

export interface CreateFacilityOperationEventInput {
  readonly operationId: string
  readonly sequence: number
  readonly kind: FacilityOperationEventKind
  readonly effectiveOn: GameDate | string
  readonly actor?: { readonly kind: string; readonly id: string } | null
  readonly organizationId?: string | null
  readonly facilityId?: string | null
  readonly needId?: string | null
  readonly projectId?: string | null
  readonly interventionType?: FacilityOperationInterventionType | null
  readonly offerId?: string | null
  readonly decisionId?: string | null
  readonly reservationId?: string | null
  readonly costFactId?: string | null
  readonly recognitionId?: string | null
  readonly actionId?: string | null
  readonly endsOn?: GameDate | string | null
  readonly reasonCode?: string | null
}

export function facilityOperationEventId(operationId: string, sequence: number, kind: FacilityOperationEventKind): string {
  return `facility-operation-event:${operationId}:${String(sequence).padStart(4, '0')}:${kind}`
}

export function createFacilityOperationEvent(input: CreateFacilityOperationEventInput): FacilityOperationEvent {
  const kind = oneOf(FACILITY_OPERATION_EVENT_KINDS, input.kind, 'Facility operation event kind')
  const operationId = text(input.operationId, 'Facility operation id')
  const sequence = positiveInt(input.sequence, 'Facility operation event sequence')
  return Object.freeze({
    recordKind: 'OPERATION_EVENT' as const,
    id: facilityOperationEventId(operationId, sequence, kind),
    operationId,
    sequence,
    kind,
    effectiveOn: parseGameDate(input.effectiveOn),
    actor: input.actor === undefined || input.actor === null ? null : Object.freeze({ kind: text(input.actor.kind, 'Facility operation actor kind'), id: text(input.actor.id, 'Facility operation actor id') }),
    organizationId: nullableText(input.organizationId, 'Facility operation organizationId'),
    facilityId: nullableText(input.facilityId, 'Facility operation facilityId'),
    needId: nullableText(input.needId, 'Facility operation needId'),
    projectId: nullableText(input.projectId, 'Facility operation projectId'),
    interventionType: input.interventionType === undefined || input.interventionType === null ? null : oneOf(FACILITY_ALL_INTERVENTION_TYPES, input.interventionType, 'Facility operation interventionType'),
    offerId: nullableText(input.offerId, 'Facility operation offerId'),
    decisionId: nullableText(input.decisionId, 'Facility operation decisionId'),
    reservationId: nullableText(input.reservationId, 'Facility operation reservationId'),
    costFactId: nullableText(input.costFactId, 'Facility operation costFactId'),
    recognitionId: nullableText(input.recognitionId, 'Facility operation recognitionId'),
    endsOn: input.endsOn === undefined || input.endsOn === null ? null : parseGameDate(input.endsOn),
    actionId: nullableText(input.actionId, 'Facility operation actionId'),
    reasonCode: nullableText(input.reasonCode, 'Facility operation reasonCode'),
  })
}

/** Rebuilds any record through its canonical creator (used by World update, Save parsing and immutability checks). */
export function createFacilityEconomyRecord(record: FacilityEconomyRecord): FacilityEconomyRecord {
  switch (record.recordKind) {
    case 'COST_CATALOG_ENTRY': return createFacilityCostCatalogEntry(record)
    case 'PROVIDER': return createFacilityProvider(record)
    case 'OFFER': return createFacilityMaintenanceOffer({ ...record, evidence: record.evidence, terms: record.terms })
    case 'CAPITAL_OFFER': return createFacilityCapitalOffer(record)
    case 'SERVICE_OFFER': return createFacilityServiceOffer(record)
    case 'OPERATION_EVENT': return createFacilityOperationEvent(record)
    default: throw new TypeError(`Facility economy record kind is invalid: ${String((record as { recordKind?: unknown }).recordKind)}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Queries and derived lifecycle
// ---------------------------------------------------------------------------------------------

export function facilityOperationIdFor(needId: string, attempt: number): string {
  return `facility-operation:maintenance:${needId}:${attempt}`
}

/**
 * Read indexes over one `facilityEconomyRecordsById` value. The collection is immutable (every write publishes a new object), so an
 * index built for one value is valid for exactly that value. Each list keeps the order of `Object.values` and the same filters as a
 * full scan, so callers observe identical results; the arrays are frozen because they are shared between callers.
 */
interface FacilityEconomyIndex {
  readonly byKind: Map<string, readonly FacilityEconomyRecord[]>
  operationEvents?: Map<string, readonly FacilityOperationEvent[]>
  operationIds?: readonly string[]
}
const facilityEconomyIndexes = new WeakMap<object, FacilityEconomyIndex>()

function facilityEconomyIndex(world: Pick<GameWorld, 'facilityEconomyRecordsById'>): FacilityEconomyIndex {
  const records = world.facilityEconomyRecordsById
  let index = facilityEconomyIndexes.get(records)
  if (index === undefined) { index = { byKind: new Map() }; facilityEconomyIndexes.set(records, index) }
  return index
}

export function facilityEconomyRecordsOfKind<K extends FacilityEconomyRecord['recordKind']>(
  world: Pick<GameWorld, 'facilityEconomyRecordsById'>,
  kind: K,
): readonly Extract<FacilityEconomyRecord, { readonly recordKind: K }>[] {
  const index = facilityEconomyIndex(world)
  let list = index.byKind.get(kind)
  if (list === undefined) {
    list = Object.freeze(Object.values(world.facilityEconomyRecordsById).filter((record) => record.recordKind === kind))
    index.byKind.set(kind, list)
  }
  return list as readonly Extract<FacilityEconomyRecord, { readonly recordKind: K }>[]
}

function operationEventIndex(world: Pick<GameWorld, 'facilityEconomyRecordsById'>): Map<string, readonly FacilityOperationEvent[]> {
  const index = facilityEconomyIndex(world)
  if (index.operationEvents === undefined) {
    const grouped = new Map<string, FacilityOperationEvent[]>()
    for (const event of facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT')) {
      const list = grouped.get(event.operationId)
      if (list === undefined) grouped.set(event.operationId, [event]); else list.push(event)
    }
    index.operationEvents = new Map([...grouped].map(([id, events]) => [id, Object.freeze([...events].sort((a, b) => a.sequence - b.sequence))]))
  }
  return index.operationEvents
}

export function facilityOperationEvents(world: Pick<GameWorld, 'facilityEconomyRecordsById'>, operationId: string): readonly FacilityOperationEvent[] {
  return operationEventIndex(world).get(operationId) ?? EMPTY_OPERATION_EVENTS
}
const EMPTY_OPERATION_EVENTS: readonly FacilityOperationEvent[] = Object.freeze([])

export function facilityOperationIds(world: Pick<GameWorld, 'facilityEconomyRecordsById'>): readonly string[] {
  const index = facilityEconomyIndex(world)
  if (index.operationIds === undefined) index.operationIds = Object.freeze([...operationEventIndex(world).keys()].sort())
  return index.operationIds
}

export const FACILITY_OPERATION_STAGES = [
  'COST_UNKNOWN',
  'PENDING_APPROVAL',
  'FUNDING_BLOCKED',
  'APPROVED_PENDING_FUNDING',
  'RESERVED',
  'CONTRACTED',
  'WORK_IN_PROGRESS',
  'WORK_COMPLETED',
  'CANCELLED',
] as const
export type FacilityOperationStage = (typeof FACILITY_OPERATION_STAGES)[number]

export interface FacilityOperationLifecycle {
  readonly operationId: string
  readonly stage: FacilityOperationStage
  readonly organizationId: string | null
  readonly facilityId: string | null
  readonly needId: string | null
  readonly projectId: string | null
  readonly interventionType: FacilityOperationInterventionType | null
  readonly selectedOfferId: string | null
  readonly decisionId: string | null
  readonly reservationId: string | null
  readonly costFactId: string | null
  readonly recognitionIds: readonly string[]
  /** BS17E-C: processed and skipped service periods (0-based indexes) and the effective end date of a noticed termination. */
  readonly servicePeriodsProcessed: readonly number[]
  readonly servicePeriodsSkipped: readonly number[]
  readonly serviceEndsOn: GameDate | null
  readonly serviceEnded: boolean
  readonly actionId: string | null
  readonly cancellationRequestedDecisionId: string | null
  readonly lastReasonCode: string | null
  readonly cancelled: boolean
  readonly cancelledAfter: 'PROPOSAL' | 'APPROVAL_REQUEST' | 'RESERVATION' | 'CONTRACT' | 'WORK_STARTED' | 'WORK_COMPLETED' | null
}

/** The 0-based service period a processed/skipped event refers to, encoded in its reason code as `period:<n>[:detail]`. */
export function servicePeriodIndex(reasonCode: string | null): number | null {
  const match = reasonCode === null ? null : /^period:(\d+)/.exec(reasonCode)
  return match === null ? null : Number(match[1])
}

/** Pure fold over the operation's events. The stage is never stored. Returns null when the operation has no events. */
export function deriveFacilityOperationLifecycle(events: readonly FacilityOperationEvent[]): FacilityOperationLifecycle | null {
  if (events.length === 0) return null
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
  let organizationId: string | null = null
  let facilityId: string | null = null
  let needId: string | null = null
  let projectId: string | null = null
  const recognitionIds: string[] = []
  const servicePeriodsProcessed: number[] = []
  const servicePeriodsSkipped: number[] = []
  let serviceEndsOn: GameDate | null = null
  let serviceEnded = false
  let interventionType: FacilityOperationInterventionType | null = null
  let selectedOfferId: string | null = null
  let decisionId: string | null = null
  let reservationId: string | null = null
  let costFactId: string | null = null
  let actionId: string | null = null
  let cancellationRequestedDecisionId: string | null = null
  let stage: FacilityOperationStage = 'COST_UNKNOWN'
  let lastReasonCode: string | null = null
  let cancelled = false
  let cancelledAfter: FacilityOperationLifecycle['cancelledAfter'] = null
  let maxStage: FacilityOperationLifecycle['cancelledAfter'] = 'PROPOSAL'
  for (const event of ordered) {
    organizationId = event.organizationId ?? organizationId
    facilityId = event.facilityId ?? facilityId
    needId = event.needId ?? needId
    projectId = event.projectId ?? projectId
    if (event.recognitionId !== null) recognitionIds.push(event.recognitionId)
    interventionType = event.interventionType ?? interventionType
    lastReasonCode = event.reasonCode ?? lastReasonCode
    switch (event.kind) {
      case 'PROPOSAL_CREATED': stage = 'COST_UNKNOWN'; break
      case 'OFFER_SELECTED': selectedOfferId = event.offerId; stage = decisionId === null ? 'PENDING_APPROVAL' : stage; break
      case 'APPROVAL_REQUESTED': decisionId = event.decisionId; stage = 'PENDING_APPROVAL'; maxStage = 'APPROVAL_REQUEST'; break
      case 'FUNDING_BLOCKED': stage = 'FUNDING_BLOCKED'; break
      case 'FUNDS_RESERVED': reservationId = event.reservationId; stage = 'RESERVED'; maxStage = 'RESERVATION'; break
      case 'CONTRACT_ACCEPTED': stage = 'CONTRACTED'; maxStage = 'CONTRACT'; break
      case 'WORK_STARTED': actionId = event.actionId; stage = 'WORK_IN_PROGRESS'; maxStage = 'WORK_STARTED'; break
      case 'WORK_COMPLETED': stage = 'WORK_COMPLETED'; maxStage = 'WORK_COMPLETED'; break
      case 'COST_FACT_AUTHORIZED': costFactId = event.costFactId; break
      case 'CANCELLATION_REQUESTED': cancellationRequestedDecisionId = event.decisionId; break
      case 'CANCELLED': cancelled = true; cancelledAfter = maxStage; stage = 'CANCELLED'; break
      case 'SERVICE_PERIOD_PROCESSED': { const index = servicePeriodIndex(event.reasonCode); if (index !== null) servicePeriodsProcessed.push(index); break }
      case 'SERVICE_PERIOD_SKIPPED': { const index = servicePeriodIndex(event.reasonCode); if (index !== null) servicePeriodsSkipped.push(index); break }
      case 'SERVICE_TERMINATION_NOTICED': serviceEndsOn = event.endsOn ?? serviceEndsOn; break
      case 'SERVICE_ENDED': serviceEnded = true; cancelled = true; stage = 'CANCELLED'; break
    }
  }
  return Object.freeze({ operationId: ordered[0]!.operationId, stage, organizationId, facilityId, needId, projectId, interventionType, selectedOfferId, decisionId, reservationId, costFactId, recognitionIds: Object.freeze([...recognitionIds]), servicePeriodsProcessed: Object.freeze([...servicePeriodsProcessed]), servicePeriodsSkipped: Object.freeze([...servicePeriodsSkipped]), serviceEndsOn, serviceEnded, actionId, cancellationRequestedDecisionId, lastReasonCode, cancelled, cancelledAfter })
}

/** True when the offer is in force on the given date. Expiry blocks contracting; it never deletes the offer. */
export function isFacilityOfferValidOn(offer: FacilityMaintenanceOffer, on: GameDate | string): boolean {
  const date = parseGameDate(on)
  return compareGameDates(date, offer.validFrom) >= 0 && compareGameDates(date, offer.validUntil) <= 0
}

/** Cost status of an operation: KNOWN only when a selected offer exists; otherwise UNKNOWN_COST. Never a derived price. */
export function facilityOperationCostStatus(world: Pick<GameWorld, 'facilityEconomyRecordsById'>, lifecycle: FacilityOperationLifecycle): 'KNOWN' | 'UNKNOWN_COST' {
  if (lifecycle.selectedOfferId === null) return 'UNKNOWN_COST'
  return world.facilityEconomyRecordsById[lifecycle.selectedOfferId]?.recordKind === 'OFFER' ? 'KNOWN' : 'UNKNOWN_COST'
}

// ---------------------------------------------------------------------------------------------
// World validation (structural world: no Finance/Governance imports)
// ---------------------------------------------------------------------------------------------

type EconomyWorld = Pick<GameWorld,
  | 'organizationsById' | 'facilitiesById' | 'facilityComponentsById' | 'facilityMaintenanceNeedsById' | 'facilityMaintenanceActionsById'
  | 'operatingCostFactsById' | 'financialReservationsById' | 'governanceDecisionsById' | 'facilityDevelopmentProjectsById' | 'expenseRecognitionsById'>

export function validateFacilityEconomyRecordCollection(records: readonly FacilityEconomyRecord[], world: EconomyWorld): void {
  const byId = new Map<string, FacilityEconomyRecord>()
  for (const record of records) {
    if (byId.has(record.id)) throw new Error(`Duplicate facility economy record ${record.id}`)
    byId.set(record.id, record)
  }
  const perOperation = new Map<string, FacilityOperationEvent[]>()
  for (const record of records) {
    if (record.recordKind === 'OFFER') {
      if (world.organizationsById[record.organizationId as never] === undefined) throw new Error(`Facility offer ${record.id} references an unknown Organization`)
      if (world.facilitiesById[record.facilityId as never] === undefined) throw new Error(`Facility offer ${record.id} references an unknown Facility`)
      if (world.facilityMaintenanceNeedsById[record.needId as never] === undefined) throw new Error(`Facility offer ${record.id} references an unknown maintenance need`)
      if (record.componentId !== null && world.facilityComponentsById[record.componentId as never] === undefined) throw new Error(`Facility offer ${record.id} references an unknown component`)
      const provider = byId.get(record.providerId)
      if (provider === undefined || provider.recordKind !== 'PROVIDER') throw new Error(`Facility offer ${record.id} references an unknown provider`)
      if (record.evidence.catalogEntryId !== null) {
        const entry = byId.get(record.evidence.catalogEntryId)
        if (entry === undefined || entry.recordKind !== 'COST_CATALOG_ENTRY' || entry.sourceKind !== 'SIMULATED_MODEL' || entry.calibration === null) throw new Error(`Facility offer ${record.id} references a catalog entry without authorized calibration`)
        if (entry.currencyCode !== record.amount.currencyCode || entry.market !== record.market || entry.interventionType !== record.interventionType) throw new Error(`Facility offer ${record.id} does not match its catalog entry scope, market or currency`)
      }
    } else if (record.recordKind === 'CAPITAL_OFFER') {
      if (world.organizationsById[record.organizationId as never] === undefined) throw new Error(`Facility capital offer ${record.id} references an unknown Organization`)
      if (world.facilitiesById[record.facilityId as never] === undefined) throw new Error(`Facility capital offer ${record.id} references an unknown Facility`)
      if (world.facilityDevelopmentProjectsById[record.projectId as never] === undefined) throw new Error(`Facility capital offer ${record.id} references an unknown development project`)
      if (record.componentId !== null && world.facilityComponentsById[record.componentId as never] === undefined) throw new Error(`Facility capital offer ${record.id} references an unknown component`)
      const provider = byId.get(record.providerId)
      if (provider === undefined || provider.recordKind !== 'PROVIDER') throw new Error(`Facility capital offer ${record.id} references an unknown provider`)
      if (record.evidence.catalogEntryId !== null) {
        const entry = byId.get(record.evidence.catalogEntryId)
        if (entry === undefined || entry.recordKind !== 'COST_CATALOG_ENTRY' || entry.sourceKind !== 'SIMULATED_MODEL' || entry.calibration === null) throw new Error(`Facility capital offer ${record.id} references a catalog entry without authorized calibration`)
        if (entry.currencyCode !== record.amount.currencyCode || entry.market !== record.market || entry.interventionType !== record.interventionType) throw new Error(`Facility capital offer ${record.id} does not match its catalog entry scope, market or currency`)
      }
    } else if (record.recordKind === 'SERVICE_OFFER') {
      if (world.organizationsById[record.organizationId as never] === undefined) throw new Error(`Facility service offer ${record.id} references an unknown Organization`)
      if (world.facilitiesById[record.facilityId as never] === undefined) throw new Error(`Facility service offer ${record.id} references an unknown Facility`)
      const provider = byId.get(record.providerId)
      if (provider === undefined || provider.recordKind !== 'PROVIDER') throw new Error(`Facility service offer ${record.id} references an unknown provider`)
      if (record.evidence.catalogEntryId !== null) {
        const entry = byId.get(record.evidence.catalogEntryId)
        if (entry === undefined || entry.recordKind !== 'COST_CATALOG_ENTRY' || entry.sourceKind !== 'SIMULATED_MODEL' || entry.calibration === null) throw new Error(`Facility service offer ${record.id} references a catalog entry without authorized calibration`)
        if (entry.currencyCode !== record.amountPerPeriod.currencyCode || entry.market !== record.market || entry.interventionType !== record.interventionType) throw new Error(`Facility service offer ${record.id} does not match its catalog entry scope, market or currency`)
      }
    } else if (record.recordKind === 'OPERATION_EVENT') {
      const list = perOperation.get(record.operationId) ?? []
      list.push(record)
      perOperation.set(record.operationId, list)
      if (record.organizationId !== null && world.organizationsById[record.organizationId as never] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown Organization`)
      if (record.facilityId !== null && world.facilitiesById[record.facilityId as never] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown Facility`)
      if (record.needId !== null && world.facilityMaintenanceNeedsById[record.needId as never] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown maintenance need`)
      if (record.projectId !== null && world.facilityDevelopmentProjectsById[record.projectId as never] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown development project`)
      if (record.recognitionId !== null && world.expenseRecognitionsById[record.recognitionId as never] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown expense recognition`)
      if (record.offerId !== null) { const referenced = byId.get(record.offerId)?.recordKind; if (referenced !== 'OFFER' && referenced !== 'CAPITAL_OFFER' && referenced !== 'SERVICE_OFFER') throw new Error(`Facility operation event ${record.id} references an unknown offer`) }
      if (record.decisionId !== null && world.governanceDecisionsById[record.decisionId] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown Governance decision`)
      if (record.reservationId !== null && world.financialReservationsById[record.reservationId] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown Finance reservation`)
      if (record.costFactId !== null && world.operatingCostFactsById[record.costFactId] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown operating cost fact`)
      if (record.actionId !== null && world.facilityMaintenanceActionsById[record.actionId as never] === undefined) throw new Error(`Facility operation event ${record.id} references an unknown maintenance action`)
    }
  }
  for (const [operationId, events] of perOperation) {
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
    ordered.forEach((event, index) => {
      if (event.sequence !== index + 1) throw new Error(`Facility operation ${operationId} has a non-contiguous event sequence`)
    })
    if (ordered[0]!.kind !== 'PROPOSAL_CREATED') throw new Error(`Facility operation ${operationId} must begin with PROPOSAL_CREATED`)
    if (ordered.filter((event) => event.kind === 'PROPOSAL_CREATED').length !== 1) throw new Error(`Facility operation ${operationId} has more than one PROPOSAL_CREATED`)
    if (ordered.slice(0, -1).some((event) => event.kind === 'CANCELLED')) throw new Error(`Facility operation ${operationId} has events after CANCELLED`)
    for (let i = 1; i < ordered.length; i += 1) {
      if (compareGameDates(ordered[i]!.effectiveOn, ordered[i - 1]!.effectiveOn) < 0) throw new Error(`Facility operation ${operationId} events are not chronological`)
    }
  }
}
