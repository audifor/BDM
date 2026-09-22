import {
  EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE,
  EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  attachWorldDbCompetitionRuntime,
  createWorldDbCompetitionRuntime,
  updateGameWorld,
  type GameWorld,
  type WorldAnnualDevelopmentCycle,
  type WorldDbCompetitionRuntime,
} from '@/domain/world'
import { createOrganization, createOrganizationSection, type Organization, type OrganizationSection } from '@/domain/organization'
import { createOrganizationControl, createOrganizationOwnership, type OrganizationControl, type OrganizationOwnership, type OrganizationOwnershipActor } from '@/domain/ownership/OrganizationOwnership'
import { createOrganizationOwnershipTransaction, createOrganizationOwnershipTransactionEvent, type OrganizationOwnershipTransaction, type OrganizationOwnershipTransactionEvent } from '@/domain/ownership/OrganizationOwnershipTransaction'
import { createOrganizationInvestorInterest, type OrganizationInvestorInterest } from '@/domain/investment/OrganizationInvestorInterest'
import { createOrganizationCapitalRaise, createOrganizationCapitalRaiseEvent, type OrganizationCapitalRaise, type OrganizationCapitalRaiseEvent } from '@/domain/investment/OrganizationCapitalRaise'
import { createOrganizationInvestmentProposal, createOrganizationInvestmentProposalEvent, type OrganizationInvestmentProposal, type OrganizationInvestmentProposalEvent } from '@/domain/investment/OrganizationInvestmentProposal'
import { createMultiClubOwnershipPolicy, type MultiClubOwnershipPolicy } from '@/domain/multiClub/MultiClubOwnershipPolicy'
import { createOrganizationStructuralChange, type OrganizationStructuralChange } from '@/domain/structuralRegulation/OrganizationStructuralChange'
import { createOrganizationLifecycleState, type OrganizationLifecycleState } from '@/domain/structuralRegulation/OrganizationLifecycle'
import { createOrganizationSuccession, type OrganizationSuccession } from '@/domain/structuralRegulation/OrganizationSuccession'
import { createRegulatoryOrder, type RegulatoryOrder } from '@/domain/structuralRegulation/RegulatoryOrder'
import { createRegulatoryRemediationPlan, type RegulatoryRemediationPlan } from '@/domain/structuralRegulation/RegulatoryRemediationPlan'
import { createOrganizationLicense, type OrganizationLicense } from '@/domain/structuralRegulation/OrganizationLicense'
import {
  createCapacitySpecification,
  createCourtSpecification,
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityCompetitionApproval,
  createFacilityConditionRecord,
  createFacilityControlRight,
  createFacilityDevelopmentProject,
  createFacilityDevelopmentProjectPhase,
  createFacilityDevelopmentProjectScope,
  createFacilityInspection,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityNameRecord,
  createFacilityOperationalIncident,
  createFacilityOperatorAssignment,
  createFacilityOrganizationRelationship,
  createFacilityOwnershipInterest,
  createFacilityStatusRecord,
  createFacilityTeamRelationship,
  createFacilityUsageRight,
  createPlace,
  type CapacitySpecification,
  type CourtSpecification,
  type Facility,
  type FacilityComponent,
  type FacilityComponentConditionRecord,
  type FacilityCompetitionApproval,
  type FacilityConditionRecord,
  type FacilityControlActor,
  type FacilityControlRight,
  type FacilityDevelopmentProject,
  type FacilityDevelopmentProjectPhase,
  type FacilityInspection,
  type FacilityMaintenanceAction,
  type FacilityMaintenanceNeed,
  type FacilityNameRecord,
  type FacilityOperationalIncident,
  type FacilityOperatorAssignment,
  type FacilityOrganizationRelationship,
  type FacilityOwnershipActor,
  type FacilityOwnershipInterest,
  type FacilityStatusRecord,
  type FacilityTeamRelationship,
  type FacilityUsageRight,
  type Place,
} from '@/domain/facilities'
import { createAuthorizedOperatingCostFact, createBudgetAllocation, createBudgetLine, createBudgetRevision, createDebtInstrument, createCompetitionDistributionFact, createExpenseRecognition, createFinancialAccount, createFinancialBudget, createFinancialCommitment, createFinancialEntitlement, createFinancialTransaction, createFiscalPeriod, createForecastAssumption, createOperatingCostSource, createOrganizationFinancialProfile, createPayable, createReceivable, createRevenueRecognition, createRevenueSource, createTreasurySettlement, type AuthorizedOperatingCostFact, type BudgetAllocation, type BudgetLine, type BudgetRevision, type CompetitionDistributionFact, type DebtInstrument, type ExpenseRecognition, type FinancialAccount, type FinancialBudget, type FinancialCommitment, type FinancialDimensions, type FinancialEntitlement, type FinancialTransaction, type FiscalPeriod, type ForecastAssumption, type OperatingCostSource, type OrganizationFinancialProfile, type Payable, type Receivable, type RevenueRecognition, type RevenueSource, type TreasuryCounterparty, type TreasurySettlement } from '@/domain/finance'
import { parseGameDate } from '@/domain/date'
import { competitionIdFromString, ecosystemIdFromString, expenseRecognitionIdFromString, facilityCompetitionApprovalIdFromString, facilityComponentConditionRecordIdFromString, facilityComponentIdFromString, facilityConditionRecordIdFromString, facilityControlRightIdFromString, facilityDevelopmentProjectIdFromString, facilityDevelopmentProjectPhaseIdFromString, facilityIdFromString, facilityInspectionIdFromString, facilityMaintenanceActionIdFromString, facilityMaintenanceNeedIdFromString, facilityNameRecordIdFromString, facilityOperationalIncidentIdFromString, facilityOperatorAssignmentIdFromString, facilityOrganizationRelationshipIdFromString, facilityOwnershipInterestIdFromString, facilityStatusRecordIdFromString, facilityTeamRelationshipIdFromString, facilityUsageRightIdFromString, financialAccountIdFromString, financialCommitmentIdFromString, financialEntitlementIdFromString, financialTransactionIdFromString, fiscalPeriodIdFromString, investorInterestIdFromString, multiClubOwnershipPolicyIdFromString, organizationCapitalRaiseIdFromString, organizationIdFromString, organizationInvestmentProposalIdFromString, organizationOwnershipTransactionIdFromString, personIdFromString, organizationStructuralChangeIdFromString, organizationLifecycleStateIdFromString, organizationSuccessionIdFromString, placeIdFromString, receivableIdFromString, payableIdFromString, regulatoryOrderIdFromString, regulatoryRemediationPlanIdFromString, organizationLicenseIdFromString, revenueRecognitionIdFromString, seasonIdFromString, treasurySettlementIdFromString, contractIdFromString, teamIdFromString, organizationSectionIdFromString } from '@/domain/ids'
import {
  deserializeGameWorldSave as deserializeLegacyGameWorldSave,
  deserializeGameWorldV3,
  serializeGameWorldV3,
  type GameWorldSaveV3,
  type SaveGameEnvelopeV3,
} from './GameWorldSaveV3'

export interface WorldDbCompetitionRuntimeSaveV4 {
  readonly competitionRuntimeBundle: {
    readonly contentId: string
    readonly contentHash: string
    readonly worldDbSchema: string
  } | null
  readonly competitionPlanIds: readonly string[]
  readonly competitionSeasonIds: readonly string[]
}

export interface WorldAnnualDevelopmentCycleSaveV4 {
  readonly lastAppliedCycleId: string | null
}

/** Save V4 persists the minimal World DB competition runtime projection. */
export interface GameWorldSaveV4 extends GameWorldSaveV3 {
  readonly worldDbCompetitionRuntime: WorldDbCompetitionRuntimeSaveV4
  readonly worldAnnualDevelopmentCycle: WorldAnnualDevelopmentCycleSaveV4
  readonly organizations: readonly Organization[]
  readonly organizationSections: readonly OrganizationSection[]
  readonly organizationOwnership: readonly OrganizationOwnership[]
  readonly organizationControl: readonly OrganizationControl[]
  readonly organizationOwnershipTransactions: readonly OrganizationOwnershipTransaction[]
  readonly organizationOwnershipTransactionEvents: readonly OrganizationOwnershipTransactionEvent[]
  readonly organizationInvestorInterests: readonly OrganizationInvestorInterest[]
  readonly organizationCapitalRaises: readonly OrganizationCapitalRaise[]
  readonly organizationCapitalRaiseEvents: readonly OrganizationCapitalRaiseEvent[]
  readonly organizationInvestmentProposals: readonly OrganizationInvestmentProposal[]
  readonly organizationInvestmentProposalEvents: readonly OrganizationInvestmentProposalEvent[]
  readonly multiClubOwnershipPolicies: readonly MultiClubOwnershipPolicy[]
  readonly organizationStructuralChanges: readonly OrganizationStructuralChange[]
  readonly organizationLifecycleStates: readonly OrganizationLifecycleState[]
  readonly organizationSuccessions: readonly OrganizationSuccession[]
  readonly regulatoryOrders: readonly RegulatoryOrder[]
  readonly regulatoryRemediationPlans: readonly RegulatoryRemediationPlan[]
  readonly organizationLicenses: readonly OrganizationLicense[]
  /** CFI2S — Club Facilities & Infrastructure V2. Twelve normalized GameWorld collections, persisted exactly as GameWorld stores them; none are derived/query-time state (see CFI2S certification for the full audit). */
  readonly places: readonly Place[]
  readonly facilities: readonly Facility[]
  readonly facilityComponents: readonly FacilityComponent[]
  readonly facilityNameRecords: readonly FacilityNameRecord[]
  readonly facilityOwnershipInterests: readonly FacilityOwnershipInterest[]
  readonly facilityControlRights: readonly FacilityControlRight[]
  readonly facilityOperatorAssignments: readonly FacilityOperatorAssignment[]
  readonly facilityOrganizationRelationships: readonly FacilityOrganizationRelationship[]
  readonly facilityTeamRelationships: readonly FacilityTeamRelationship[]
  readonly facilityUsageRights: readonly FacilityUsageRight[]
  readonly facilityCompetitionApprovals: readonly FacilityCompetitionApproval[]
  readonly facilityStatusRecords: readonly FacilityStatusRecord[]
  /** CFI4 — Condition, Standard & Serviceability. Additive to the twelve CFI2S collections above. */
  readonly facilityComponentConditionRecords: readonly FacilityComponentConditionRecord[]
  readonly facilityConditionRecords: readonly FacilityConditionRecord[]
  /** CFI5 — Operations, Maintenance & Deterioration. Additive canonical world truth only: maintenance needs, actions, inspections and incidents. Readiness summaries and deterioration calculations are query-time and never persisted. */
  readonly facilityMaintenanceNeeds: readonly FacilityMaintenanceNeed[]
  readonly facilityMaintenanceActions: readonly FacilityMaintenanceAction[]
  readonly facilityInspections: readonly FacilityInspection[]
  readonly facilityOperationalIncidents: readonly FacilityOperationalIncident[]
  /** CFI6 — Construction, Renovation & Development Projects. Additive canonical world truth only: the project and phase entities themselves. Outcomes/summaries are command-return-value-only and never persisted. */
  readonly facilityDevelopmentProjects: readonly FacilityDevelopmentProject[]
  readonly facilityDevelopmentProjectPhases: readonly FacilityDevelopmentProjectPhase[]
  readonly financialAccounts?: readonly FinancialAccount[]
  readonly financialTransactions?: readonly FinancialTransaction[]
  readonly fiscalPeriods?: readonly FiscalPeriod[]
  readonly organizationFinancialProfiles?: readonly OrganizationFinancialProfile[]
  readonly receivables?: readonly Receivable[]
  readonly payables?: readonly Payable[]
  readonly treasuryApplications?: readonly TreasurySettlement[]
  readonly revenueRecognitions?: readonly RevenueRecognition[]
  readonly expenseRecognitions?: readonly ExpenseRecognition[]
  readonly financialCommitments?: readonly FinancialCommitment[]
  readonly financialEntitlements?: readonly FinancialEntitlement[]
  readonly revenueSources?: readonly RevenueSource[]
  readonly operatingCostSources?: readonly OperatingCostSource[]
  readonly operatingCostFacts?: readonly AuthorizedOperatingCostFact[]
  readonly debtInstruments?: readonly DebtInstrument[]
  readonly competitionDistributionFacts?: readonly CompetitionDistributionFact[]
  readonly financialBudgets?: readonly FinancialBudget[]
  readonly budgetLines?: readonly BudgetLine[]
  readonly budgetRevisions?: readonly BudgetRevision[]
  readonly budgetAllocations?: readonly BudgetAllocation[]
  readonly forecastAssumptions?: readonly ForecastAssumption[]
}

export interface SaveGameEnvelopeV4 {
  readonly schemaVersion: 4
  readonly savedAt: string
  readonly payload: GameWorldSaveV4
}

/**
 * V3 owns no World DB competition runtime. Migration validates the canonical V3 payload, preserves
 * every V3 field as-is, and adds the explicit empty V4 runtime projection exactly once.
 */
export function migrateGameWorldSaveV3ToV4(value: SaveGameEnvelopeV3): SaveGameEnvelopeV4 {
  const world = deserializeGameWorldV3(value)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: value.savedAt,
    payload: Object.freeze({
      ...value.payload,
      worldDbCompetitionRuntime: serializeWorldDbCompetitionRuntimeV4(EMPTY_WORLD_DB_COMPETITION_RUNTIME),
      worldAnnualDevelopmentCycle: serializeWorldAnnualDevelopmentCycleV4(EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE),
      organizations: Object.values(world.organizationsById),
      organizationSections: Object.values(world.organizationSectionsById),
      organizationOwnership: [],
      organizationControl: [],
      organizationOwnershipTransactions: [],
      organizationOwnershipTransactionEvents: [],
      organizationInvestorInterests: [],
      organizationCapitalRaises: [],
      organizationCapitalRaiseEvents: [],
      organizationInvestmentProposals: [],
      organizationInvestmentProposalEvents: [],
      multiClubOwnershipPolicies: [],
      organizationStructuralChanges: [], organizationLifecycleStates: [], organizationSuccessions: [], regulatoryOrders: [], regulatoryRemediationPlans: [], organizationLicenses: [],
      places: [], facilities: [], facilityComponents: [], facilityNameRecords: [], facilityOwnershipInterests: [], facilityControlRights: [], facilityOperatorAssignments: [], facilityOrganizationRelationships: [], facilityTeamRelationships: [], facilityUsageRights: [], facilityCompetitionApprovals: [], facilityStatusRecords: [], facilityComponentConditionRecords: [], facilityConditionRecords: [],
      facilityMaintenanceNeeds: [], facilityMaintenanceActions: [], facilityInspections: [], facilityOperationalIncidents: [],
      facilityDevelopmentProjects: [], facilityDevelopmentProjectPhases: [],
    }),
  })
}

export function serializeGameWorldV4(world: GameWorld, savedAt: string): SaveGameEnvelopeV4 {
  const compatibility = serializeGameWorldV3(world, savedAt)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: compatibility.savedAt,
    payload: Object.freeze({
      ...compatibility.payload,
      worldDbCompetitionRuntime: serializeWorldDbCompetitionRuntimeV4(
        world.worldDbCompetitionRuntime ?? EMPTY_WORLD_DB_COMPETITION_RUNTIME,
      ),
      worldAnnualDevelopmentCycle: serializeWorldAnnualDevelopmentCycleV4(
        world.worldAnnualDevelopmentCycle ?? EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE,
      ),
      organizations: Object.values(world.organizationsById),
      organizationSections: Object.values(world.organizationSectionsById),
      organizationOwnership: Object.values(world.organizationOwnershipById),
      organizationControl: Object.values(world.organizationControlById),
      organizationOwnershipTransactions: Object.values(world.organizationOwnershipTransactionsById),
      organizationOwnershipTransactionEvents: Object.values(world.organizationOwnershipTransactionEventsById),
      organizationInvestorInterests: Object.values(world.organizationInvestorInterestsById),
      organizationCapitalRaises: Object.values(world.organizationCapitalRaisesById),
      organizationCapitalRaiseEvents: Object.values(world.organizationCapitalRaiseEventsById),
      organizationInvestmentProposals: Object.values(world.organizationInvestmentProposalsById),
      organizationInvestmentProposalEvents: Object.values(world.organizationInvestmentProposalEventsById),
      multiClubOwnershipPolicies: Object.values(world.multiClubOwnershipPoliciesById),
      organizationStructuralChanges: Object.values(world.organizationStructuralChangesById), organizationLifecycleStates: Object.values(world.organizationLifecycleStatesById), organizationSuccessions: Object.values(world.organizationSuccessionsById), regulatoryOrders: Object.values(world.regulatoryOrdersById), regulatoryRemediationPlans: Object.values(world.regulatoryRemediationPlansById), organizationLicenses: Object.values(world.organizationLicensesById),
      places: Object.values(world.placesById), facilities: Object.values(world.facilitiesById), facilityComponents: Object.values(world.facilityComponentsById), facilityNameRecords: Object.values(world.facilityNameRecordsById), facilityOwnershipInterests: Object.values(world.facilityOwnershipInterestsById), facilityControlRights: Object.values(world.facilityControlRightsById), facilityOperatorAssignments: Object.values(world.facilityOperatorAssignmentsById), facilityOrganizationRelationships: Object.values(world.facilityOrganizationRelationshipsById), facilityTeamRelationships: Object.values(world.facilityTeamRelationshipsById), facilityUsageRights: Object.values(world.facilityUsageRightsById), facilityCompetitionApprovals: Object.values(world.facilityCompetitionApprovalsById), facilityStatusRecords: Object.values(world.facilityStatusRecordsById), facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById), facilityConditionRecords: Object.values(world.facilityConditionRecordsById),
      facilityMaintenanceNeeds: Object.values(world.facilityMaintenanceNeedsById), facilityMaintenanceActions: Object.values(world.facilityMaintenanceActionsById), facilityInspections: Object.values(world.facilityInspectionsById), facilityOperationalIncidents: Object.values(world.facilityOperationalIncidentsById),
      facilityDevelopmentProjects: Object.values(world.facilityDevelopmentProjectsById), facilityDevelopmentProjectPhases: Object.values(world.facilityDevelopmentProjectPhasesById),
      financialAccounts: Object.values(world.financialAccountsById), financialTransactions: Object.values(world.financialTransactionsById), fiscalPeriods: Object.values(world.fiscalPeriodsById), organizationFinancialProfiles: Object.values(world.organizationFinancialProfilesById),
      receivables: Object.values(world.receivablesById), payables: Object.values(world.payablesById), treasuryApplications: Object.values(world.treasuryApplicationsById),
      revenueRecognitions: Object.values(world.revenueRecognitionsById), expenseRecognitions: Object.values(world.expenseRecognitionsById), financialCommitments: Object.values(world.financialCommitmentsById), financialEntitlements: Object.values(world.financialEntitlementsById),
      financialBudgets: Object.values(world.financialBudgetsById), budgetLines: Object.values(world.budgetLinesById), budgetRevisions: Object.values(world.budgetRevisionsById), budgetAllocations: Object.values(world.budgetAllocationsById), forecastAssumptions: Object.values(world.forecastAssumptionsById),
      revenueSources: Object.values(world.revenueSourcesById),
      operatingCostSources: Object.values(world.operatingCostSourcesById), operatingCostFacts: Object.values(world.operatingCostFactsById),
      debtInstruments: Object.values(world.debtInstrumentsById), competitionDistributionFacts: Object.values(world.competitionDistributionFactsById),
    }),
  })
}

