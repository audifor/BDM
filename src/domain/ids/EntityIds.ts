declare const entityIdBrand: unique symbol

type EntityId<Name extends string> = string & {
  readonly [entityIdBrand]: Name
}

export type CoachId = EntityId<'CoachId'>
export type PersonId = EntityId<'PersonId'>
export type PlayerId = EntityId<'PlayerId'>
export type TeamId = EntityId<'TeamId'>
export type CompetitionId = EntityId<'CompetitionId'>
export type EcosystemId = EntityId<'EcosystemId'>
export type ConferenceId = EntityId<'ConferenceId'>
export type SeasonId = EntityId<'SeasonId'>
export type GameId = EntityId<'GameId'>
export type InjuryId = EntityId<'InjuryId'>
export type ContractId = EntityId<'ContractId'>
export type PlayerTransactionId = EntityId<'PlayerTransactionId'>
export type PlayerKnowledgeId = EntityId<'PlayerKnowledgeId'>
export type StaffPersonId = EntityId<'StaffPersonId'>
export type TeamStaffAssignmentId = EntityId<'TeamStaffAssignmentId'>
export type CoachSkillId = EntityId<'CoachSkillId'>
export type CoachProfessionalTraitId = EntityId<'CoachProfessionalTraitId'>
export type CoachPerkId = EntityId<'CoachPerkId'>
export type CountryId = EntityId<'CountryId'>
/** Identity boundary for canonical Organization-owned runtime data. */
export type OrganizationId = EntityId<'OrganizationId'>
export type OrganizationSectionId = EntityId<'OrganizationSectionId'>
export type OrganizationOwnershipId = EntityId<'OrganizationOwnershipId'>
export type OrganizationControlId = EntityId<'OrganizationControlId'>
export type OrganizationOwnershipTransactionId = EntityId<'OrganizationOwnershipTransactionId'>
export type InvestorInterestId = EntityId<'InvestorInterestId'>
export type OrganizationCapitalRaiseId = EntityId<'OrganizationCapitalRaiseId'>
export type OrganizationInvestmentProposalId = EntityId<'OrganizationInvestmentProposalId'>
export type MultiClubOwnershipPolicyId = EntityId<'MultiClubOwnershipPolicyId'>
export type OrganizationStructuralChangeId = EntityId<'OrganizationStructuralChangeId'>
export type OrganizationLifecycleStateId = EntityId<'OrganizationLifecycleStateId'>
export type OrganizationSuccessionId = EntityId<'OrganizationSuccessionId'>
export type RegulatoryOrderId = EntityId<'RegulatoryOrderId'>
export type RegulatoryRemediationPlanId = EntityId<'RegulatoryRemediationPlanId'>
export type OrganizationLicenseId = EntityId<'OrganizationLicenseId'>
export type AgentId = EntityId<'AgentId'>
export type AgencyId = EntityId<'AgencyId'>
export type FinancialAccountId = EntityId<'FinancialAccountId'>
export type FinancialTransactionId = EntityId<'FinancialTransactionId'>
export type FiscalPeriodId = EntityId<'FiscalPeriodId'>
export type ReceivableId = EntityId<'ReceivableId'>
export type PayableId = EntityId<'PayableId'>
export type TreasurySettlementId = EntityId<'TreasurySettlementId'>
export type RevenueRecognitionId = EntityId<'RevenueRecognitionId'>
export type ExpenseRecognitionId = EntityId<'ExpenseRecognitionId'>
export type FinancialCommitmentId = EntityId<'FinancialCommitmentId'>
export type FinancialEntitlementId = EntityId<'FinancialEntitlementId'>

function idFromString<Id extends string>(value: string, name: string): Id {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }

  return value as Id
}

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() is required to generate entity IDs')
  }

  return globalThis.crypto.randomUUID()
}

export const coachIdFromString = (value: string): CoachId => idFromString<CoachId>(value, 'CoachId')
export const personIdFromString = (value: string): PersonId => idFromString<PersonId>(value, 'PersonId')
export const playerIdFromString = (value: string): PlayerId => idFromString<PlayerId>(value, 'PlayerId')
export const teamIdFromString = (value: string): TeamId => idFromString<TeamId>(value, 'TeamId')
export const competitionIdFromString = (value: string): CompetitionId =>
  idFromString<CompetitionId>(value, 'CompetitionId')