export function deserializeGameWorldV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save V4 file')
  exactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V4 envelope')
  if (envelope.schemaVersion !== 4) throw new Error('Unsupported save version')
  const savedAt = isoTimestamp(envelope.savedAt, 'Save V4 savedAt')
  const payload = record(envelope.payload, 'Save V4 payload')
  const runtime = parseWorldDbCompetitionRuntimeV4(payload.worldDbCompetitionRuntime)
  const developmentCycle = parseWorldAnnualDevelopmentCycleV4(payload.worldAnnualDevelopmentCycle)
  const hasOrganizations = Object.prototype.hasOwnProperty.call(payload, 'organizations')
  const hasOrganizationSections = Object.prototype.hasOwnProperty.call(payload, 'organizationSections')
  const ownership = Object.prototype.hasOwnProperty.call(payload, 'organizationOwnership')
    ? parseOrganizationOwnership(payload.organizationOwnership)
    : []
  const control = Object.prototype.hasOwnProperty.call(payload, 'organizationControl')
    ? parseOrganizationControl(payload.organizationControl)
    : []
  const transactions = Object.prototype.hasOwnProperty.call(payload, 'organizationOwnershipTransactions')
    ? parseOrganizationOwnershipTransactions(payload.organizationOwnershipTransactions)
    : []
  const transactionEvents = Object.prototype.hasOwnProperty.call(payload, 'organizationOwnershipTransactionEvents')
    ? parseOrganizationOwnershipTransactionEvents(payload.organizationOwnershipTransactionEvents)
    : []
  const investorInterests = Object.prototype.hasOwnProperty.call(payload, 'organizationInvestorInterests')
    ? parseOrganizationInvestorInterests(payload.organizationInvestorInterests)
    : []
  const capitalRaises = Object.prototype.hasOwnProperty.call(payload, 'organizationCapitalRaises')
    ? parseOrganizationCapitalRaises(payload.organizationCapitalRaises)
    : []
  const capitalRaiseEvents = Object.prototype.hasOwnProperty.call(payload, 'organizationCapitalRaiseEvents')
    ? parseOrganizationCapitalRaiseEvents(payload.organizationCapitalRaiseEvents)
    : []
  const investmentProposals = Object.prototype.hasOwnProperty.call(payload, 'organizationInvestmentProposals')
    ? parseOrganizationInvestmentProposals(payload.organizationInvestmentProposals)
    : []
  const investmentProposalEvents = Object.prototype.hasOwnProperty.call(payload, 'organizationInvestmentProposalEvents')
    ? parseOrganizationInvestmentProposalEvents(payload.organizationInvestmentProposalEvents)
    : []
  const multiClubOwnershipPolicies = Object.prototype.hasOwnProperty.call(payload, 'multiClubOwnershipPolicies')
    ? parseMultiClubOwnershipPolicies(payload.multiClubOwnershipPolicies)
    : []
  const organizationStructuralChanges = Object.prototype.hasOwnProperty.call(payload, 'organizationStructuralChanges') ? parseOrganizationStructuralChanges(payload.organizationStructuralChanges) : []
  const organizationLifecycleStates = Object.prototype.hasOwnProperty.call(payload, 'organizationLifecycleStates') ? parseOrganizationLifecycleStates(payload.organizationLifecycleStates) : []
  const organizationSuccessions = Object.prototype.hasOwnProperty.call(payload, 'organizationSuccessions') ? parseOrganizationSuccessions(payload.organizationSuccessions) : []
  const regulatoryOrders = Object.prototype.hasOwnProperty.call(payload, 'regulatoryOrders') ? parseRegulatoryOrders(payload.regulatoryOrders) : []
  const regulatoryRemediationPlans = Object.prototype.hasOwnProperty.call(payload, 'regulatoryRemediationPlans') ? parseRegulatoryRemediationPlans(payload.regulatoryRemediationPlans) : []
  const organizationLicenses = Object.prototype.hasOwnProperty.call(payload, 'organizationLicenses') ? parseOrganizationLicenses(payload.organizationLicenses) : []
  const places = Object.prototype.hasOwnProperty.call(payload, 'places') ? parsePlaces(payload.places) : []
  const facilities = Object.prototype.hasOwnProperty.call(payload, 'facilities') ? parseFacilities(payload.facilities) : []
  const facilityComponents = Object.prototype.hasOwnProperty.call(payload, 'facilityComponents') ? parseFacilityComponents(payload.facilityComponents) : []
  const facilityNameRecords = Object.prototype.hasOwnProperty.call(payload, 'facilityNameRecords') ? parseFacilityNameRecords(payload.facilityNameRecords) : []
  const facilityOwnershipInterests = Object.prototype.hasOwnProperty.call(payload, 'facilityOwnershipInterests') ? parseFacilityOwnershipInterests(payload.facilityOwnershipInterests) : []
  const facilityControlRights = Object.prototype.hasOwnProperty.call(payload, 'facilityControlRights') ? parseFacilityControlRights(payload.facilityControlRights) : []
  const facilityOperatorAssignments = Object.prototype.hasOwnProperty.call(payload, 'facilityOperatorAssignments') ? parseFacilityOperatorAssignments(payload.facilityOperatorAssignments) : []
  const facilityOrganizationRelationships = Object.prototype.hasOwnProperty.call(payload, 'facilityOrganizationRelationships') ? parseFacilityOrganizationRelationships(payload.facilityOrganizationRelationships) : []
  const facilityTeamRelationships = Object.prototype.hasOwnProperty.call(payload, 'facilityTeamRelationships') ? parseFacilityTeamRelationships(payload.facilityTeamRelationships) : []
  const facilityUsageRights = Object.prototype.hasOwnProperty.call(payload, 'facilityUsageRights') ? parseFacilityUsageRights(payload.facilityUsageRights) : []
  const facilityCompetitionApprovals = Object.prototype.hasOwnProperty.call(payload, 'facilityCompetitionApprovals') ? parseFacilityCompetitionApprovals(payload.facilityCompetitionApprovals) : []
  const facilityStatusRecords = Object.prototype.hasOwnProperty.call(payload, 'facilityStatusRecords') ? parseFacilityStatusRecords(payload.facilityStatusRecords) : []
  const facilityComponentConditionRecords = Object.prototype.hasOwnProperty.call(payload, 'facilityComponentConditionRecords') ? parseFacilityComponentConditionRecords(payload.facilityComponentConditionRecords) : []
  const facilityConditionRecords = Object.prototype.hasOwnProperty.call(payload, 'facilityConditionRecords') ? parseFacilityConditionRecords(payload.facilityConditionRecords) : []
  const facilityMaintenanceNeeds = Object.prototype.hasOwnProperty.call(payload, 'facilityMaintenanceNeeds') ? parseFacilityMaintenanceNeeds(payload.facilityMaintenanceNeeds) : []
  const facilityMaintenanceActions = Object.prototype.hasOwnProperty.call(payload, 'facilityMaintenanceActions') ? parseFacilityMaintenanceActions(payload.facilityMaintenanceActions) : []
  const facilityInspections = Object.prototype.hasOwnProperty.call(payload, 'facilityInspections') ? parseFacilityInspections(payload.facilityInspections) : []
  const facilityOperationalIncidents = Object.prototype.hasOwnProperty.call(payload, 'facilityOperationalIncidents') ? parseFacilityOperationalIncidents(payload.facilityOperationalIncidents) : []
  const facilityDevelopmentProjects = Object.prototype.hasOwnProperty.call(payload, 'facilityDevelopmentProjects') ? parseFacilityDevelopmentProjects(payload.facilityDevelopmentProjects) : []
  const facilityDevelopmentProjectPhases = Object.prototype.hasOwnProperty.call(payload, 'facilityDevelopmentProjectPhases') ? parseFacilityDevelopmentProjectPhases(payload.facilityDevelopmentProjectPhases) : []
  const financialAccounts = Object.prototype.hasOwnProperty.call(payload, 'financialAccounts') ? parseFinancialAccounts(payload.financialAccounts) : []
  const financialTransactions = Object.prototype.hasOwnProperty.call(payload, 'financialTransactions') ? parseFinancialTransactions(payload.financialTransactions) : []
  const fiscalPeriods = Object.prototype.hasOwnProperty.call(payload, 'fiscalPeriods') ? parseFiscalPeriods(payload.fiscalPeriods) : []
  const organizationFinancialProfiles = Object.prototype.hasOwnProperty.call(payload, 'organizationFinancialProfiles') ? parseOrganizationFinancialProfiles(payload.organizationFinancialProfiles) : []
  const receivables = Object.prototype.hasOwnProperty.call(payload, 'receivables') ? parseReceivables(payload.receivables) : []
  const payables = Object.prototype.hasOwnProperty.call(payload, 'payables') ? parsePayables(payload.payables) : []
  const treasuryApplications = Object.prototype.hasOwnProperty.call(payload, 'treasuryApplications') ? parseTreasurySettlements(payload.treasuryApplications) : []
  const revenueRecognitions = Object.prototype.hasOwnProperty.call(payload, 'revenueRecognitions') ? parseRevenueRecognitions(payload.revenueRecognitions) : []
  const expenseRecognitions = Object.prototype.hasOwnProperty.call(payload, 'expenseRecognitions') ? parseExpenseRecognitions(payload.expenseRecognitions) : []
  const financialCommitments = Object.prototype.hasOwnProperty.call(payload, 'financialCommitments') ? parseFinancialCommitments(payload.financialCommitments) : []
  const financialEntitlements = Object.prototype.hasOwnProperty.call(payload, 'financialEntitlements') ? parseFinancialEntitlements(payload.financialEntitlements) : []
  const revenueSources = Object.prototype.hasOwnProperty.call(payload, 'revenueSources') ? parseRevenueSources(payload.revenueSources) : []
  const operatingCostSources = Object.prototype.hasOwnProperty.call(payload, 'operatingCostSources') ? parseOperatingCostSources(payload.operatingCostSources) : []
  const operatingCostFacts = Object.prototype.hasOwnProperty.call(payload, 'operatingCostFacts') ? parseOperatingCostFacts(payload.operatingCostFacts) : []
  const debtInstruments = Object.prototype.hasOwnProperty.call(payload, 'debtInstruments') ? parseDebtInstruments(payload.debtInstruments) : []
  const competitionDistributionFacts = Object.prototype.hasOwnProperty.call(payload, 'competitionDistributionFacts') ? parseCompetitionDistributionFacts(payload.competitionDistributionFacts) : []
  const financialBudgets = Object.prototype.hasOwnProperty.call(payload, 'financialBudgets') ? parseFinancialBudgets(payload.financialBudgets) : []
  const budgetLines = Object.prototype.hasOwnProperty.call(payload, 'budgetLines') ? parseBudgetLines(payload.budgetLines) : []
  const budgetRevisions = Object.prototype.hasOwnProperty.call(payload, 'budgetRevisions') ? parseBudgetRevisions(payload.budgetRevisions) : []
  const budgetAllocations = Object.prototype.hasOwnProperty.call(payload, 'budgetAllocations') ? parseBudgetAllocations(payload.budgetAllocations) : []
  const forecastAssumptions = Object.prototype.hasOwnProperty.call(payload, 'forecastAssumptions') ? parseForecastAssumptions(payload.forecastAssumptions) : []
  if (hasOrganizations !== hasOrganizationSections) throw new TypeError('Save V4 Organization and OrganizationSection records must be stored together')
  const organizations = hasOrganizations ? parseOrganizations(payload.organizations) : undefined
  const organizationSections = hasOrganizationSections ? parseOrganizationSections(payload.organizationSections) : undefined
  const { worldDbCompetitionRuntime: _runtime, worldAnnualDevelopmentCycle: _cycle, organizations: _organizations, organizationSections: _sections, organizationOwnership: _ownership, organizationControl: _control, organizationOwnershipTransactions: _transactions, organizationOwnershipTransactionEvents: _transactionEvents, organizationInvestorInterests: _investorInterests, organizationCapitalRaises: _capitalRaises, organizationCapitalRaiseEvents: _capitalRaiseEvents, organizationInvestmentProposals: _investmentProposals, organizationInvestmentProposalEvents: _investmentProposalsEvents, multiClubOwnershipPolicies: _multiClubOwnershipPolicies, organizationStructuralChanges: _structuralChanges, organizationLifecycleStates: _lifecycleStates, organizationSuccessions: _successions, regulatoryOrders: _orders, regulatoryRemediationPlans: _remediationPlans, organizationLicenses: _licenses, financialAccounts: _financialAccounts, financialTransactions: _financialTransactions, fiscalPeriods: _fiscalPeriods, organizationFinancialProfiles: _organizationFinancialProfiles, receivables: _receivables, payables: _payables, treasuryApplications: _treasuryApplications, revenueRecognitions: _revenueRecognitions, expenseRecognitions: _expenseRecognitions, financialCommitments: _financialCommitments, financialEntitlements: _financialEntitlements, revenueSources: _revenueSources, operatingCostSources: _operatingCostSources, operatingCostFacts: _operatingCostFacts, debtInstruments: _debtInstruments, competitionDistributionFacts: _competitionDistributionFacts, financialBudgets: _financialBudgets, budgetLines: _budgetLines, budgetRevisions: _budgetRevisions, budgetAllocations: _budgetAllocations, forecastAssumptions: _forecastAssumptions, ...compatibilityPayload } = payload
  const world = deserializeGameWorldV3({
    schemaVersion: 3,
    savedAt,
    payload: compatibilityPayload as unknown as GameWorldSaveV3,
  })
  const withOrganizations = organizations === undefined || organizationSections === undefined
    ? world
    : updateGameWorld(world, { organizations, organizationSections })
  const withOwnership = updateGameWorld(withOrganizations, { organizationOwnership: ownership, organizationControl: control })
  const withTransactions = updateGameWorld(withOwnership, { organizationOwnershipTransactions: transactions, organizationOwnershipTransactionEvents: transactionEvents })
  const withInvestments = updateGameWorld(withTransactions, { organizationInvestorInterests: investorInterests, organizationCapitalRaises: capitalRaises, organizationCapitalRaiseEvents: capitalRaiseEvents, organizationInvestmentProposals: investmentProposals, organizationInvestmentProposalEvents: investmentProposalEvents })
  const withPolicies = updateGameWorld(withInvestments, { multiClubOwnershipPolicies })
  const withStructuralRegulation = updateGameWorld(withPolicies, { organizationStructuralChanges, organizationLifecycleStates, organizationSuccessions, regulatoryOrders, regulatoryRemediationPlans, organizationLicenses })
  const withFacilities = updateGameWorld(withStructuralRegulation, { places, facilities, facilityComponents, facilityNameRecords, facilityOwnershipInterests, facilityControlRights, facilityOperatorAssignments, facilityOrganizationRelationships, facilityTeamRelationships, facilityUsageRights, facilityCompetitionApprovals, facilityStatusRecords, facilityComponentConditionRecords, facilityConditionRecords })
  const withFacilityOperations = updateGameWorld(withFacilities, { facilityMaintenanceNeeds, facilityMaintenanceActions, facilityInspections, facilityOperationalIncidents })
  const withFacilityDevelopment = updateGameWorld(withFacilityOperations, { facilityDevelopmentProjects, facilityDevelopmentProjectPhases })
  return Object.freeze({ ...attachWorldDbCompetitionRuntime(withFacilityDevelopment, runtime), worldAnnualDevelopmentCycle: developmentCycle })
  const withFinance = updateGameWorld(withStructuralRegulation, { financialAccounts, financialTransactions, fiscalPeriods, organizationFinancialProfiles, receivables, payables, treasuryApplications, revenueRecognitions, expenseRecognitions, financialCommitments, financialEntitlements, revenueSources, operatingCostSources, operatingCostFacts, debtInstruments, competitionDistributionFacts, financialBudgets, budgetLines, budgetRevisions, budgetAllocations, forecastAssumptions })
  return Object.freeze({ ...attachWorldDbCompetitionRuntime(withFinance, runtime), worldAnnualDevelopmentCycle: developmentCycle })
}

/** Reads V1-V4. Legacy saves normalize the V4-owned runtime projection to empty state. */
export function deserializeGameWorldSaveV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save file')
  if (envelope.schemaVersion === 4) return deserializeGameWorldV4(value)
  return Object.freeze({
    ...attachWorldDbCompetitionRuntime(deserializeLegacyGameWorldSave(value), EMPTY_WORLD_DB_COMPETITION_RUNTIME),
    worldAnnualDevelopmentCycle: EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE,
  })
}

function parseOrganizations(value: unknown): readonly Organization[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizations must be an array')
  return Object.freeze(value.map((entry) => {
    const organization = record(entry, 'Save V4 Organization')
    exactKeys(organization, ['id', 'entityId', 'legalName', 'foundedYear', 'dissolvedYear', 'primaryPlaceId', 'website'], 'Save V4 Organization')
    return createOrganization({ id: nonEmptyText(organization.id, 'Save V4 Organization id') as Organization['id'], entityId: nullableText(organization.entityId, 'Save V4 Organization entityId'), legalName: nullableText(organization.legalName, 'Save V4 Organization legalName'), foundedYear: nullableInteger(organization.foundedYear, 'Save V4 Organization foundedYear'), dissolvedYear: nullableInteger(organization.dissolvedYear, 'Save V4 Organization dissolvedYear'), primaryPlaceId: nullableText(organization.primaryPlaceId, 'Save V4 Organization primaryPlaceId'), website: nullableText(organization.website, 'Save V4 Organization website') })
  }))
}

function parseOrganizationSections(value: unknown): readonly OrganizationSection[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationSections must be an array')
  return Object.freeze(value.map((entry) => {
    const section = record(entry, 'Save V4 OrganizationSection')
    exactKeys(section, ['id', 'organizationId', 'sport', 'gender', 'categoryScope', 'canonicalName', 'validFrom', 'validTo'], 'Save V4 OrganizationSection')
    return createOrganizationSection({ id: nonEmptyText(section.id, 'Save V4 OrganizationSection id') as OrganizationSection['id'], organizationId: nonEmptyText(section.organizationId, 'Save V4 OrganizationSection organizationId') as OrganizationSection['organizationId'], sport: nullableText(section.sport, 'Save V4 OrganizationSection sport'), gender: nullableText(section.gender, 'Save V4 OrganizationSection gender'), categoryScope: nullableText(section.categoryScope, 'Save V4 OrganizationSection categoryScope'), canonicalName: nonEmptyText(section.canonicalName, 'Save V4 OrganizationSection canonicalName'), validFrom: nullableText(section.validFrom, 'Save V4 OrganizationSection validFrom'), validTo: nullableText(section.validTo, 'Save V4 OrganizationSection validTo') })
  }))
}

function parseOrganizationOwnership(value: unknown): readonly OrganizationOwnership[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationOwnership must be an array')
  return Object.freeze(value.map((entry) => {
    const ownership = record(entry, 'Save V4 OrganizationOwnership')
    exactKeys(ownership, ['id', 'organizationId', 'owner', 'ownershipPercentage', 'validFrom', 'validTo'], 'Save V4 OrganizationOwnership')
    return createOrganizationOwnership({
      id: nonEmptyText(ownership.id, 'Save V4 OrganizationOwnership id'),
      organizationId: nonEmptyText(ownership.organizationId, 'Save V4 OrganizationOwnership organizationId'),
      owner: parseOrganizationOwnershipActor(ownership.owner, 'Save V4 OrganizationOwnership owner'),
      ownershipPercentage: nullableNumber(ownership.ownershipPercentage, 'Save V4 OrganizationOwnership ownershipPercentage'),
      validFrom: nullableText(ownership.validFrom, 'Save V4 OrganizationOwnership validFrom'),
      validTo: nullableText(ownership.validTo, 'Save V4 OrganizationOwnership validTo'),
    })
  }))
}

function parseOrganizationControl(value: unknown): readonly OrganizationControl[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationControl must be an array')
  return Object.freeze(value.map((entry) => {
    const control = record(entry, 'Save V4 OrganizationControl')
    exactKeys(control, ['id', 'organizationId', 'controller', 'validFrom', 'validTo'], 'Save V4 OrganizationControl')
    return createOrganizationControl({
      id: nonEmptyText(control.id, 'Save V4 OrganizationControl id'),
      organizationId: nonEmptyText(control.organizationId, 'Save V4 OrganizationControl organizationId'),
      controller: parseOrganizationOwnershipActor(control.controller, 'Save V4 OrganizationControl controller'),
      validFrom: nullableText(control.validFrom, 'Save V4 OrganizationControl validFrom'),
      validTo: nullableText(control.validTo, 'Save V4 OrganizationControl validTo'),
    })
  }))
}

function parseOrganizationOwnershipTransactions(value: unknown): readonly OrganizationOwnershipTransaction[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationOwnershipTransactions must be an array')
  return Object.freeze(value.map((entry) => {
    const transaction = record(entry, 'Save V4 OrganizationOwnershipTransaction')
    exactKeys(transaction, transaction.governanceDecisionId === undefined ? ['id', 'organizationId', 'seller', 'buyer', 'transferredPercentage', 'agreedOn', 'consideration'] : ['id', 'organizationId', 'seller', 'buyer', 'transferredPercentage', 'agreedOn', 'consideration', 'governanceDecisionId'], 'Save V4 OrganizationOwnershipTransaction')
    return createOrganizationOwnershipTransaction({
      id: organizationOwnershipTransactionIdFromString(nonEmptyText(transaction.id, 'Save V4 OrganizationOwnershipTransaction id')),
      organizationId: nonEmptyText(transaction.organizationId, 'Save V4 OrganizationOwnershipTransaction organizationId'),
      seller: parseOrganizationOwnershipActor(transaction.seller, 'Save V4 OrganizationOwnershipTransaction seller'),
      buyer: parseOrganizationOwnershipActor(transaction.buyer, 'Save V4 OrganizationOwnershipTransaction buyer'),
      transferredPercentage: number(transaction.transferredPercentage, 'Save V4 OrganizationOwnershipTransaction transferredPercentage'),
      agreedOn: nonEmptyText(transaction.agreedOn, 'Save V4 OrganizationOwnershipTransaction agreedOn'),
      consideration: parseConsideration(transaction.consideration),
      ...(transaction.governanceDecisionId === undefined ? {} : { governanceDecisionId: nonEmptyText(transaction.governanceDecisionId, 'Save V4 OrganizationOwnershipTransaction governanceDecisionId') }),
    })
  }))
}

function parseOrganizationOwnershipTransactionEvents(value: unknown): readonly OrganizationOwnershipTransactionEvent[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationOwnershipTransactionEvents must be an array')
  return Object.freeze(value.map((entry) => {
    const event = record(entry, 'Save V4 OrganizationOwnershipTransactionEvent')
    exactKeys(event, event.governanceDecisionId === undefined ? ['id', 'transactionId', 'kind', 'effectiveOn'] : ['id', 'transactionId', 'kind', 'effectiveOn', 'governanceDecisionId'], 'Save V4 OrganizationOwnershipTransactionEvent')
    return createOrganizationOwnershipTransactionEvent({
      id: nonEmptyText(event.id, 'Save V4 OrganizationOwnershipTransactionEvent id'),
      transactionId: organizationOwnershipTransactionIdFromString(nonEmptyText(event.transactionId, 'Save V4 OrganizationOwnershipTransactionEvent transactionId')),
      kind: event.kind as OrganizationOwnershipTransactionEvent['kind'],
      effectiveOn: nonEmptyText(event.effectiveOn, 'Save V4 OrganizationOwnershipTransactionEvent effectiveOn'),
      ...(event.governanceDecisionId === undefined ? {} : { governanceDecisionId: nonEmptyText(event.governanceDecisionId, 'Save V4 OrganizationOwnershipTransactionEvent governanceDecisionId') }),
    })
  }))
}

function parseOrganizationInvestorInterests(value: unknown): readonly OrganizationInvestorInterest[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationInvestorInterests must be an array')
  return Object.freeze(value.map((entry) => {
    const interest = record(entry, 'Save V4 OrganizationInvestorInterest')
    exactKeys(interest, ['id', 'organizationId', 'investor', 'interestType', 'status', 'openedOn', 'closedOn'], 'Save V4 OrganizationInvestorInterest')
    return createOrganizationInvestorInterest({
      id: investorInterestIdFromString(nonEmptyText(interest.id, 'Save V4 OrganizationInvestorInterest id')),
      organizationId: organizationIdFromString(nonEmptyText(interest.organizationId, 'Save V4 OrganizationInvestorInterest organizationId')),
      investor: parseOrganizationOwnershipActor(interest.investor, 'Save V4 OrganizationInvestorInterest investor'),
      interestType: nonEmptyText(interest.interestType, 'Save V4 OrganizationInvestorInterest interestType'),
      status: nullableText(interest.status, 'Save V4 OrganizationInvestorInterest status'),
      openedOn: nullableText(interest.openedOn, 'Save V4 OrganizationInvestorInterest openedOn'),
      closedOn: nullableText(interest.closedOn, 'Save V4 OrganizationInvestorInterest closedOn'),
    })
  }))
}

function parseOrganizationCapitalRaises(value: unknown): readonly OrganizationCapitalRaise[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationCapitalRaises must be an array')
  return Object.freeze(value.map((entry) => {
    const raise = record(entry, 'Save V4 OrganizationCapitalRaise')
    exactKeys(raise, raise.governanceDecisionId === undefined ? ['id', 'organizationId', 'openedOn', 'targetAmount', 'currencyCode', 'maximumEquityPercentage'] : ['id', 'organizationId', 'openedOn', 'targetAmount', 'currencyCode', 'maximumEquityPercentage', 'governanceDecisionId'], 'Save V4 OrganizationCapitalRaise')
    return createOrganizationCapitalRaise({
      id: organizationCapitalRaiseIdFromString(nonEmptyText(raise.id, 'Save V4 OrganizationCapitalRaise id')),
      organizationId: organizationIdFromString(nonEmptyText(raise.organizationId, 'Save V4 OrganizationCapitalRaise organizationId')),
      openedOn: nonEmptyText(raise.openedOn, 'Save V4 OrganizationCapitalRaise openedOn'),
      targetAmount: number(raise.targetAmount, 'Save V4 OrganizationCapitalRaise targetAmount'),
      currencyCode: nonEmptyText(raise.currencyCode, 'Save V4 OrganizationCapitalRaise currencyCode'),
      maximumEquityPercentage: number(raise.maximumEquityPercentage, 'Save V4 OrganizationCapitalRaise maximumEquityPercentage'),
      ...(raise.governanceDecisionId === undefined ? {} : { governanceDecisionId: nonEmptyText(raise.governanceDecisionId, 'Save V4 OrganizationCapitalRaise governanceDecisionId') }),
    })
  }))
}

function parseOrganizationCapitalRaiseEvents(value: unknown): readonly OrganizationCapitalRaiseEvent[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationCapitalRaiseEvents must be an array')
  return Object.freeze(value.map((entry) => {
    const event = record(entry, 'Save V4 OrganizationCapitalRaiseEvent')
    exactKeys(event, event.governanceDecisionId === undefined ? ['id', 'capitalRaiseId', 'kind', 'effectiveOn'] : ['id', 'capitalRaiseId', 'kind', 'effectiveOn', 'governanceDecisionId'], 'Save V4 OrganizationCapitalRaiseEvent')
    return createOrganizationCapitalRaiseEvent({
      id: nonEmptyText(event.id, 'Save V4 OrganizationCapitalRaiseEvent id'),
      capitalRaiseId: organizationCapitalRaiseIdFromString(nonEmptyText(event.capitalRaiseId, 'Save V4 OrganizationCapitalRaiseEvent capitalRaiseId')),
      kind: event.kind as OrganizationCapitalRaiseEvent['kind'],
      effectiveOn: nonEmptyText(event.effectiveOn, 'Save V4 OrganizationCapitalRaiseEvent effectiveOn'),
      ...(event.governanceDecisionId === undefined ? {} : { governanceDecisionId: nonEmptyText(event.governanceDecisionId, 'Save V4 OrganizationCapitalRaiseEvent governanceDecisionId') }),
    })
  }))
}

function parseOrganizationInvestmentProposals(value: unknown): readonly OrganizationInvestmentProposal[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationInvestmentProposals must be an array')
  return Object.freeze(value.map((entry) => {
    const proposal = record(entry, 'Save V4 OrganizationInvestmentProposal')
    exactKeys(proposal, proposal.governanceDecisionId === undefined ? ['id', 'capitalRaiseId', 'investor', 'amount', 'currencyCode', 'requestedEquityPercentage', 'proposedOn'] : ['id', 'capitalRaiseId', 'investor', 'amount', 'currencyCode', 'requestedEquityPercentage', 'proposedOn', 'governanceDecisionId'], 'Save V4 OrganizationInvestmentProposal')
    return createOrganizationInvestmentProposal({
      id: organizationInvestmentProposalIdFromString(nonEmptyText(proposal.id, 'Save V4 OrganizationInvestmentProposal id')),
      capitalRaiseId: organizationCapitalRaiseIdFromString(nonEmptyText(proposal.capitalRaiseId, 'Save V4 OrganizationInvestmentProposal capitalRaiseId')),
      investor: parseOrganizationOwnershipActor(proposal.investor, 'Save V4 OrganizationInvestmentProposal investor'),
      amount: number(proposal.amount, 'Save V4 OrganizationInvestmentProposal amount'),
      currencyCode: nonEmptyText(proposal.currencyCode, 'Save V4 OrganizationInvestmentProposal currencyCode'),
      requestedEquityPercentage: number(proposal.requestedEquityPercentage, 'Save V4 OrganizationInvestmentProposal requestedEquityPercentage'),
      proposedOn: nonEmptyText(proposal.proposedOn, 'Save V4 OrganizationInvestmentProposal proposedOn'),
      ...(proposal.governanceDecisionId === undefined ? {} : { governanceDecisionId: nonEmptyText(proposal.governanceDecisionId, 'Save V4 OrganizationInvestmentProposal governanceDecisionId') }),
    })
  }))
}

function parseOrganizationInvestmentProposalEvents(value: unknown): readonly OrganizationInvestmentProposalEvent[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationInvestmentProposalEvents must be an array')
  return Object.freeze(value.map((entry) => {
    const event = record(entry, 'Save V4 OrganizationInvestmentProposalEvent')
    exactKeys(event, event.governanceDecisionId === undefined ? ['id', 'proposalId', 'kind', 'effectiveOn'] : ['id', 'proposalId', 'kind', 'effectiveOn', 'governanceDecisionId'], 'Save V4 OrganizationInvestmentProposalEvent')
    return createOrganizationInvestmentProposalEvent({
      id: nonEmptyText(event.id, 'Save V4 OrganizationInvestmentProposalEvent id'),
      proposalId: organizationInvestmentProposalIdFromString(nonEmptyText(event.proposalId, 'Save V4 OrganizationInvestmentProposalEvent proposalId')),
      kind: event.kind as OrganizationInvestmentProposalEvent['kind'],
      effectiveOn: nonEmptyText(event.effectiveOn, 'Save V4 OrganizationInvestmentProposalEvent effectiveOn'),
      ...(event.governanceDecisionId === undefined ? {} : { governanceDecisionId: nonEmptyText(event.governanceDecisionId, 'Save V4 OrganizationInvestmentProposalEvent governanceDecisionId') }),
    })
  }))
}

function parseMultiClubOwnershipPolicies(value: unknown): readonly MultiClubOwnershipPolicy[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 multiClubOwnershipPolicies must be an array')
  return Object.freeze(value.map((entry) => {
    const policy = record(entry, 'Save V4 MultiClubOwnershipPolicy')
    exactKeys(policy, ['id', 'scope', 'effectiveFrom', 'effectiveTo', 'commonControlRule', 'ownershipThresholdPercentage', 'includeIndirectOwnership', 'enforcement'], 'Save V4 MultiClubOwnershipPolicy')
    const scope = record(policy.scope, 'Save V4 MultiClubOwnershipPolicy scope')
    if (scope.kind === 'COMPETITION') {
      exactKeys(scope, ['kind', 'competitionId'], 'Save V4 MultiClubOwnershipPolicy competition scope')
    } else if (scope.kind === 'ECOSYSTEM') {
      exactKeys(scope, ['kind', 'ecosystemId'], 'Save V4 MultiClubOwnershipPolicy ecosystem scope')
    } else {
      throw new TypeError('Save V4 MultiClubOwnershipPolicy scope kind is invalid')
    }
    return createMultiClubOwnershipPolicy({
      id: multiClubOwnershipPolicyIdFromString(nonEmptyText(policy.id, 'Save V4 MultiClubOwnershipPolicy id')),
      scope: scope.kind === 'COMPETITION'
        ? { kind: 'COMPETITION', competitionId: competitionIdFromString(nonEmptyText(scope.competitionId, 'Save V4 MultiClubOwnershipPolicy competitionId')) }
        : { kind: 'ECOSYSTEM', ecosystemId: ecosystemIdFromString(nonEmptyText(scope.ecosystemId, 'Save V4 MultiClubOwnershipPolicy ecosystemId')) },
      effectiveFrom: nullableText(policy.effectiveFrom, 'Save V4 MultiClubOwnershipPolicy effectiveFrom'),
      effectiveTo: nullableText(policy.effectiveTo, 'Save V4 MultiClubOwnershipPolicy effectiveTo'),
      commonControlRule: policy.commonControlRule as MultiClubOwnershipPolicy['commonControlRule'],
      ownershipThresholdPercentage: policy.ownershipThresholdPercentage === null ? null : number(policy.ownershipThresholdPercentage, 'Save V4 MultiClubOwnershipPolicy ownershipThresholdPercentage'),
      includeIndirectOwnership: boolean(policy.includeIndirectOwnership, 'Save V4 MultiClubOwnershipPolicy includeIndirectOwnership'),
      enforcement: policy.enforcement as MultiClubOwnershipPolicy['enforcement'],
    })
  }))
}

function parseOrganizationStructuralChanges(value: unknown): readonly OrganizationStructuralChange[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationStructuralChanges must be an array')
  return Object.freeze(value.map((entry) => {
    const change = record(entry, 'Save V4 OrganizationStructuralChange')
    exactKeys(change, ['id', 'organizationId', 'changeType', 'status', 'effectiveDate', 'requestedAt', 'approvedAt', 'executedAt', 'sourceDecisionId', 'regulatoryOrderId', 'predecessorOrganizationIds', 'successorOrganizationIds', 'notes'], 'Save V4 OrganizationStructuralChange')
    return createOrganizationStructuralChange({ id: organizationStructuralChangeIdFromString(nonEmptyText(change.id, 'Save V4 OrganizationStructuralChange id')), organizationId: organizationIdFromString(nonEmptyText(change.organizationId, 'Save V4 OrganizationStructuralChange organizationId')), changeType: change.changeType as OrganizationStructuralChange['changeType'], status: change.status as OrganizationStructuralChange['status'], effectiveDate: parseGameDate(nonEmptyText(change.effectiveDate, 'Save V4 OrganizationStructuralChange effectiveDate')), requestedAt: parseGameDate(nonEmptyText(change.requestedAt, 'Save V4 OrganizationStructuralChange requestedAt')), approvedAt: nullableText(change.approvedAt, 'Save V4 OrganizationStructuralChange approvedAt') === null ? null : parseGameDate(nullableText(change.approvedAt, 'Save V4 OrganizationStructuralChange approvedAt')!), executedAt: nullableText(change.executedAt, 'Save V4 OrganizationStructuralChange executedAt') === null ? null : parseGameDate(nullableText(change.executedAt, 'Save V4 OrganizationStructuralChange executedAt')!), sourceDecisionId: nullableText(change.sourceDecisionId, 'Save V4 OrganizationStructuralChange sourceDecisionId'), regulatoryOrderId: nullableText(change.regulatoryOrderId, 'Save V4 OrganizationStructuralChange regulatoryOrderId'), predecessorOrganizationIds: stringArray(change.predecessorOrganizationIds, 'Save V4 OrganizationStructuralChange predecessorOrganizationIds'), successorOrganizationIds: stringArray(change.successorOrganizationIds, 'Save V4 OrganizationStructuralChange successorOrganizationIds'), notes: nullableText(change.notes, 'Save V4 OrganizationStructuralChange notes') })
  }))
}