export const ecosystemIdFromString = (value: string): EcosystemId => idFromString<EcosystemId>(value, 'EcosystemId')
export const conferenceIdFromString = (value: string): ConferenceId => idFromString<ConferenceId>(value, 'ConferenceId')
export const seasonIdFromString = (value: string): SeasonId => idFromString<SeasonId>(value, 'SeasonId')
export const gameIdFromString = (value: string): GameId => idFromString<GameId>(value, 'GameId')
export const injuryIdFromString = (value: string): InjuryId => idFromString<InjuryId>(value, 'InjuryId')
export const contractIdFromString = (value: string): ContractId => idFromString<ContractId>(value, 'ContractId')
export const playerTransactionIdFromString = (value: string): PlayerTransactionId => idFromString<PlayerTransactionId>(value, 'PlayerTransactionId')
export const playerKnowledgeIdFromString = (value: string): PlayerKnowledgeId => idFromString<PlayerKnowledgeId>(value, 'PlayerKnowledgeId')
export const staffPersonIdFromString = (value: string): StaffPersonId => idFromString<StaffPersonId>(value, 'StaffPersonId')
export const teamStaffAssignmentIdFromString = (value: string): TeamStaffAssignmentId => idFromString<TeamStaffAssignmentId>(value, 'TeamStaffAssignmentId')
export const coachSkillIdFromString = (value: string): CoachSkillId => idFromString<CoachSkillId>(value, 'CoachSkillId')
export const coachProfessionalTraitIdFromString = (value: string): CoachProfessionalTraitId => idFromString<CoachProfessionalTraitId>(value, 'CoachProfessionalTraitId')
export const coachPerkIdFromString = (value: string): CoachPerkId => idFromString<CoachPerkId>(value, 'CoachPerkId')
export const countryIdFromString = (value: string): CountryId => idFromString<CountryId>(value, 'CountryId')
export const organizationIdFromString = (value: string): OrganizationId => idFromString<OrganizationId>(value, 'OrganizationId')
export const organizationSectionIdFromString = (value: string): OrganizationSectionId => idFromString<OrganizationSectionId>(value, 'OrganizationSectionId')
export const organizationOwnershipIdFromString = (value: string): OrganizationOwnershipId => idFromString<OrganizationOwnershipId>(value, 'OrganizationOwnershipId')
export const organizationControlIdFromString = (value: string): OrganizationControlId => idFromString<OrganizationControlId>(value, 'OrganizationControlId')
export const organizationOwnershipTransactionIdFromString = (value: string): OrganizationOwnershipTransactionId => idFromString<OrganizationOwnershipTransactionId>(value, 'OrganizationOwnershipTransactionId')
export const investorInterestIdFromString = (value: string): InvestorInterestId => idFromString<InvestorInterestId>(value, 'InvestorInterestId')
export const organizationCapitalRaiseIdFromString = (value: string): OrganizationCapitalRaiseId => idFromString<OrganizationCapitalRaiseId>(value, 'OrganizationCapitalRaiseId')
export const organizationInvestmentProposalIdFromString = (value: string): OrganizationInvestmentProposalId => idFromString<OrganizationInvestmentProposalId>(value, 'OrganizationInvestmentProposalId')
export const multiClubOwnershipPolicyIdFromString = (value: string): MultiClubOwnershipPolicyId => idFromString<MultiClubOwnershipPolicyId>(value, 'MultiClubOwnershipPolicyId')
export const organizationStructuralChangeIdFromString = (value: string): OrganizationStructuralChangeId => idFromString<OrganizationStructuralChangeId>(value, 'OrganizationStructuralChangeId')
export const organizationLifecycleStateIdFromString = (value: string): OrganizationLifecycleStateId => idFromString<OrganizationLifecycleStateId>(value, 'OrganizationLifecycleStateId')
export const organizationSuccessionIdFromString = (value: string): OrganizationSuccessionId => idFromString<OrganizationSuccessionId>(value, 'OrganizationSuccessionId')
export const regulatoryOrderIdFromString = (value: string): RegulatoryOrderId => idFromString<RegulatoryOrderId>(value, 'RegulatoryOrderId')
export const regulatoryRemediationPlanIdFromString = (value: string): RegulatoryRemediationPlanId => idFromString<RegulatoryRemediationPlanId>(value, 'RegulatoryRemediationPlanId')
export const organizationLicenseIdFromString = (value: string): OrganizationLicenseId => idFromString<OrganizationLicenseId>(value, 'OrganizationLicenseId')
export const agentIdFromString = (value: string): AgentId => idFromString<AgentId>(value, 'AgentId')
export const agencyIdFromString = (value: string): AgencyId => idFromString<AgencyId>(value, 'AgencyId')
export const financialAccountIdFromString = (value: string): FinancialAccountId => idFromString<FinancialAccountId>(value, 'FinancialAccountId')
export const financialTransactionIdFromString = (value: string): FinancialTransactionId => idFromString<FinancialTransactionId>(value, 'FinancialTransactionId')
export const fiscalPeriodIdFromString = (value: string): FiscalPeriodId => idFromString<FiscalPeriodId>(value, 'FiscalPeriodId')
export const receivableIdFromString = (value: string): ReceivableId => idFromString<ReceivableId>(value, 'ReceivableId')
export const payableIdFromString = (value: string): PayableId => idFromString<PayableId>(value, 'PayableId')
export const treasurySettlementIdFromString = (value: string): TreasurySettlementId => idFromString<TreasurySettlementId>(value, 'TreasurySettlementId')
export const revenueRecognitionIdFromString = (value: string): RevenueRecognitionId => idFromString<RevenueRecognitionId>(value, 'RevenueRecognitionId')
export const expenseRecognitionIdFromString = (value: string): ExpenseRecognitionId => idFromString<ExpenseRecognitionId>(value, 'ExpenseRecognitionId')
export const financialCommitmentIdFromString = (value: string): FinancialCommitmentId => idFromString<FinancialCommitmentId>(value, 'FinancialCommitmentId')
export const financialEntitlementIdFromString = (value: string): FinancialEntitlementId => idFromString<FinancialEntitlementId>(value, 'FinancialEntitlementId')
/** Legacy/generated-world compatibility resolver. World DB runtime uses the canonical Team relation. */
export const organizationIdForTeam = (teamId: TeamId): OrganizationId => organizationIdFromString(teamId)

export const createCoachId = (): CoachId => coachIdFromString(generateId())
export const createPlayerId = (): PlayerId => playerIdFromString(generateId())
export const createTeamId = (): TeamId => teamIdFromString(generateId())
export const createCompetitionId = (): CompetitionId => competitionIdFromString(generateId())
export const createSeasonId = (): SeasonId => seasonIdFromString(generateId())
export const createGameId = (): GameId => gameIdFromString(generateId())
export const createCountryId = (): CountryId => countryIdFromString(generateId())
/** Deterministic-format (crypto.randomUUID) id generator for plain-string identifiers that are not yet branded entity types, e.g. training schedule/module ids. */
export const createEntityId = (): string => generateId()