function parseOrganizationLifecycleStates(value: unknown): readonly OrganizationLifecycleState[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationLifecycleStates must be an array')
  return Object.freeze(value.map((entry) => {
    const state = record(entry, 'Save V4 OrganizationLifecycleState')
    exactKeys(state, ['id', 'organizationId', 'status', 'effectiveFrom', 'effectiveTo', 'sourceStructuralChangeId', 'notes'], 'Save V4 OrganizationLifecycleState')
    return createOrganizationLifecycleState({ id: organizationLifecycleStateIdFromString(nonEmptyText(state.id, 'Save V4 OrganizationLifecycleState id')), organizationId: organizationIdFromString(nonEmptyText(state.organizationId, 'Save V4 OrganizationLifecycleState organizationId')), status: state.status as OrganizationLifecycleState['status'], effectiveFrom: nonEmptyText(state.effectiveFrom, 'Save V4 OrganizationLifecycleState effectiveFrom'), effectiveTo: nullableText(state.effectiveTo, 'Save V4 OrganizationLifecycleState effectiveTo'), sourceStructuralChangeId: nullableText(state.sourceStructuralChangeId, 'Save V4 OrganizationLifecycleState sourceStructuralChangeId'), notes: nullableText(state.notes, 'Save V4 OrganizationLifecycleState notes') })
  }))
}

function parseOrganizationSuccessions(value: unknown): readonly OrganizationSuccession[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationSuccessions must be an array')
  return Object.freeze(value.map((entry) => {
    const succession = record(entry, 'Save V4 OrganizationSuccession')
    exactKeys(succession, ['id', 'predecessorOrganizationId', 'successorOrganizationId', 'effectiveDate', 'successionType', 'transfersRights', 'transfersObligations', 'transfersCompetitionRights', 'notes'], 'Save V4 OrganizationSuccession')
    return createOrganizationSuccession({ id: organizationSuccessionIdFromString(nonEmptyText(succession.id, 'Save V4 OrganizationSuccession id')), predecessorOrganizationId: organizationIdFromString(nonEmptyText(succession.predecessorOrganizationId, 'Save V4 OrganizationSuccession predecessorOrganizationId')), successorOrganizationId: organizationIdFromString(nonEmptyText(succession.successorOrganizationId, 'Save V4 OrganizationSuccession successorOrganizationId')), effectiveDate: nonEmptyText(succession.effectiveDate, 'Save V4 OrganizationSuccession effectiveDate'), successionType: succession.successionType as OrganizationSuccession['successionType'], transfersRights: boolean(succession.transfersRights, 'Save V4 OrganizationSuccession transfersRights'), transfersObligations: boolean(succession.transfersObligations, 'Save V4 OrganizationSuccession transfersObligations'), transfersCompetitionRights: boolean(succession.transfersCompetitionRights, 'Save V4 OrganizationSuccession transfersCompetitionRights'), notes: nullableText(succession.notes, 'Save V4 OrganizationSuccession notes') })
  }))
}

function parseRegulatoryOrders(value: unknown): readonly RegulatoryOrder[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 regulatoryOrders must be an array')
  return Object.freeze(value.map((entry) => {
    const order = record(entry, 'Save V4 RegulatoryOrder')
    exactKeys(order, ['id', 'issuerOrganizationId', 'targetOrganizationId', 'orderType', 'status', 'issuedAt', 'effectiveDate', 'deadline', 'resolvedAt', 'sourceAssessmentId', 'sourceDecisionId', 'reasonCode', 'notes'], 'Save V4 RegulatoryOrder')
    return createRegulatoryOrder({ id: regulatoryOrderIdFromString(nonEmptyText(order.id, 'Save V4 RegulatoryOrder id')), issuerOrganizationId: organizationIdFromString(nonEmptyText(order.issuerOrganizationId, 'Save V4 RegulatoryOrder issuerOrganizationId')), targetOrganizationId: organizationIdFromString(nonEmptyText(order.targetOrganizationId, 'Save V4 RegulatoryOrder targetOrganizationId')), orderType: order.orderType as RegulatoryOrder['orderType'], status: order.status as RegulatoryOrder['status'], issuedAt: parseGameDate(nonEmptyText(order.issuedAt, 'Save V4 RegulatoryOrder issuedAt')), effectiveDate: parseGameDate(nonEmptyText(order.effectiveDate, 'Save V4 RegulatoryOrder effectiveDate')), deadline: nullableText(order.deadline, 'Save V4 RegulatoryOrder deadline') === null ? null : parseGameDate(nullableText(order.deadline, 'Save V4 RegulatoryOrder deadline')!), resolvedAt: nullableText(order.resolvedAt, 'Save V4 RegulatoryOrder resolvedAt') === null ? null : parseGameDate(nullableText(order.resolvedAt, 'Save V4 RegulatoryOrder resolvedAt')!), sourceAssessmentId: nullableText(order.sourceAssessmentId, 'Save V4 RegulatoryOrder sourceAssessmentId'), sourceDecisionId: nullableText(order.sourceDecisionId, 'Save V4 RegulatoryOrder sourceDecisionId'), reasonCode: nullableText(order.reasonCode, 'Save V4 RegulatoryOrder reasonCode'), notes: nullableText(order.notes, 'Save V4 RegulatoryOrder notes') })
  }))
}

function parseRegulatoryRemediationPlans(value: unknown): readonly RegulatoryRemediationPlan[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 regulatoryRemediationPlans must be an array')
  return Object.freeze(value.map((entry) => {
    const plan = record(entry, 'Save V4 RegulatoryRemediationPlan')
    exactKeys(plan, ['id', 'regulatoryOrderId', 'actions', 'deadline', 'status', 'proposedAt', 'completedAt', 'evidenceIds'], 'Save V4 RegulatoryRemediationPlan')
    const actions = Array.isArray(plan.actions) ? plan.actions.map((raw) => { const action = record(raw, 'Save V4 RegulatoryRemediationAction'); exactKeys(action, ['id', 'type', 'organizationStructuralChangeId', 'ownershipTransactionId', 'competitionId', 'seasonId', 'notes'], 'Save V4 RegulatoryRemediationAction'); const structuralChangeId = nullableText(action.organizationStructuralChangeId, 'Save V4 Remediation action structural change'); const ownershipTransactionId = nullableText(action.ownershipTransactionId, 'Save V4 Remediation action ownership transaction'); const competitionId = nullableText(action.competitionId, 'Save V4 Remediation action competition'); const seasonId = nullableText(action.seasonId, 'Save V4 Remediation action season'); return { id: nonEmptyText(action.id, 'Save V4 Remediation action id'), type: action.type as RegulatoryRemediationPlan['actions'][number]['type'], organizationStructuralChangeId: structuralChangeId === null ? null : organizationStructuralChangeIdFromString(structuralChangeId), ownershipTransactionId: ownershipTransactionId === null ? null : organizationOwnershipTransactionIdFromString(ownershipTransactionId), competitionId: competitionId === null ? null : competitionIdFromString(competitionId), seasonId: seasonId === null ? null : seasonIdFromString(seasonId), notes: nullableText(action.notes, 'Save V4 Remediation action notes') } }) : (() => { throw new TypeError('Save V4 RegulatoryRemediationPlan actions must be an array') })()
    return createRegulatoryRemediationPlan({ id: regulatoryRemediationPlanIdFromString(nonEmptyText(plan.id, 'Save V4 RegulatoryRemediationPlan id')), regulatoryOrderId: regulatoryOrderIdFromString(nonEmptyText(plan.regulatoryOrderId, 'Save V4 RegulatoryRemediationPlan regulatoryOrderId')), actions, deadline: nullableText(plan.deadline, 'Save V4 RegulatoryRemediationPlan deadline'), status: plan.status as RegulatoryRemediationPlan['status'], proposedAt: nonEmptyText(plan.proposedAt, 'Save V4 RegulatoryRemediationPlan proposedAt'), completedAt: nullableText(plan.completedAt, 'Save V4 RegulatoryRemediationPlan completedAt'), evidenceIds: stringArray(plan.evidenceIds, 'Save V4 RegulatoryRemediationPlan evidenceIds') })
  }))
}

function parseOrganizationLicenses(value: unknown): readonly OrganizationLicense[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationLicenses must be an array')
  return Object.freeze(value.map((entry) => {
    const license = record(entry, 'Save V4 OrganizationLicense')
    exactKeys(license, ['id', 'issuerOrganizationId', 'holderOrganizationId', 'scope', 'seasonId', 'status', 'validFrom', 'validTo', 'conditions'], 'Save V4 OrganizationLicense')
    const scope = record(license.scope, 'Save V4 OrganizationLicense scope')
    const normalizedScope = scope.kind === 'COMPETITION' ? (exactKeys(scope, ['kind', 'competitionId'], 'Save V4 OrganizationLicense competition scope'), { kind: 'COMPETITION' as const, competitionId: competitionIdFromString(nonEmptyText(scope.competitionId, 'Save V4 OrganizationLicense competitionId')) }) : scope.kind === 'ECOSYSTEM' ? (exactKeys(scope, ['kind', 'ecosystemId'], 'Save V4 OrganizationLicense ecosystem scope'), { kind: 'ECOSYSTEM' as const, ecosystemId: ecosystemIdFromString(nonEmptyText(scope.ecosystemId, 'Save V4 OrganizationLicense ecosystemId')) }) : (() => { throw new TypeError('Save V4 OrganizationLicense scope kind is invalid') })()
    return createOrganizationLicense({ id: organizationLicenseIdFromString(nonEmptyText(license.id, 'Save V4 OrganizationLicense id')), issuerOrganizationId: organizationIdFromString(nonEmptyText(license.issuerOrganizationId, 'Save V4 OrganizationLicense issuerOrganizationId')), holderOrganizationId: organizationIdFromString(nonEmptyText(license.holderOrganizationId, 'Save V4 OrganizationLicense holderOrganizationId')), scope: normalizedScope, seasonId: nullableText(license.seasonId, 'Save V4 OrganizationLicense seasonId'), status: license.status as OrganizationLicense['status'], validFrom: nonEmptyText(license.validFrom, 'Save V4 OrganizationLicense validFrom'), validTo: nullableText(license.validTo, 'Save V4 OrganizationLicense validTo'), conditions: stringArray(license.conditions, 'Save V4 OrganizationLicense conditions') })
  }))
}

// --- CFI2S: Club Facilities & Infrastructure V2 ---------------------------------------------

function parsePlaces(value: unknown): readonly Place[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 places must be an array')
  return Object.freeze(value.map((entry) => {
    const place = record(entry, 'Save V4 Place')
    exactKeys(place, ['id', 'kind', 'name', 'countryId', 'parentPlaceId', 'latitude', 'longitude'], 'Save V4 Place')
    return createPlace({
      id: placeIdFromString(nonEmptyText(place.id, 'Save V4 Place id')),
      kind: place.kind as Place['kind'],
      name: nonEmptyText(place.name, 'Save V4 Place name'),
      countryId: nullableText(place.countryId, 'Save V4 Place countryId'),
      parentPlaceId: nullableText(place.parentPlaceId, 'Save V4 Place parentPlaceId'),
      latitude: nullableNumber(place.latitude, 'Save V4 Place latitude'),
      longitude: nullableNumber(place.longitude, 'Save V4 Place longitude'),
    })
  }))
}

function parseFacilityPhysicalProfile(value: unknown): Facility['physical'] {
  const profile = record(value, 'Save V4 Facility physical profile')
  exactKeys(profile, ['openedOn', 'totalCapacity', 'seatedCapacity', 'standingCapacity', 'courtCount', 'hasAccessibilityProvision'], 'Save V4 Facility physical profile')
  const hasAccessibilityProvision = profile.hasAccessibilityProvision
  if (hasAccessibilityProvision !== null && typeof hasAccessibilityProvision !== 'boolean') throw new TypeError('Save V4 Facility physical profile hasAccessibilityProvision must be boolean or null')
  return {
    openedOn: nullableText(profile.openedOn, 'Save V4 Facility physical profile openedOn'),
    totalCapacity: nullableInteger(profile.totalCapacity, 'Save V4 Facility physical profile totalCapacity'),
    seatedCapacity: nullableInteger(profile.seatedCapacity, 'Save V4 Facility physical profile seatedCapacity'),
    standingCapacity: nullableInteger(profile.standingCapacity, 'Save V4 Facility physical profile standingCapacity'),
    courtCount: nullableInteger(profile.courtCount, 'Save V4 Facility physical profile courtCount'),
    hasAccessibilityProvision,
  } as Facility['physical']
}

function parseFacilities(value: unknown): readonly Facility[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilities must be an array')
  return Object.freeze(value.map((entry) => {
    const facility = record(entry, 'Save V4 Facility')
    exactKeys(facility, ['id', 'placeId', 'type', 'purposes', 'capabilities', 'status', 'canonicalName', 'physical', 'closedOn'], 'Save V4 Facility')
    return createFacility({
      id: facilityIdFromString(nonEmptyText(facility.id, 'Save V4 Facility id')),
      placeId: placeIdFromString(nonEmptyText(facility.placeId, 'Save V4 Facility placeId')),
      type: facility.type as Facility['type'],
      purposes: stringArray(facility.purposes, 'Save V4 Facility purposes') as readonly Facility['purposes'][number][],
      capabilities: stringArray(facility.capabilities, 'Save V4 Facility capabilities') as readonly Facility['capabilities'][number][],
      status: facility.status as Facility['status'],
      canonicalName: nonEmptyText(facility.canonicalName, 'Save V4 Facility canonicalName'),
      physical: parseFacilityPhysicalProfile(facility.physical),
      closedOn: nullableText(facility.closedOn, 'Save V4 Facility closedOn'),
    })
  }))
}

/**
 * CFI3 adds `parentComponentId`, `specification`, and `equipmentTags` to `FacilityComponent`. All
 * three are treated as optional keys here (present-or-absent, not present-but-null) so a Save V4
 * payload written before CFI3 — which never had these keys at all — continues to load unchanged;
 * `hasOwnProperty` gates each one independently, matching the same backward-compatibility idiom
 * already used for every top-level Facilities collection in this file.
 */
function parseFacilityComponents(value: unknown): readonly FacilityComponent[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityComponents must be an array')
  return Object.freeze(value.map((entry) => {
    const component = record(entry, 'Save V4 FacilityComponent')
    const hasParent = Object.prototype.hasOwnProperty.call(component, 'parentComponentId')
    const hasSpecification = Object.prototype.hasOwnProperty.call(component, 'specification')
    const hasEquipmentTags = Object.prototype.hasOwnProperty.call(component, 'equipmentTags')
    exactKeys(component, ['id', 'facilityId', 'type', 'name', 'status', 'capacity', 'quantity', 'openedAt', 'closedAt', ...(hasParent ? ['parentComponentId'] : []), ...(hasSpecification ? ['specification'] : []), ...(hasEquipmentTags ? ['equipmentTags'] : [])], 'Save V4 FacilityComponent')
    return createFacilityComponent({
      id: facilityComponentIdFromString(nonEmptyText(component.id, 'Save V4 FacilityComponent id')),
      facilityId: facilityIdFromString(nonEmptyText(component.facilityId, 'Save V4 FacilityComponent facilityId')),
      type: component.type as FacilityComponent['type'],
      name: nullableText(component.name, 'Save V4 FacilityComponent name'),
      status: component.status as FacilityComponent['status'],
      capacity: nullableInteger(component.capacity, 'Save V4 FacilityComponent capacity'),
      quantity: nullableInteger(component.quantity, 'Save V4 FacilityComponent quantity'),
      openedAt: nullableText(component.openedAt, 'Save V4 FacilityComponent openedAt'),
      closedAt: nullableText(component.closedAt, 'Save V4 FacilityComponent closedAt'),
      ...(hasParent ? { parentComponentId: nullableText(component.parentComponentId, 'Save V4 FacilityComponent parentComponentId') as FacilityComponent['parentComponentId'] } : {}),
      ...(hasSpecification ? { specification: parseFacilityComponentSpecification(component.specification) } : {}),
      ...(hasEquipmentTags ? { equipmentTags: stringArray(component.equipmentTags, 'Save V4 FacilityComponent equipmentTags') } : {}),
    })
  }))
}

function parseFacilityComponentSpecification(value: unknown): FacilityComponent['specification'] {
  if (value === null) return null
  const specification = record(value, 'Save V4 FacilityComponent specification')
  if (specification.kind === 'COURT') {
    exactKeys(specification, ['kind', 'isFullCourt', 'isIndoor', 'lengthMeters', 'widthMeters', 'surface', 'basketCount', 'competitionCapable', 'spectatorCapacity', 'hasCompetitionLighting', 'hasShotTrackingTechnology', 'hasVideoTrackingTechnology'], 'Save V4 FacilityComponent COURT specification')
    return createCourtSpecification({
      kind: 'COURT',
      isFullCourt: boolean(specification.isFullCourt, 'Save V4 court specification isFullCourt'),
      isIndoor: boolean(specification.isIndoor, 'Save V4 court specification isIndoor'),
      lengthMeters: nullableNumber(specification.lengthMeters, 'Save V4 court specification lengthMeters'),
      widthMeters: nullableNumber(specification.widthMeters, 'Save V4 court specification widthMeters'),
      surface: specification.surface as CourtSpecification['surface'],
      basketCount: nullableInteger(specification.basketCount, 'Save V4 court specification basketCount'),
      competitionCapable: boolean(specification.competitionCapable, 'Save V4 court specification competitionCapable'),
      spectatorCapacity: nullableInteger(specification.spectatorCapacity, 'Save V4 court specification spectatorCapacity'),
      hasCompetitionLighting: specification.hasCompetitionLighting as boolean | null,
      hasShotTrackingTechnology: specification.hasShotTrackingTechnology as boolean | null,
      hasVideoTrackingTechnology: specification.hasVideoTrackingTechnology as boolean | null,
    })
  }
  if (specification.kind === 'CAPACITY') {
    exactKeys(specification, ['kind', 'unit', 'amount'], 'Save V4 FacilityComponent CAPACITY specification')
    return createCapacitySpecification({
      kind: 'CAPACITY',
      unit: specification.unit as CapacitySpecification['unit'],
      amount: number(specification.amount, 'Save V4 capacity specification amount'),
    })
  }
  throw new TypeError('Save V4 FacilityComponent specification kind must be COURT or CAPACITY')
}

function parseFacilityNameRecords(value: unknown): readonly FacilityNameRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityNameRecords must be an array')
  return Object.freeze(value.map((entry) => {
    const record_ = record(entry, 'Save V4 FacilityNameRecord')
    exactKeys(record_, ['id', 'facilityId', 'name', 'isCanonical', 'validFrom', 'validTo'], 'Save V4 FacilityNameRecord')
    return createFacilityNameRecord({
      id: facilityNameRecordIdFromString(nonEmptyText(record_.id, 'Save V4 FacilityNameRecord id')),
      facilityId: facilityIdFromString(nonEmptyText(record_.facilityId, 'Save V4 FacilityNameRecord facilityId')),
      name: nonEmptyText(record_.name, 'Save V4 FacilityNameRecord name'),
      isCanonical: boolean(record_.isCanonical, 'Save V4 FacilityNameRecord isCanonical'),
      validFrom: nullableText(record_.validFrom, 'Save V4 FacilityNameRecord validFrom'),
      validTo: nullableText(record_.validTo, 'Save V4 FacilityNameRecord validTo'),
    })
  }))
}

function parseFacilityOwnershipActor(value: unknown, label: string): FacilityOwnershipActor {
  const actor = record(value, label)
  if (actor.kind === 'PERSON') {
    exactKeys(actor, ['kind', 'personId'], label)
    return { kind: 'PERSON', personId: personIdFromString(nonEmptyText(actor.personId, `${label} personId`)) }
  }
  if (actor.kind === 'ORGANIZATION') {
    exactKeys(actor, ['kind', 'organizationId'], label)
    return { kind: 'ORGANIZATION', organizationId: organizationIdFromString(nonEmptyText(actor.organizationId, `${label} organizationId`)) }
  }
  throw new TypeError(`${label} kind must be PERSON or ORGANIZATION`)
}

function parseFacilityOwnershipInterests(value: unknown): readonly FacilityOwnershipInterest[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityOwnershipInterests must be an array')
  return Object.freeze(value.map((entry) => {
    const interest = record(entry, 'Save V4 FacilityOwnershipInterest')
    exactKeys(interest, ['id', 'facilityId', 'owner', 'ownershipPercentage', 'validFrom', 'validTo'], 'Save V4 FacilityOwnershipInterest')
    return createFacilityOwnershipInterest({
      id: facilityOwnershipInterestIdFromString(nonEmptyText(interest.id, 'Save V4 FacilityOwnershipInterest id')),
      facilityId: facilityIdFromString(nonEmptyText(interest.facilityId, 'Save V4 FacilityOwnershipInterest facilityId')),
      owner: parseFacilityOwnershipActor(interest.owner, 'Save V4 FacilityOwnershipInterest owner'),
      ownershipPercentage: nullableNumber(interest.ownershipPercentage, 'Save V4 FacilityOwnershipInterest ownershipPercentage'),
      validFrom: nullableText(interest.validFrom, 'Save V4 FacilityOwnershipInterest validFrom'),
      validTo: nullableText(interest.validTo, 'Save V4 FacilityOwnershipInterest validTo'),
    })
  }))
}

function parseFacilityControlActor(value: unknown, label: string): FacilityControlActor {
  const actor = record(value, label)
  if (actor.kind === 'PERSON') {
    exactKeys(actor, ['kind', 'personId'], label)
    return { kind: 'PERSON', personId: personIdFromString(nonEmptyText(actor.personId, `${label} personId`)) }
  }
  if (actor.kind === 'ORGANIZATION') {
    exactKeys(actor, ['kind', 'organizationId'], label)
    return { kind: 'ORGANIZATION', organizationId: organizationIdFromString(nonEmptyText(actor.organizationId, `${label} organizationId`)) }
  }
  throw new TypeError(`${label} kind must be PERSON or ORGANIZATION`)
}

function parseFacilityControlRights(value: unknown): readonly FacilityControlRight[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityControlRights must be an array')
  return Object.freeze(value.map((entry) => {
    const right = record(entry, 'Save V4 FacilityControlRight')
    exactKeys(right, ['id', 'facilityId', 'controller', 'validFrom', 'validTo'], 'Save V4 FacilityControlRight')
    return createFacilityControlRight({
      id: facilityControlRightIdFromString(nonEmptyText(right.id, 'Save V4 FacilityControlRight id')),
      facilityId: facilityIdFromString(nonEmptyText(right.facilityId, 'Save V4 FacilityControlRight facilityId')),
      controller: parseFacilityControlActor(right.controller, 'Save V4 FacilityControlRight controller'),
      validFrom: nullableText(right.validFrom, 'Save V4 FacilityControlRight validFrom'),
      validTo: nullableText(right.validTo, 'Save V4 FacilityControlRight validTo'),
    })
  }))
}

function parseFacilityOperatorAssignments(value: unknown): readonly FacilityOperatorAssignment[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityOperatorAssignments must be an array')
  return Object.freeze(value.map((entry) => {
    const assignment = record(entry, 'Save V4 FacilityOperatorAssignment')
    exactKeys(assignment, ['id', 'facilityId', 'operatorOrganizationId', 'validFrom', 'validTo'], 'Save V4 FacilityOperatorAssignment')
    return createFacilityOperatorAssignment({
      id: facilityOperatorAssignmentIdFromString(nonEmptyText(assignment.id, 'Save V4 FacilityOperatorAssignment id')),
      facilityId: facilityIdFromString(nonEmptyText(assignment.facilityId, 'Save V4 FacilityOperatorAssignment facilityId')),
      operatorOrganizationId: organizationIdFromString(nonEmptyText(assignment.operatorOrganizationId, 'Save V4 FacilityOperatorAssignment operatorOrganizationId')),
      validFrom: nullableText(assignment.validFrom, 'Save V4 FacilityOperatorAssignment validFrom'),
      validTo: nullableText(assignment.validTo, 'Save V4 FacilityOperatorAssignment validTo'),
    })
  }))
}

function parseFacilityOrganizationRelationships(value: unknown): readonly FacilityOrganizationRelationship[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityOrganizationRelationships must be an array')
  return Object.freeze(value.map((entry) => {
    const relationship = record(entry, 'Save V4 FacilityOrganizationRelationship')
    exactKeys(relationship, ['id', 'facilityId', 'organizationId', 'kind', 'validFrom', 'validTo'], 'Save V4 FacilityOrganizationRelationship')
    return createFacilityOrganizationRelationship({
      id: facilityOrganizationRelationshipIdFromString(nonEmptyText(relationship.id, 'Save V4 FacilityOrganizationRelationship id')),
      facilityId: facilityIdFromString(nonEmptyText(relationship.facilityId, 'Save V4 FacilityOrganizationRelationship facilityId')),
      organizationId: organizationIdFromString(nonEmptyText(relationship.organizationId, 'Save V4 FacilityOrganizationRelationship organizationId')),
      kind: relationship.kind as FacilityOrganizationRelationship['kind'],
      validFrom: nullableText(relationship.validFrom, 'Save V4 FacilityOrganizationRelationship validFrom'),
      validTo: nullableText(relationship.validTo, 'Save V4 FacilityOrganizationRelationship validTo'),
    })
  }))
}

function parseFacilityTeamRelationships(value: unknown): readonly FacilityTeamRelationship[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityTeamRelationships must be an array')
  return Object.freeze(value.map((entry) => {
    const relationship = record(entry, 'Save V4 FacilityTeamRelationship')
    exactKeys(relationship, ['id', 'facilityId', 'teamId', 'kind', 'validFrom', 'validTo'], 'Save V4 FacilityTeamRelationship')
    return createFacilityTeamRelationship({
      id: facilityTeamRelationshipIdFromString(nonEmptyText(relationship.id, 'Save V4 FacilityTeamRelationship id')),
      facilityId: facilityIdFromString(nonEmptyText(relationship.facilityId, 'Save V4 FacilityTeamRelationship facilityId')),
      teamId: teamIdFromString(nonEmptyText(relationship.teamId, 'Save V4 FacilityTeamRelationship teamId')),
      kind: relationship.kind as FacilityTeamRelationship['kind'],
      validFrom: nullableText(relationship.validFrom, 'Save V4 FacilityTeamRelationship validFrom'),
      validTo: nullableText(relationship.validTo, 'Save V4 FacilityTeamRelationship validTo'),
    })
  }))
}

function parseFacilityUsageRights(value: unknown): readonly FacilityUsageRight[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityUsageRights must be an array')
  return Object.freeze(value.map((entry) => {
    const right = record(entry, 'Save V4 FacilityUsageRight')
    exactKeys(right, ['id', 'facilityId', 'componentIds', 'organizationId', 'teamId', 'purpose', 'exclusivity', 'priority', 'validFrom', 'validTo', 'agreementReferenceId'], 'Save V4 FacilityUsageRight')
    const componentIds = right.componentIds === null ? null : stringArray(right.componentIds, 'Save V4 FacilityUsageRight componentIds').map((id) => facilityComponentIdFromString(id))
    return createFacilityUsageRight({
      id: facilityUsageRightIdFromString(nonEmptyText(right.id, 'Save V4 FacilityUsageRight id')),
      facilityId: facilityIdFromString(nonEmptyText(right.facilityId, 'Save V4 FacilityUsageRight facilityId')),
      componentIds,
      organizationId: nullableText(right.organizationId, 'Save V4 FacilityUsageRight organizationId'),
      teamId: nullableText(right.teamId, 'Save V4 FacilityUsageRight teamId'),
      purpose: right.purpose as FacilityUsageRight['purpose'],
      exclusivity: right.exclusivity as FacilityUsageRight['exclusivity'],
      priority: right.priority as FacilityUsageRight['priority'],
      validFrom: nonEmptyText(right.validFrom, 'Save V4 FacilityUsageRight validFrom'),
      validTo: nullableText(right.validTo, 'Save V4 FacilityUsageRight validTo'),
      agreementReferenceId: nullableText(right.agreementReferenceId, 'Save V4 FacilityUsageRight agreementReferenceId'),
    })
  }))
}

function parseFacilityCompetitionApprovals(value: unknown): readonly FacilityCompetitionApproval[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityCompetitionApprovals must be an array')
  return Object.freeze(value.map((entry) => {
    const approval = record(entry, 'Save V4 FacilityCompetitionApproval')
    exactKeys(approval, ['id', 'facilityId', 'competitionId', 'approved', 'validFrom', 'validTo'], 'Save V4 FacilityCompetitionApproval')
    return createFacilityCompetitionApproval({
      id: facilityCompetitionApprovalIdFromString(nonEmptyText(approval.id, 'Save V4 FacilityCompetitionApproval id')),
      facilityId: facilityIdFromString(nonEmptyText(approval.facilityId, 'Save V4 FacilityCompetitionApproval facilityId')),
      competitionId: competitionIdFromString(nonEmptyText(approval.competitionId, 'Save V4 FacilityCompetitionApproval competitionId')),
      approved: boolean(approval.approved, 'Save V4 FacilityCompetitionApproval approved'),
      validFrom: nullableText(approval.validFrom, 'Save V4 FacilityCompetitionApproval validFrom'),
      validTo: nullableText(approval.validTo, 'Save V4 FacilityCompetitionApproval validTo'),
    })
  }))
}

function parseFacilityStatusRecords(value: unknown): readonly FacilityStatusRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityStatusRecords must be an array')
  return Object.freeze(value.map((entry) => {
    const record_ = record(entry, 'Save V4 FacilityStatusRecord')
    exactKeys(record_, ['id', 'facilityId', 'status', 'effectiveFrom'], 'Save V4 FacilityStatusRecord')
    return createFacilityStatusRecord({
      id: facilityStatusRecordIdFromString(nonEmptyText(record_.id, 'Save V4 FacilityStatusRecord id')),
      facilityId: facilityIdFromString(nonEmptyText(record_.facilityId, 'Save V4 FacilityStatusRecord facilityId')),
      status: record_.status as FacilityStatusRecord['status'],
      effectiveFrom: nonEmptyText(record_.effectiveFrom, 'Save V4 FacilityStatusRecord effectiveFrom'),
    })
  }))
}

// --- CFI4: Condition, Standard & Serviceability -----------------------------

function parseFacilityComponentConditionRecords(value: unknown): readonly FacilityComponentConditionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityComponentConditionRecords must be an array')
  return Object.freeze(value.map((entry) => {
    const record_ = record(entry, 'Save V4 FacilityComponentConditionRecord')
    exactKeys(record_, ['id', 'componentId', 'effectiveFrom', 'effectiveTo', 'physicalCondition', 'serviceability', 'technicalStandard', 'notes'], 'Save V4 FacilityComponentConditionRecord')
    return createFacilityComponentConditionRecord({
      id: facilityComponentConditionRecordIdFromString(nonEmptyText(record_.id, 'Save V4 FacilityComponentConditionRecord id')),
      componentId: facilityComponentIdFromString(nonEmptyText(record_.componentId, 'Save V4 FacilityComponentConditionRecord componentId')),
      effectiveFrom: nonEmptyText(record_.effectiveFrom, 'Save V4 FacilityComponentConditionRecord effectiveFrom'),
      effectiveTo: nullableText(record_.effectiveTo, 'Save V4 FacilityComponentConditionRecord effectiveTo'),
      physicalCondition: nullableNumber(record_.physicalCondition, 'Save V4 FacilityComponentConditionRecord physicalCondition'),
      serviceability: record_.serviceability as FacilityComponentConditionRecord['serviceability'],
      technicalStandard: nullableText(record_.technicalStandard, 'Save V4 FacilityComponentConditionRecord technicalStandard') as FacilityComponentConditionRecord['technicalStandard'],
      notes: nullableText(record_.notes, 'Save V4 FacilityComponentConditionRecord notes'),
    })
  }))
}

function parseFacilityConditionRecords(value: unknown): readonly FacilityConditionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityConditionRecords must be an array')
  return Object.freeze(value.map((entry) => {
    const record_ = record(entry, 'Save V4 FacilityConditionRecord')
    exactKeys(record_, ['id', 'facilityId', 'dimension', 'effectiveFrom', 'effectiveTo', 'physicalCondition', 'serviceability', 'notes'], 'Save V4 FacilityConditionRecord')
    return createFacilityConditionRecord({
      id: facilityConditionRecordIdFromString(nonEmptyText(record_.id, 'Save V4 FacilityConditionRecord id')),
      facilityId: facilityIdFromString(nonEmptyText(record_.facilityId, 'Save V4 FacilityConditionRecord facilityId')),
      dimension: record_.dimension as FacilityConditionRecord['dimension'],
      effectiveFrom: nonEmptyText(record_.effectiveFrom, 'Save V4 FacilityConditionRecord effectiveFrom'),
      effectiveTo: nullableText(record_.effectiveTo, 'Save V4 FacilityConditionRecord effectiveTo'),
      physicalCondition: nullableNumber(record_.physicalCondition, 'Save V4 FacilityConditionRecord physicalCondition'),
      serviceability: record_.serviceability as FacilityConditionRecord['serviceability'],
      notes: nullableText(record_.notes, 'Save V4 FacilityConditionRecord notes'),
    })
  }))
}

// --- CFI5: Operations, Maintenance & Deterioration --------------------------

function parseFacilityMaintenanceNeeds(value: unknown): readonly FacilityMaintenanceNeed[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityMaintenanceNeeds must be an array')
  return Object.freeze(value.map((entry) => {
    const need = record(entry, 'Save V4 FacilityMaintenanceNeed')
    exactKeys(need, ['id', 'facilityId', 'componentId', 'detectedAt', 'type', 'severity', 'status', 'source', 'resolvedAt'], 'Save V4 FacilityMaintenanceNeed')
    return createFacilityMaintenanceNeed({
      id: facilityMaintenanceNeedIdFromString(nonEmptyText(need.id, 'Save V4 FacilityMaintenanceNeed id')),
      facilityId: facilityIdFromString(nonEmptyText(need.facilityId, 'Save V4 FacilityMaintenanceNeed facilityId')),
      componentId: nullableText(need.componentId, 'Save V4 FacilityMaintenanceNeed componentId'),
      detectedAt: nonEmptyText(need.detectedAt, 'Save V4 FacilityMaintenanceNeed detectedAt'),
      type: need.type as FacilityMaintenanceNeed['type'],
      severity: need.severity as FacilityMaintenanceNeed['severity'],
      status: need.status as FacilityMaintenanceNeed['status'],
      source: nonEmptyText(need.source, 'Save V4 FacilityMaintenanceNeed source'),
      resolvedAt: nullableText(need.resolvedAt, 'Save V4 FacilityMaintenanceNeed resolvedAt'),
    })
  }))
}

function parseFacilityMaintenanceActions(value: unknown): readonly FacilityMaintenanceAction[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityMaintenanceActions must be an array')
  return Object.freeze(value.map((entry) => {
    const action = record(entry, 'Save V4 FacilityMaintenanceAction')
    exactKeys(action, ['id', 'needId', 'facilityId', 'componentId', 'type', 'startedAt', 'completedAt', 'outcome', 'resultingCondition', 'resultingServiceability'], 'Save V4 FacilityMaintenanceAction')
    return createFacilityMaintenanceAction({
      id: facilityMaintenanceActionIdFromString(nonEmptyText(action.id, 'Save V4 FacilityMaintenanceAction id')),
      needId: nullableText(action.needId, 'Save V4 FacilityMaintenanceAction needId'),
      facilityId: facilityIdFromString(nonEmptyText(action.facilityId, 'Save V4 FacilityMaintenanceAction facilityId')),
      componentId: nullableText(action.componentId, 'Save V4 FacilityMaintenanceAction componentId'),
      type: action.type as FacilityMaintenanceAction['type'],
      startedAt: nonEmptyText(action.startedAt, 'Save V4 FacilityMaintenanceAction startedAt'),
      completedAt: nullableText(action.completedAt, 'Save V4 FacilityMaintenanceAction completedAt'),
      outcome: nullableText(action.outcome, 'Save V4 FacilityMaintenanceAction outcome') as FacilityMaintenanceAction['outcome'],
      resultingCondition: nullableNumber(action.resultingCondition, 'Save V4 FacilityMaintenanceAction resultingCondition'),
      resultingServiceability: nullableText(action.resultingServiceability, 'Save V4 FacilityMaintenanceAction resultingServiceability') as FacilityMaintenanceAction['resultingServiceability'],
    })
  }))
}

function parseFacilityInspections(value: unknown): readonly FacilityInspection[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityInspections must be an array')
  return Object.freeze(value.map((entry) => {
    const inspection = record(entry, 'Save V4 FacilityInspection')
    exactKeys(inspection, ['id', 'facilityId', 'componentId', 'inspectedAt', 'finding', 'observedCondition', 'observedServiceability', 'producedNeedId'], 'Save V4 FacilityInspection')
    return createFacilityInspection({
      id: facilityInspectionIdFromString(nonEmptyText(inspection.id, 'Save V4 FacilityInspection id')),
      facilityId: facilityIdFromString(nonEmptyText(inspection.facilityId, 'Save V4 FacilityInspection facilityId')),
      componentId: nullableText(inspection.componentId, 'Save V4 FacilityInspection componentId'),
      inspectedAt: nonEmptyText(inspection.inspectedAt, 'Save V4 FacilityInspection inspectedAt'),
      finding: inspection.finding as FacilityInspection['finding'],
      observedCondition: nullableNumber(inspection.observedCondition, 'Save V4 FacilityInspection observedCondition'),
      observedServiceability: nullableText(inspection.observedServiceability, 'Save V4 FacilityInspection observedServiceability') as FacilityInspection['observedServiceability'],
      producedNeedId: nullableText(inspection.producedNeedId, 'Save V4 FacilityInspection producedNeedId'),
    })
  }))
}

function parseFacilityOperationalIncidents(value: unknown): readonly FacilityOperationalIncident[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityOperationalIncidents must be an array')
  return Object.freeze(value.map((entry) => {
    const incident = record(entry, 'Save V4 FacilityOperationalIncident')
    exactKeys(incident, ['id', 'facilityId', 'componentId', 'category', 'occurredAt', 'resultingServiceability', 'producedNeedId'], 'Save V4 FacilityOperationalIncident')
    return createFacilityOperationalIncident({
      id: facilityOperationalIncidentIdFromString(nonEmptyText(incident.id, 'Save V4 FacilityOperationalIncident id')),
      facilityId: facilityIdFromString(nonEmptyText(incident.facilityId, 'Save V4 FacilityOperationalIncident facilityId')),
      componentId: nullableText(incident.componentId, 'Save V4 FacilityOperationalIncident componentId'),
      category: incident.category as FacilityOperationalIncident['category'],
      occurredAt: nonEmptyText(incident.occurredAt, 'Save V4 FacilityOperationalIncident occurredAt'),
      resultingServiceability: nullableText(incident.resultingServiceability, 'Save V4 FacilityOperationalIncident resultingServiceability') as FacilityOperationalIncident['resultingServiceability'],
      producedNeedId: nullableText(incident.producedNeedId, 'Save V4 FacilityOperationalIncident producedNeedId'),
    })
  }))
}

// --- CFI6: Construction, Renovation & Development Projects ------------------

function parseFacilityDevelopmentProjects(value: unknown): readonly FacilityDevelopmentProject[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityDevelopmentProjects must be an array')
  return Object.freeze(value.map((entry) => {
    const project = record(entry, 'Save V4 FacilityDevelopmentProject')
    const hasFacilityLifecyclePriorStatus = Object.prototype.hasOwnProperty.call(project, 'facilityLifecyclePriorStatus')
    exactKeys(project, hasFacilityLifecyclePriorStatus
      ? ['id', 'organizationId', 'facilityId', 'projectType', 'status', 'scope', 'plannedStartDate', 'actualStartDate', 'plannedCompletionDate', 'actualCompletionDate', 'createdAt', 'cancelledAt', 'reason', 'externalReferenceId', 'facilityLifecyclePriorStatus']
      : ['id', 'organizationId', 'facilityId', 'projectType', 'status', 'scope', 'plannedStartDate', 'actualStartDate', 'plannedCompletionDate', 'actualCompletionDate', 'createdAt', 'cancelledAt', 'reason', 'externalReferenceId'],
      'Save V4 FacilityDevelopmentProject')
    return createFacilityDevelopmentProject({
      id: facilityDevelopmentProjectIdFromString(nonEmptyText(project.id, 'Save V4 FacilityDevelopmentProject id')),
      organizationId: organizationIdFromString(nonEmptyText(project.organizationId, 'Save V4 FacilityDevelopmentProject organizationId')),
      facilityId: nullableText(project.facilityId, 'Save V4 FacilityDevelopmentProject facilityId'),
      projectType: project.projectType as FacilityDevelopmentProject['projectType'],
      status: project.status as FacilityDevelopmentProject['status'],
      scope: parseFacilityDevelopmentProjectScope(project.scope),
      plannedStartDate: nonEmptyText(project.plannedStartDate, 'Save V4 FacilityDevelopmentProject plannedStartDate'),
      actualStartDate: nullableText(project.actualStartDate, 'Save V4 FacilityDevelopmentProject actualStartDate'),
      plannedCompletionDate: nonEmptyText(project.plannedCompletionDate, 'Save V4 FacilityDevelopmentProject plannedCompletionDate'),
      actualCompletionDate: nullableText(project.actualCompletionDate, 'Save V4 FacilityDevelopmentProject actualCompletionDate'),
      createdAt: nonEmptyText(project.createdAt, 'Save V4 FacilityDevelopmentProject createdAt'),
      cancelledAt: nullableText(project.cancelledAt, 'Save V4 FacilityDevelopmentProject cancelledAt'),
      reason: nullableText(project.reason, 'Save V4 FacilityDevelopmentProject reason'),
      externalReferenceId: nullableText(project.externalReferenceId, 'Save V4 FacilityDevelopmentProject externalReferenceId'),
      facilityLifecyclePriorStatus: hasFacilityLifecyclePriorStatus
        ? (nullableText(project.facilityLifecyclePriorStatus, 'Save V4 FacilityDevelopmentProject facilityLifecyclePriorStatus') as FacilityDevelopmentProject['facilityLifecyclePriorStatus'])
        : null,
    })
  }))
}

/**
 * The scope is stored exactly as `FacilityDevelopmentProjectScope`'s own canonical shape (already
 * validated once at write time) and reconstructed through the same `createFacilityDevelopmentProjectScope`
 * factory used everywhere else — no bespoke re-implementation of the discriminated union's
 * validation rules here, keeping this parser thin and the domain factory the single source of
 * truth for what a valid scope looks like.
 */
function parseFacilityDevelopmentProjectScope(value: unknown): FacilityDevelopmentProject['scope'] {
  const scope = record(value, 'Save V4 FacilityDevelopmentProject scope')
  if (typeof scope.kind !== 'string') throw new TypeError('Save V4 FacilityDevelopmentProject scope kind must be a string')
  return createFacilityDevelopmentProjectScope(scope as unknown as Parameters<typeof createFacilityDevelopmentProjectScope>[0])
}

function parseFacilityDevelopmentProjectPhases(value: unknown): readonly FacilityDevelopmentProjectPhase[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 facilityDevelopmentProjectPhases must be an array')
  return Object.freeze(value.map((entry) => {
    const phase = record(entry, 'Save V4 FacilityDevelopmentProjectPhase')
    exactKeys(phase, ['id', 'projectId', 'sequence', 'name', 'status', 'plannedStart', 'plannedCompletion', 'actualStart', 'actualCompletion', 'scopeComponentIndexes'], 'Save V4 FacilityDevelopmentProjectPhase')
    return createFacilityDevelopmentProjectPhase({
      id: facilityDevelopmentProjectPhaseIdFromString(nonEmptyText(phase.id, 'Save V4 FacilityDevelopmentProjectPhase id')),
      projectId: facilityDevelopmentProjectIdFromString(nonEmptyText(phase.projectId, 'Save V4 FacilityDevelopmentProjectPhase projectId')),
      sequence: number(phase.sequence, 'Save V4 FacilityDevelopmentProjectPhase sequence'),
      name: nullableText(phase.name, 'Save V4 FacilityDevelopmentProjectPhase name'),
      status: phase.status as FacilityDevelopmentProjectPhase['status'],
      plannedStart: nonEmptyText(phase.plannedStart, 'Save V4 FacilityDevelopmentProjectPhase plannedStart'),
      plannedCompletion: nonEmptyText(phase.plannedCompletion, 'Save V4 FacilityDevelopmentProjectPhase plannedCompletion'),
      actualStart: nullableText(phase.actualStart, 'Save V4 FacilityDevelopmentProjectPhase actualStart'),
      actualCompletion: nullableText(phase.actualCompletion, 'Save V4 FacilityDevelopmentProjectPhase actualCompletion'),
      scopeComponentIndexes: phase.scopeComponentIndexes === null || phase.scopeComponentIndexes === undefined ? null : (phase.scopeComponentIndexes as readonly number[]),
    })
  }))
}

function parseConsideration(value: unknown): OrganizationOwnershipTransaction['consideration'] {
  if (value === null) return null
  const consideration = record(value, 'Save V4 OrganizationOwnershipTransaction consideration')
  exactKeys(consideration, ['amount', 'currencyCode'], 'Save V4 OrganizationOwnershipTransaction consideration')
  return { amount: number(consideration.amount, 'Save V4 OrganizationOwnershipTransaction consideration amount'), currencyCode: nonEmptyText(consideration.currencyCode, 'Save V4 OrganizationOwnershipTransaction consideration currencyCode') }
}

function parseOrganizationOwnershipActor(value: unknown, label: string): OrganizationOwnershipActor {
  const actor = record(value, label)
  if (actor.kind === 'PERSON') {
    exactKeys(actor, ['kind', 'personId'], label)
    return { kind: 'PERSON', personId: personIdFromString(nonEmptyText(actor.personId, `${label} personId`)) }
  }
  if (actor.kind === 'ORGANIZATION') {
    exactKeys(actor, ['kind', 'organizationId'], label)
    return { kind: 'ORGANIZATION', organizationId: organizationIdFromString(nonEmptyText(actor.organizationId, `${label} organizationId`)) }
  }
  throw new TypeError(`${label} kind must be PERSON or ORGANIZATION`)
}

function parseFinancialAccounts(value: unknown): readonly FinancialAccount[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 financialAccounts must be an array')
  return Object.freeze(value.map((entry) => {
    const account = record(entry, 'Save V4 FinancialAccount')
    exactKeys(account, ['id', 'organizationId', 'accountType', 'currencyCode', 'openedOn', 'closedOn'], 'Save V4 FinancialAccount')
    return createFinancialAccount({ id: financialAccountIdFromString(nonEmptyText(account.id, 'Save V4 FinancialAccount id')), organizationId: organizationIdFromString(nonEmptyText(account.organizationId, 'Save V4 FinancialAccount organizationId')), accountType: nonEmptyText(account.accountType, 'Save V4 FinancialAccount accountType'), currencyCode: nonEmptyText(account.currencyCode, 'Save V4 FinancialAccount currencyCode'), openedOn: nullableText(account.openedOn, 'Save V4 FinancialAccount openedOn'), closedOn: nullableText(account.closedOn, 'Save V4 FinancialAccount closedOn') })
  }))
}

function parseFinancialMoney(value: unknown, label: string) {
  const money = record(value, label)
  exactKeys(money, ['currencyCode', 'minorUnits'], label)
  return { currencyCode: nonEmptyText(money.currencyCode, `${label} currencyCode`), minorUnits: integer(money.minorUnits, `${label} minorUnits`) }
}

function parseFinancialSource(value: unknown, label: string) {
  const source = record(value, label)
  exactKeys(source, ['kind', ...(source.id === undefined ? [] : ['id']), ...(source.description === undefined ? [] : ['description'])], label)
  return { kind: nonEmptyText(source.kind, `${label} kind`), ...(source.id === undefined ? {} : { id: nonEmptyText(source.id, `${label} id`) }), ...(source.description === undefined ? {} : { description: nonEmptyText(source.description, `${label} description`) }) }
}

function parseFinancialDimensions(value: unknown): FinancialDimensions | null {
  if (value === null) return null
  const dimensions = record(value, 'Save V4 FinancialDimensions')
  exactKeys(dimensions, ['teamId', 'organizationSectionId', 'competitionId', 'contractId', 'reference'].filter((key) => dimensions[key] !== undefined), 'Save V4 FinancialDimensions')
  const reference = dimensions.reference === undefined ? undefined : record(dimensions.reference, 'Save V4 FinancialDimensions reference')
  if (reference !== undefined) exactKeys(reference, ['kind', 'id'], 'Save V4 FinancialDimensions reference')
  return {
    ...(dimensions.teamId === undefined ? {} : { teamId: teamIdFromString(nonEmptyText(dimensions.teamId, 'Save V4 FinancialDimensions teamId')) }),
    ...(dimensions.organizationSectionId === undefined ? {} : { organizationSectionId: organizationSectionIdFromString(nonEmptyText(dimensions.organizationSectionId, 'Save V4 FinancialDimensions organizationSectionId')) }),
    ...(dimensions.competitionId === undefined ? {} : { competitionId: competitionIdFromString(nonEmptyText(dimensions.competitionId, 'Save V4 FinancialDimensions competitionId')) }),
    ...(dimensions.contractId === undefined ? {} : { contractId: contractIdFromString(nonEmptyText(dimensions.contractId, 'Save V4 FinancialDimensions contractId')) }),
    ...(reference === undefined ? {} : { reference: { kind: nonEmptyText(reference.kind, 'Save V4 FinancialDimensions reference kind'), id: nonEmptyText(reference.id, 'Save V4 FinancialDimensions reference id') } }),
  }
}

function parseFinancialTransactions(value: unknown): readonly FinancialTransaction[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 financialTransactions must be an array')
  return Object.freeze(value.map((entry) => {
    const transaction = record(entry, 'Save V4 FinancialTransaction')
    const hasContract = transaction.relatedContractId !== undefined
    const hasEvent = transaction.relatedEventId !== undefined
    exactKeys(transaction, ['id', 'organizationId', 'effectiveOn', 'transactionType', 'amount', 'postings', 'provenance', 'description', 'dimensions', ...(hasContract ? ['relatedContractId'] : []), ...(hasEvent ? ['relatedEventId'] : [])], 'Save V4 FinancialTransaction')
    if (!Array.isArray(transaction.postings)) throw new TypeError('Save V4 FinancialTransaction postings must be an array')
    const postings = transaction.postings.map((entry) => {
      const posting = record(entry, 'Save V4 FinancialPosting')
      exactKeys(posting, ['accountId', 'direction', 'amount'], 'Save V4 FinancialPosting')
      return { accountId: financialAccountIdFromString(nonEmptyText(posting.accountId, 'Save V4 FinancialPosting accountId')), direction: posting.direction as 'DEBIT' | 'CREDIT', amount: parseFinancialMoney(posting.amount, 'Save V4 FinancialPosting amount') }
    })
    return createFinancialTransaction({ id: financialTransactionIdFromString(nonEmptyText(transaction.id, 'Save V4 FinancialTransaction id')), organizationId: organizationIdFromString(nonEmptyText(transaction.organizationId, 'Save V4 FinancialTransaction organizationId')), effectiveOn: nonEmptyText(transaction.effectiveOn, 'Save V4 FinancialTransaction effectiveOn'), transactionType: nonEmptyText(transaction.transactionType, 'Save V4 FinancialTransaction transactionType'), amount: parseFinancialMoney(transaction.amount, 'Save V4 FinancialTransaction amount'), postings, provenance: parseFinancialSource(transaction.provenance, 'Save V4 FinancialTransaction provenance'), description: nullableText(transaction.description, 'Save V4 FinancialTransaction description'), dimensions: parseFinancialDimensions(transaction.dimensions), ...(hasContract ? { relatedContractId: contractIdFromString(nonEmptyText(transaction.relatedContractId, 'Save V4 FinancialTransaction relatedContractId')) } : {}), ...(hasEvent ? { relatedEventId: nonEmptyText(transaction.relatedEventId, 'Save V4 FinancialTransaction relatedEventId') } : {}) })
  }))
}

function parseFiscalPeriods(value: unknown): readonly FiscalPeriod[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 fiscalPeriods must be an array')
  return Object.freeze(value.map((entry) => {
    const period = record(entry, 'Save V4 FiscalPeriod')
    exactKeys(period, ['id', 'organizationId', 'label', 'startsOn', 'endsOn', 'status'], 'Save V4 FiscalPeriod')
    return createFiscalPeriod({ id: fiscalPeriodIdFromString(nonEmptyText(period.id, 'Save V4 FiscalPeriod id')), organizationId: organizationIdFromString(nonEmptyText(period.organizationId, 'Save V4 FiscalPeriod organizationId')), label: nonEmptyText(period.label, 'Save V4 FiscalPeriod label'), startsOn: nonEmptyText(period.startsOn, 'Save V4 FiscalPeriod startsOn'), endsOn: nonEmptyText(period.endsOn, 'Save V4 FiscalPeriod endsOn'), status: period.status as 'OPEN' | 'CLOSED' })
  }))
}

function parseOrganizationFinancialProfiles(value: unknown): readonly OrganizationFinancialProfile[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationFinancialProfiles must be an array')
  return Object.freeze(value.map((entry) => {
    const profile = record(entry, 'Save V4 OrganizationFinancialProfile')
    exactKeys(profile, ['organizationId', 'baseCurrencyCode', 'fiscalYearStartMonth'], 'Save V4 OrganizationFinancialProfile')
    return createOrganizationFinancialProfile({ organizationId: organizationIdFromString(nonEmptyText(profile.organizationId, 'Save V4 OrganizationFinancialProfile organizationId')), baseCurrencyCode: nonEmptyText(profile.baseCurrencyCode, 'Save V4 OrganizationFinancialProfile baseCurrencyCode'), fiscalYearStartMonth: integer(profile.fiscalYearStartMonth, 'Save V4 OrganizationFinancialProfile fiscalYearStartMonth') })
  }))
}

function parseTreasuryCounterparty(value: unknown): TreasuryCounterparty {
  const counterparty = record(value, 'Save V4 TreasuryCounterparty')
  const hasId = counterparty.id !== undefined
  exactKeys(counterparty, ['kind', 'label', ...(hasId ? ['id'] : [])], 'Save V4 TreasuryCounterparty')
  return { kind: counterparty.kind as TreasuryCounterparty['kind'], ...(hasId ? { id: nonEmptyText(counterparty.id, 'Save V4 TreasuryCounterparty id') } : {}), label: nonEmptyText(counterparty.label, 'Save V4 TreasuryCounterparty label') }
}

function parseReceivables(value: unknown): readonly Receivable[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 receivables must be an array')
  return Object.freeze(value.map((entry) => {
    const receivable = record(entry, 'Save V4 Receivable')
    exactKeys(receivable, ['id', 'organizationId', 'amount', 'counterparty', 'recognizedOn', 'dueOn', 'provenance', 'dimensions', 'cancelledOn'], 'Save V4 Receivable')
    return createReceivable({ id: receivableIdFromString(nonEmptyText(receivable.id, 'Save V4 Receivable id')), organizationId: organizationIdFromString(nonEmptyText(receivable.organizationId, 'Save V4 Receivable organizationId')), amount: parseFinancialMoney(receivable.amount, 'Save V4 Receivable amount'), counterparty: parseTreasuryCounterparty(receivable.counterparty), recognizedOn: nonEmptyText(receivable.recognizedOn, 'Save V4 Receivable recognizedOn'), dueOn: nonEmptyText(receivable.dueOn, 'Save V4 Receivable dueOn'), provenance: parseFinancialSource(receivable.provenance, 'Save V4 Receivable provenance'), dimensions: parseFinancialDimensions(receivable.dimensions), cancelledOn: nullableText(receivable.cancelledOn, 'Save V4 Receivable cancelledOn') })
  }))
}

function parsePayables(value: unknown): readonly Payable[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 payables must be an array')
  return Object.freeze(value.map((entry) => {
    const payable = record(entry, 'Save V4 Payable')
    exactKeys(payable, ['id', 'organizationId', 'amount', 'counterparty', 'recognizedOn', 'dueOn', 'provenance', 'dimensions', 'cancelledOn'], 'Save V4 Payable')
    return createPayable({ id: payableIdFromString(nonEmptyText(payable.id, 'Save V4 Payable id')), organizationId: organizationIdFromString(nonEmptyText(payable.organizationId, 'Save V4 Payable organizationId')), amount: parseFinancialMoney(payable.amount, 'Save V4 Payable amount'), counterparty: parseTreasuryCounterparty(payable.counterparty), recognizedOn: nonEmptyText(payable.recognizedOn, 'Save V4 Payable recognizedOn'), dueOn: nonEmptyText(payable.dueOn, 'Save V4 Payable dueOn'), provenance: parseFinancialSource(payable.provenance, 'Save V4 Payable provenance'), dimensions: parseFinancialDimensions(payable.dimensions), cancelledOn: nullableText(payable.cancelledOn, 'Save V4 Payable cancelledOn') })
  }))
}

function parseTreasurySettlements(value: unknown): readonly TreasurySettlement[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 treasury applications must be an array')
  return Object.freeze(value.map((entry) => {
    const settlement = record(entry, 'Save V4 TreasurySettlement')
    exactKeys(settlement, ['id', 'organizationId', 'obligationKind', 'obligationId', 'amount', 'settledOn', 'transactionId', 'provenance'], 'Save V4 TreasurySettlement')
    return createTreasurySettlement({ id: treasurySettlementIdFromString(nonEmptyText(settlement.id, 'Save V4 TreasurySettlement id')), organizationId: organizationIdFromString(nonEmptyText(settlement.organizationId, 'Save V4 TreasurySettlement organizationId')), obligationKind: settlement.obligationKind as 'RECEIVABLE' | 'PAYABLE', obligationId: nonEmptyText(settlement.obligationId, 'Save V4 TreasurySettlement obligationId'), amount: parseFinancialMoney(settlement.amount, 'Save V4 TreasurySettlement amount'), settledOn: nonEmptyText(settlement.settledOn, 'Save V4 TreasurySettlement settledOn'), transactionId: financialTransactionIdFromString(nonEmptyText(settlement.transactionId, 'Save V4 TreasurySettlement transactionId')), provenance: parseFinancialSource(settlement.provenance, 'Save V4 TreasurySettlement provenance') })
  }))
}

function parseRecognitionCounterparty(value: unknown, label: string): TreasuryCounterparty | null {
  return value === null ? null : parseTreasuryCounterparty(value)
}

function parseRevenueRecognitions(value: unknown): readonly RevenueRecognition[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 revenueRecognitions must be an array')
  return Object.freeze(value.map((entry) => {
    const recognition = record(entry, 'Save V4 RevenueRecognition')
    exactKeys(recognition, ['id', 'organizationId', 'amount', 'recognizedOn', 'category', 'provenance', 'counterparty', 'dimensions', 'entitlementId', 'receivableId', 'ledgerTransactionId'], 'Save V4 RevenueRecognition')
    return createRevenueRecognition({ id: revenueRecognitionIdFromString(nonEmptyText(recognition.id, 'Save V4 RevenueRecognition id')), organizationId: organizationIdFromString(nonEmptyText(recognition.organizationId, 'Save V4 RevenueRecognition organizationId')), amount: parseFinancialMoney(recognition.amount, 'Save V4 RevenueRecognition amount'), recognizedOn: nonEmptyText(recognition.recognizedOn, 'Save V4 RevenueRecognition recognizedOn'), category: nonEmptyText(recognition.category, 'Save V4 RevenueRecognition category'), provenance: parseFinancialSource(recognition.provenance, 'Save V4 RevenueRecognition provenance'), counterparty: parseRecognitionCounterparty(recognition.counterparty, 'Save V4 RevenueRecognition counterparty'), dimensions: parseFinancialDimensions(recognition.dimensions), entitlementId: recognition.entitlementId === null ? null : financialEntitlementIdFromString(nonEmptyText(recognition.entitlementId, 'Save V4 RevenueRecognition entitlementId')), receivableId: recognition.receivableId === null ? null : receivableIdFromString(nonEmptyText(recognition.receivableId, 'Save V4 RevenueRecognition receivableId')), ledgerTransactionId: recognition.ledgerTransactionId === null ? null : financialTransactionIdFromString(nonEmptyText(recognition.ledgerTransactionId, 'Save V4 RevenueRecognition ledgerTransactionId')) })
  }))
}

function parseExpenseRecognitions(value: unknown): readonly ExpenseRecognition[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 expenseRecognitions must be an array')
  return Object.freeze(value.map((entry) => {
    const recognition = record(entry, 'Save V4 ExpenseRecognition')
    exactKeys(recognition, ['id', 'organizationId', 'amount', 'recognizedOn', 'category', 'provenance', 'counterparty', 'dimensions', 'commitmentId', 'payableId', 'ledgerTransactionId'], 'Save V4 ExpenseRecognition')
    return createExpenseRecognition({ id: expenseRecognitionIdFromString(nonEmptyText(recognition.id, 'Save V4 ExpenseRecognition id')), organizationId: organizationIdFromString(nonEmptyText(recognition.organizationId, 'Save V4 ExpenseRecognition organizationId')), amount: parseFinancialMoney(recognition.amount, 'Save V4 ExpenseRecognition amount'), recognizedOn: nonEmptyText(recognition.recognizedOn, 'Save V4 ExpenseRecognition recognizedOn'), category: nonEmptyText(recognition.category, 'Save V4 ExpenseRecognition category'), provenance: parseFinancialSource(recognition.provenance, 'Save V4 ExpenseRecognition provenance'), counterparty: parseRecognitionCounterparty(recognition.counterparty, 'Save V4 ExpenseRecognition counterparty'), dimensions: parseFinancialDimensions(recognition.dimensions), commitmentId: recognition.commitmentId === null ? null : financialCommitmentIdFromString(nonEmptyText(recognition.commitmentId, 'Save V4 ExpenseRecognition commitmentId')), payableId: recognition.payableId === null ? null : payableIdFromString(nonEmptyText(recognition.payableId, 'Save V4 ExpenseRecognition payableId')), ledgerTransactionId: recognition.ledgerTransactionId === null ? null : financialTransactionIdFromString(nonEmptyText(recognition.ledgerTransactionId, 'Save V4 ExpenseRecognition ledgerTransactionId')) })
  }))
}

function parseFinancialCommitments(value: unknown): readonly FinancialCommitment[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 financialCommitments must be an array')
  return Object.freeze(value.map((entry) => {
    const commitment = record(entry, 'Save V4 FinancialCommitment')
    exactKeys(commitment, ['id', 'organizationId', 'amount', 'startsOn', 'dueOn', 'category', 'provenance', 'counterparty', 'dimensions', 'cancelledOn'], 'Save V4 FinancialCommitment')
    return createFinancialCommitment({ id: financialCommitmentIdFromString(nonEmptyText(commitment.id, 'Save V4 FinancialCommitment id')), organizationId: organizationIdFromString(nonEmptyText(commitment.organizationId, 'Save V4 FinancialCommitment organizationId')), amount: parseFinancialMoney(commitment.amount, 'Save V4 FinancialCommitment amount'), startsOn: nonEmptyText(commitment.startsOn, 'Save V4 FinancialCommitment startsOn'), dueOn: nonEmptyText(commitment.dueOn, 'Save V4 FinancialCommitment dueOn'), category: nonEmptyText(commitment.category, 'Save V4 FinancialCommitment category'), provenance: parseFinancialSource(commitment.provenance, 'Save V4 FinancialCommitment provenance'), counterparty: parseRecognitionCounterparty(commitment.counterparty, 'Save V4 FinancialCommitment counterparty'), dimensions: parseFinancialDimensions(commitment.dimensions), cancelledOn: nullableText(commitment.cancelledOn, 'Save V4 FinancialCommitment cancelledOn') })
  }))
}

function parseFinancialEntitlements(value: unknown): readonly FinancialEntitlement[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 financialEntitlements must be an array')
  return Object.freeze(value.map((entry) => {
    const entitlement = record(entry, 'Save V4 FinancialEntitlement')
    exactKeys(entitlement, ['id', 'organizationId', 'amount', 'availableOn', 'dueOn', 'category', 'provenance', 'counterparty', 'dimensions', 'cancelledOn'], 'Save V4 FinancialEntitlement')
    return createFinancialEntitlement({ id: financialEntitlementIdFromString(nonEmptyText(entitlement.id, 'Save V4 FinancialEntitlement id')), organizationId: organizationIdFromString(nonEmptyText(entitlement.organizationId, 'Save V4 FinancialEntitlement organizationId')), amount: parseFinancialMoney(entitlement.amount, 'Save V4 FinancialEntitlement amount'), availableOn: nonEmptyText(entitlement.availableOn, 'Save V4 FinancialEntitlement availableOn'), dueOn: nonEmptyText(entitlement.dueOn, 'Save V4 FinancialEntitlement dueOn'), category: nonEmptyText(entitlement.category, 'Save V4 FinancialEntitlement category'), provenance: parseFinancialSource(entitlement.provenance, 'Save V4 FinancialEntitlement provenance'), counterparty: parseRecognitionCounterparty(entitlement.counterparty, 'Save V4 FinancialEntitlement counterparty'), dimensions: parseFinancialDimensions(entitlement.dimensions), cancelledOn: nullableText(entitlement.cancelledOn, 'Save V4 FinancialEntitlement cancelledOn') })
  }))
}

function parseRevenueSources(value: unknown): readonly RevenueSource[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 revenueSources must be an array')
  return Object.freeze(value.map((entry) => {
    const source = record(entry, 'Save V4 RevenueSource')
    exactKeys(source, ['id', 'organizationId', 'category', 'currencyCode', 'amount', 'startsOn', 'endsOn', 'sourceAuthority', 'status', 'generationPolicy', 'dueDatePolicy', 'teamId', 'organizationSectionId', 'competitionId', 'counterparty', 'paymentSchedule', 'provenance'], 'Save V4 RevenueSource')
    if (!Array.isArray(source.paymentSchedule)) throw new TypeError('Save V4 RevenueSource paymentSchedule must be an array')
    const paymentSchedule = source.paymentSchedule.map((raw) => {
      const term = record(raw, 'Save V4 RevenuePaymentTerm')
      exactKeys(term, ['recognitionOn', 'dueOn', 'amount'], 'Save V4 RevenuePaymentTerm')
      return { recognitionOn: nonEmptyText(term.recognitionOn, 'Save V4 RevenuePaymentTerm recognitionOn'), dueOn: nullableText(term.dueOn, 'Save V4 RevenuePaymentTerm dueOn'), amount: parseFinancialMoney(term.amount, 'Save V4 RevenuePaymentTerm amount') }
    })
    return createRevenueSource({
      id: nonEmptyText(source.id, 'Save V4 RevenueSource id'), organizationId: nonEmptyText(source.organizationId, 'Save V4 RevenueSource organizationId'), category: source.category as RevenueSource['category'], currencyCode: nonEmptyText(source.currencyCode, 'Save V4 RevenueSource currencyCode'), amount: parseFinancialMoney(source.amount, 'Save V4 RevenueSource amount'), startsOn: nonEmptyText(source.startsOn, 'Save V4 RevenueSource startsOn'), endsOn: nonEmptyText(source.endsOn, 'Save V4 RevenueSource endsOn'), sourceAuthority: source.sourceAuthority as RevenueSource['sourceAuthority'], status: source.status as RevenueSource['status'], generationPolicy: source.generationPolicy as RevenueSource['generationPolicy'], dueDatePolicy: source.dueDatePolicy as RevenueSource['dueDatePolicy'], teamId: nullableText(source.teamId, 'Save V4 RevenueSource teamId'), organizationSectionId: nullableText(source.organizationSectionId, 'Save V4 RevenueSource organizationSectionId'), competitionId: nullableText(source.competitionId, 'Save V4 RevenueSource competitionId'), counterparty: parseRecognitionCounterparty(source.counterparty, 'Save V4 RevenueSource counterparty'), paymentSchedule, provenance: parseFinancialSource(source.provenance, 'Save V4 RevenueSource provenance'),
    })
  }))
}

function parseOperatingCostSources(value: unknown): readonly OperatingCostSource[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 operatingCostSources must be an array')
  return Object.freeze(value.map((entry) => {
    const source = record(entry, 'Save V4 OperatingCostSource')
    exactKeys(source, ['id', 'organizationId', 'category', 'costNature', 'currencyCode', 'amount', 'startsOn', 'endsOn', 'sourceAuthority', 'status', 'generationPolicy', 'dueDatePolicy', 'teamId', 'organizationSectionId', 'competitionId', 'facilityId', 'matchId', 'counterparty', 'paymentSchedule', 'provenance'], 'Save V4 OperatingCostSource')
    if (!Array.isArray(source.paymentSchedule)) throw new TypeError('Save V4 OperatingCostSource paymentSchedule must be an array')
    const paymentSchedule = source.paymentSchedule.map((raw) => {
      const term = record(raw, 'Save V4 OperatingCostPaymentTerm')
      exactKeys(term, ['recognitionOn', 'dueOn', 'amount'], 'Save V4 OperatingCostPaymentTerm')
      return { recognitionOn: nonEmptyText(term.recognitionOn, 'Save V4 OperatingCostPaymentTerm recognitionOn'), dueOn: nullableText(term.dueOn, 'Save V4 OperatingCostPaymentTerm dueOn'), amount: parseFinancialMoney(term.amount, 'Save V4 OperatingCostPaymentTerm amount') }
    })
    return createOperatingCostSource({ id: nonEmptyText(source.id, 'Save V4 OperatingCostSource id'), organizationId: nonEmptyText(source.organizationId, 'Save V4 OperatingCostSource organizationId'), category: source.category as OperatingCostSource['category'], costNature: source.costNature as OperatingCostSource['costNature'], currencyCode: nonEmptyText(source.currencyCode, 'Save V4 OperatingCostSource currencyCode'), amount: parseFinancialMoney(source.amount, 'Save V4 OperatingCostSource amount'), startsOn: nonEmptyText(source.startsOn, 'Save V4 OperatingCostSource startsOn'), endsOn: nonEmptyText(source.endsOn, 'Save V4 OperatingCostSource endsOn'), sourceAuthority: source.sourceAuthority as OperatingCostSource['sourceAuthority'], status: source.status as OperatingCostSource['status'], generationPolicy: source.generationPolicy as OperatingCostSource['generationPolicy'], dueDatePolicy: source.dueDatePolicy as OperatingCostSource['dueDatePolicy'], teamId: nullableText(source.teamId, 'Save V4 OperatingCostSource teamId'), organizationSectionId: nullableText(source.organizationSectionId, 'Save V4 OperatingCostSource organizationSectionId'), competitionId: nullableText(source.competitionId, 'Save V4 OperatingCostSource competitionId'), facilityId: nullableText(source.facilityId, 'Save V4 OperatingCostSource facilityId'), matchId: nullableText(source.matchId, 'Save V4 OperatingCostSource matchId'), counterparty: parseRecognitionCounterparty(source.counterparty, 'Save V4 OperatingCostSource counterparty'), paymentSchedule, provenance: parseFinancialSource(source.provenance, 'Save V4 OperatingCostSource provenance') })
  }))
}

function parseOperatingCostFacts(value: unknown): readonly AuthorizedOperatingCostFact[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 operatingCostFacts must be an array')
  return Object.freeze(value.map((entry) => {
    const fact = record(entry, 'Save V4 AuthorizedOperatingCostFact')
    exactKeys(fact, ['id', 'authority', 'sourceEntityId', 'organizationId', 'category', 'costNature', 'amount', 'incurredOn', 'dueOn', 'teamId', 'organizationSectionId', 'competitionId', 'facilityId', 'matchId', 'counterparty', 'dimensions', 'provenance'], 'Save V4 AuthorizedOperatingCostFact')
    return createAuthorizedOperatingCostFact({ id: nonEmptyText(fact.id, 'Save V4 AuthorizedOperatingCostFact id'), authority: fact.authority as AuthorizedOperatingCostFact['authority'], sourceEntityId: nonEmptyText(fact.sourceEntityId, 'Save V4 AuthorizedOperatingCostFact sourceEntityId'), organizationId: nonEmptyText(fact.organizationId, 'Save V4 AuthorizedOperatingCostFact organizationId'), category: fact.category as AuthorizedOperatingCostFact['category'], costNature: fact.costNature as AuthorizedOperatingCostFact['costNature'], amount: parseFinancialMoney(fact.amount, 'Save V4 AuthorizedOperatingCostFact amount'), incurredOn: nonEmptyText(fact.incurredOn, 'Save V4 AuthorizedOperatingCostFact incurredOn'), dueOn: nullableText(fact.dueOn, 'Save V4 AuthorizedOperatingCostFact dueOn'), teamId: nullableText(fact.teamId, 'Save V4 AuthorizedOperatingCostFact teamId'), organizationSectionId: nullableText(fact.organizationSectionId, 'Save V4 AuthorizedOperatingCostFact organizationSectionId'), competitionId: nullableText(fact.competitionId, 'Save V4 AuthorizedOperatingCostFact competitionId'), facilityId: nullableText(fact.facilityId, 'Save V4 AuthorizedOperatingCostFact facilityId'), matchId: nullableText(fact.matchId, 'Save V4 AuthorizedOperatingCostFact matchId'), counterparty: parseRecognitionCounterparty(fact.counterparty, 'Save V4 AuthorizedOperatingCostFact counterparty'), dimensions: parseFinancialDimensions(fact.dimensions), provenance: parseFinancialSource(fact.provenance, 'Save V4 AuthorizedOperatingCostFact provenance') })
  }))
}

function parseDebtInstruments(value: unknown): readonly DebtInstrument[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 debtInstruments must be an array')
  return Object.freeze(value.map((entry) => {
    const debt = record(entry, 'Save V4 DebtInstrument'); const interest = record(debt.interest, 'Save V4 DebtInstrument interest'); const repayment = record(debt.repayment, 'Save V4 DebtInstrument repayment'); const hasGovernance = debt.governanceAuthorizationReference !== null
    exactKeys(debt, ['id', 'organizationId', 'lender', 'debtType', 'currencyCode', 'originalPrincipal', 'startsOn', 'maturityOn', 'interest', 'repayment', 'status', 'provenance', 'governanceAuthorizationReference', 'dimensions'], 'Save V4 DebtInstrument')
    exactKeys(interest, interest.kind === 'NONE' ? ['kind'] : interest.kind === 'FIXED_RATE' ? ['kind', 'annualRateBps', 'periods'] : ['kind', 'entries'], 'Save V4 DebtInstrument interest')
    let normalizedInterest: unknown = interest
    if (interest.kind === 'FIXED_RATE') normalizedInterest = { kind: 'FIXED_RATE', annualRateBps: integer(interest.annualRateBps, 'Save V4 DebtInstrument annualRateBps'), periods: Array.isArray(interest.periods) ? interest.periods.map((raw) => { const period = record(raw, 'Save V4 DebtInterestPeriod'); exactKeys(period, ['startsOn', 'endsOn', 'dueOn'], 'Save V4 DebtInterestPeriod'); return { startsOn: nonEmptyText(period.startsOn, 'Save V4 DebtInterestPeriod startsOn'), endsOn: nonEmptyText(period.endsOn, 'Save V4 DebtInterestPeriod endsOn'), dueOn: nonEmptyText(period.dueOn, 'Save V4 DebtInterestPeriod dueOn') } }) : (() => { throw new TypeError('Save V4 DebtInterestPeriod list must be an array') })() }
    if (interest.kind === 'EXPLICIT_SCHEDULE') normalizedInterest = { kind: 'EXPLICIT_SCHEDULE', entries: Array.isArray(interest.entries) ? interest.entries.map((raw) => { const item = record(raw, 'Save V4 DebtInterestEntry'); exactKeys(item, ['recognitionOn', 'dueOn', 'amount'], 'Save V4 DebtInterestEntry'); return { recognitionOn: nonEmptyText(item.recognitionOn, 'Save V4 DebtInterestEntry recognitionOn'), dueOn: nonEmptyText(item.dueOn, 'Save V4 DebtInterestEntry dueOn'), amount: parseFinancialMoney(item.amount, 'Save V4 DebtInterestEntry amount') } }) : (() => { throw new TypeError('Save V4 DebtInterestEntry list must be an array') })() }
    let normalizedRepayment: unknown = repayment
    if (repayment.kind === 'EXPLICIT_SCHEDULE') normalizedRepayment = { kind: 'EXPLICIT_SCHEDULE', entries: Array.isArray(repayment.entries) ? repayment.entries.map((raw) => { const item = record(raw, 'Save V4 DebtPrincipalRepayment'); exactKeys(item, ['repaymentOn', 'amount'], 'Save V4 DebtPrincipalRepayment'); return { repaymentOn: nonEmptyText(item.repaymentOn, 'Save V4 DebtPrincipalRepayment repaymentOn'), amount: parseFinancialMoney(item.amount, 'Save V4 DebtPrincipalRepayment amount') } }) : (() => { throw new TypeError('Save V4 DebtPrincipalRepayment list must be an array') })() }
    return createDebtInstrument({ id: nonEmptyText(debt.id, 'Save V4 DebtInstrument id'), organizationId: nonEmptyText(debt.organizationId, 'Save V4 DebtInstrument organizationId'), lender: parseRecognitionCounterparty(debt.lender, 'Save V4 DebtInstrument lender') ?? (() => { throw new TypeError('Save V4 DebtInstrument lender is required') })(), debtType: debt.debtType as DebtInstrument['debtType'], currencyCode: nonEmptyText(debt.currencyCode, 'Save V4 DebtInstrument currencyCode'), originalPrincipal: parseFinancialMoney(debt.originalPrincipal, 'Save V4 DebtInstrument originalPrincipal'), startsOn: nonEmptyText(debt.startsOn, 'Save V4 DebtInstrument startsOn'), maturityOn: nonEmptyText(debt.maturityOn, 'Save V4 DebtInstrument maturityOn'), interest: normalizedInterest as never, repayment: normalizedRepayment as never, status: debt.status as DebtInstrument['status'], provenance: parseFinancialSource(debt.provenance, 'Save V4 DebtInstrument provenance'), governanceAuthorizationReference: hasGovernance ? parseFinancialSource(debt.governanceAuthorizationReference, 'Save V4 DebtInstrument governanceAuthorizationReference') : null, dimensions: parseFinancialDimensions(debt.dimensions) })
  }))
}

function parseCompetitionDistributionFacts(value: unknown): readonly CompetitionDistributionFact[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 competitionDistributionFacts must be an array')
  return Object.freeze(value.map((entry) => { const fact = record(entry, 'Save V4 CompetitionDistributionFact'); exactKeys(fact, ['id', 'competitionId', 'seasonId', 'recipientOrganizationId', 'recipientTeamId', 'amount', 'category', 'effectiveOn', 'dueOn', 'sourceRule', 'provenance', 'payerOrganizationId', 'counterparty', 'dimensions'], 'Save V4 CompetitionDistributionFact'); return createCompetitionDistributionFact({ id: nonEmptyText(fact.id, 'Save V4 CompetitionDistributionFact id'), competitionId: nonEmptyText(fact.competitionId, 'Save V4 CompetitionDistributionFact competitionId'), seasonId: nonEmptyText(fact.seasonId, 'Save V4 CompetitionDistributionFact seasonId'), recipientOrganizationId: nonEmptyText(fact.recipientOrganizationId, 'Save V4 CompetitionDistributionFact recipientOrganizationId'), recipientTeamId: nullableText(fact.recipientTeamId, 'Save V4 CompetitionDistributionFact recipientTeamId'), amount: parseFinancialMoney(fact.amount, 'Save V4 CompetitionDistributionFact amount'), category: fact.category as CompetitionDistributionFact['category'], effectiveOn: nonEmptyText(fact.effectiveOn, 'Save V4 CompetitionDistributionFact effectiveOn'), dueOn: nullableText(fact.dueOn, 'Save V4 CompetitionDistributionFact dueOn'), sourceRule: nonEmptyText(fact.sourceRule, 'Save V4 CompetitionDistributionFact sourceRule'), provenance: parseFinancialSource(fact.provenance, 'Save V4 CompetitionDistributionFact provenance'), payerOrganizationId: nullableText(fact.payerOrganizationId, 'Save V4 CompetitionDistributionFact payerOrganizationId'), counterparty: fact.counterparty === null ? null : parseRecognitionCounterparty(fact.counterparty, 'Save V4 CompetitionDistributionFact counterparty'), dimensions: parseFinancialDimensions(fact.dimensions) }) }))
}

function parsePlanningPeriod(value: unknown, label: string) {
  const period = record(value, label)
  const hasSeason = period.seasonId !== undefined
  exactKeys(period, ['kind', 'startsOn', 'endsOn', ...(hasSeason ? ['seasonId'] : [])], label)
  return { kind: period.kind as 'SEASON' | 'FISCAL_YEAR' | 'DATE_RANGE', startsOn: nonEmptyText(period.startsOn, `${label} startsOn`), endsOn: nonEmptyText(period.endsOn, `${label} endsOn`), ...(hasSeason ? { seasonId: nonEmptyText(period.seasonId, `${label} seasonId`) } : {}) }
}

function parseFinancialBudgets(value: unknown): readonly FinancialBudget[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 financialBudgets must be an array')
  return Object.freeze(value.map((entry) => {
    const budget = record(entry, 'Save V4 FinancialBudget')
    const hasRevision = budget.revisionOfId !== null
    const hasApproval = budget.approval !== null
    exactKeys(budget, ['id', 'organizationId', 'currencyCode', 'period', 'status', 'label', 'createdOn', 'revisionOfId', 'approval', 'provenance'], 'Save V4 FinancialBudget')
    const approval = hasApproval ? record(budget.approval, 'Save V4 BudgetApproval') : null
    if (approval !== null) { exactKeys(approval, ['authorityKind', 'authorityId', 'approvedOn', 'provenance'], 'Save V4 BudgetApproval') }
    return createFinancialBudget({ id: nonEmptyText(budget.id, 'Save V4 FinancialBudget id'), organizationId: nonEmptyText(budget.organizationId, 'Save V4 FinancialBudget organizationId'), currencyCode: nonEmptyText(budget.currencyCode, 'Save V4 FinancialBudget currencyCode'), period: parsePlanningPeriod(budget.period, 'Save V4 FinancialBudget period'), status: budget.status as 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'SUPERSEDED' | 'CLOSED', label: nonEmptyText(budget.label, 'Save V4 FinancialBudget label'), createdOn: nonEmptyText(budget.createdOn, 'Save V4 FinancialBudget createdOn'), revisionOfId: hasRevision ? nonEmptyText(budget.revisionOfId, 'Save V4 FinancialBudget revisionOfId') : null, approval: approval === null ? null : { authorityKind: approval.authorityKind as 'GOVERNANCE' | 'OWNERSHIP' | 'MANUAL_SYSTEM_ACTION', authorityId: nonEmptyText(approval.authorityId, 'Save V4 BudgetApproval authorityId'), approvedOn: parseGameDate(nonEmptyText(approval.approvedOn, 'Save V4 BudgetApproval approvedOn')), provenance: parseFinancialSource(approval.provenance, 'Save V4 BudgetApproval provenance') }, provenance: parseFinancialSource(budget.provenance, 'Save V4 FinancialBudget provenance') })
  }))
}

function parseBudgetLines(value: unknown): readonly BudgetLine[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 budgetLines must be an array')
  return Object.freeze(value.map((entry) => {
    const line = record(entry, 'Save V4 BudgetLine'); const hasTeam = line.teamId !== undefined; const hasSection = line.organizationSectionId !== undefined; const hasPurpose = line.purpose !== undefined
    exactKeys(line, ['id', 'budgetId', 'organizationId', 'category', 'direction', 'amount', ...(hasTeam ? ['teamId'] : []), ...(hasSection ? ['organizationSectionId'] : []), ...(hasPurpose ? ['purpose'] : []), 'provenance'], 'Save V4 BudgetLine')
    return createBudgetLine({ id: nonEmptyText(line.id, 'Save V4 BudgetLine id'), budgetId: nonEmptyText(line.budgetId, 'Save V4 BudgetLine budgetId'), organizationId: nonEmptyText(line.organizationId, 'Save V4 BudgetLine organizationId'), category: nonEmptyText(line.category, 'Save V4 BudgetLine category'), direction: line.direction as 'INCOME' | 'EXPENSE', amount: parseFinancialMoney(line.amount, 'Save V4 BudgetLine amount'), ...(hasTeam ? { teamId: nonEmptyText(line.teamId, 'Save V4 BudgetLine teamId') } : {}), ...(hasSection ? { organizationSectionId: nonEmptyText(line.organizationSectionId, 'Save V4 BudgetLine organizationSectionId') } : {}), ...(hasPurpose ? { purpose: nonEmptyText(line.purpose, 'Save V4 BudgetLine purpose') } : {}), provenance: parseFinancialSource(line.provenance, 'Save V4 BudgetLine provenance') })
  }))
}

function parseBudgetRevisions(value: unknown): readonly BudgetRevision[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 budgetRevisions must be an array')
  return Object.freeze(value.map((entry) => { const revision = record(entry, 'Save V4 BudgetRevision'); exactKeys(revision, ['id', 'organizationId', 'budgetId', 'supersedesBudgetId', 'revisionNumber', 'createdOn', 'reason', 'provenance'], 'Save V4 BudgetRevision'); return createBudgetRevision({ id: nonEmptyText(revision.id, 'Save V4 BudgetRevision id'), organizationId: nonEmptyText(revision.organizationId, 'Save V4 BudgetRevision organizationId'), budgetId: nonEmptyText(revision.budgetId, 'Save V4 BudgetRevision budgetId'), supersedesBudgetId: nonEmptyText(revision.supersedesBudgetId, 'Save V4 BudgetRevision supersedesBudgetId'), revisionNumber: integer(revision.revisionNumber, 'Save V4 BudgetRevision revisionNumber'), createdOn: nonEmptyText(revision.createdOn, 'Save V4 BudgetRevision createdOn'), reason: nonEmptyText(revision.reason, 'Save V4 BudgetRevision reason'), provenance: parseFinancialSource(revision.provenance, 'Save V4 BudgetRevision provenance') }) }))
}

function parseBudgetAllocations(value: unknown): readonly BudgetAllocation[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 budgetAllocations must be an array')
  return Object.freeze(value.map((entry) => { const allocation = record(entry, 'Save V4 BudgetAllocation'); const hasTeam = allocation.teamId !== undefined; const hasSection = allocation.organizationSectionId !== undefined; const hasPurpose = allocation.purpose !== undefined; exactKeys(allocation, ['id', 'budgetId', 'budgetLineId', 'organizationId', 'amount', ...(hasTeam ? ['teamId'] : []), ...(hasSection ? ['organizationSectionId'] : []), ...(hasPurpose ? ['purpose'] : []), 'provenance'], 'Save V4 BudgetAllocation'); return createBudgetAllocation({ id: nonEmptyText(allocation.id, 'Save V4 BudgetAllocation id'), budgetId: nonEmptyText(allocation.budgetId, 'Save V4 BudgetAllocation budgetId'), budgetLineId: nonEmptyText(allocation.budgetLineId, 'Save V4 BudgetAllocation budgetLineId'), organizationId: nonEmptyText(allocation.organizationId, 'Save V4 BudgetAllocation organizationId'), amount: parseFinancialMoney(allocation.amount, 'Save V4 BudgetAllocation amount'), ...(hasTeam ? { teamId: nonEmptyText(allocation.teamId, 'Save V4 BudgetAllocation teamId') } : {}), ...(hasSection ? { organizationSectionId: nonEmptyText(allocation.organizationSectionId, 'Save V4 BudgetAllocation organizationSectionId') } : {}), ...(hasPurpose ? { purpose: nonEmptyText(allocation.purpose, 'Save V4 BudgetAllocation purpose') } : {}), provenance: parseFinancialSource(allocation.provenance, 'Save V4 BudgetAllocation provenance') }) }))
}

function parseForecastAssumptions(value: unknown): readonly ForecastAssumption[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 forecastAssumptions must be an array')
  return Object.freeze(value.map((entry) => { const assumption = record(entry, 'Save V4 ForecastAssumption'); const hasCategory = assumption.category !== undefined; const hasTeam = assumption.teamId !== undefined; const hasSection = assumption.organizationSectionId !== undefined; exactKeys(assumption, ['id', 'organizationId', 'scenario', 'kind', 'amount', 'period', ...(hasCategory ? ['category'] : []), ...(hasTeam ? ['teamId'] : []), ...(hasSection ? ['organizationSectionId'] : []), 'explanation', 'provenance'], 'Save V4 ForecastAssumption'); return createForecastAssumption({ id: nonEmptyText(assumption.id, 'Save V4 ForecastAssumption id'), organizationId: nonEmptyText(assumption.organizationId, 'Save V4 ForecastAssumption organizationId'), scenario: assumption.scenario as 'BASELINE' | 'UPSIDE' | 'DOWNSIDE' | 'CUSTOM', kind: assumption.kind as 'INCOME' | 'EXPENSE' | 'CASH_INFLOW' | 'CASH_OUTFLOW', amount: parseFinancialMoney(assumption.amount, 'Save V4 ForecastAssumption amount'), period: parsePlanningPeriod(assumption.period, 'Save V4 ForecastAssumption period'), ...(hasCategory ? { category: nonEmptyText(assumption.category, 'Save V4 ForecastAssumption category') } : {}), ...(hasTeam ? { teamId: nonEmptyText(assumption.teamId, 'Save V4 ForecastAssumption teamId') } : {}), ...(hasSection ? { organizationSectionId: nonEmptyText(assumption.organizationSectionId, 'Save V4 ForecastAssumption organizationSectionId') } : {}), explanation: nonEmptyText(assumption.explanation, 'Save V4 ForecastAssumption explanation'), provenance: parseFinancialSource(assumption.provenance, 'Save V4 ForecastAssumption provenance') }) }))
}

function serializeWorldDbCompetitionRuntimeV4(
  value: WorldDbCompetitionRuntime,
): WorldDbCompetitionRuntimeSaveV4 {
  const runtime = createWorldDbCompetitionRuntime(value)
  const pin = runtime.competitionRuntimeBundle ?? null
  return Object.freeze({
    competitionRuntimeBundle: pin === null ? null : Object.freeze({ ...pin }),
    competitionPlanIds: runtime.competitionPlanIds,
    competitionSeasonIds: runtime.competitionSeasonIds,
  })
}

function parseWorldDbCompetitionRuntimeV4(value: unknown): WorldDbCompetitionRuntime {
  const runtime = record(value, 'World DB competition runtime V4')
  const hasRuntimeBundlePin = Object.prototype.hasOwnProperty.call(
    runtime,
    'competitionRuntimeBundle',
  )
  exactKeys(
    runtime,
    hasRuntimeBundlePin
      ? ['competitionRuntimeBundle', 'competitionPlanIds', 'competitionSeasonIds']
      : ['competitionPlanIds', 'competitionSeasonIds'],
    'World DB competition runtime V4',
  )
  return createWorldDbCompetitionRuntime({
    competitionRuntimeBundle: hasRuntimeBundlePin
      ? parseRuntimeBundlePin(runtime.competitionRuntimeBundle)
      : null,
    competitionPlanIds: idArray(runtime.competitionPlanIds, 'World DB competition plan IDs V4'),
    competitionSeasonIds: idArray(
      runtime.competitionSeasonIds,
      'World DB competition season IDs V4',
    ),
  })
}

function parseRuntimeBundlePin(
  value: unknown,
): WorldDbCompetitionRuntime['competitionRuntimeBundle'] {
  if (value === null) return null
  const pin = record(value, 'World DB competition runtime bundle pin V4')
  exactKeys(
    pin,
    ['contentId', 'contentHash', 'worldDbSchema'],
    'World DB competition runtime bundle pin V4',
  )
  return {
    contentId: nonEmptyText(pin.contentId, 'World DB competition runtime bundle contentId V4'),
    contentHash: nonEmptyText(pin.contentHash, 'World DB competition runtime bundle contentHash V4'),
    worldDbSchema: nonEmptyText(
      pin.worldDbSchema,
      'World DB competition runtime bundle worldDbSchema V4',
    ),
  }
}

function serializeWorldAnnualDevelopmentCycleV4(value: WorldAnnualDevelopmentCycle): WorldAnnualDevelopmentCycleSaveV4 {
  return Object.freeze({ lastAppliedCycleId: value.lastAppliedCycleId })
}

function parseWorldAnnualDevelopmentCycleV4(value: unknown): WorldAnnualDevelopmentCycle {
  const cycle = record(value, 'World annual development cycle V4')
  exactKeys(cycle, ['lastAppliedCycleId'], 'World annual development cycle V4')
  if (cycle.lastAppliedCycleId !== null && (typeof cycle.lastAppliedCycleId !== 'string' || cycle.lastAppliedCycleId.length === 0)) {
    throw new TypeError('World annual development cycle V4 lastAppliedCycleId must be a non-empty string or null')
  }
  return Object.freeze({ lastAppliedCycleId: cycle.lastAppliedCycleId })
}

function idArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  const ids = value.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new TypeError(`${label} must contain non-empty strings`)
    }
    return entry
  })
  if (new Set(ids).size !== ids.length) throw new TypeError(`${label} must not contain duplicates`)
  return Object.freeze(ids)
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new TypeError(`${label} must be an array of strings`)
  return Object.freeze(value as string[])
}

function nonEmptyText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}

function nullableText(value: unknown, label: string): string | null {
  if (value !== null && typeof value !== 'string') throw new TypeError(`${label} must be a string or null`)
  return value as string | null
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isInteger(value))) throw new TypeError(`${label} must be an integer or null`)
  return value as number | null
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError(`${label} must be a finite number or null`)
  return value as number | null
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`)
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`)
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`)
  return value
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has unexpected fields`)
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO-8601 timestamp`)
  return value
}
