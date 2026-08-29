declare const entityIdBrand: unique symbol

type EntityId<Name extends string> = string & {
  readonly [entityIdBrand]: Name
}

export type CoachId = EntityId<'CoachId'>
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
/** Identity boundary for organization-owned knowledge. A team is its temporary resolver. */
export type OrganizationId = EntityId<'OrganizationId'>
export type AgentId = EntityId<'AgentId'>
export type AgencyId = EntityId<'AgencyId'>

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
export const agentIdFromString = (value: string): AgentId => idFromString<AgentId>(value, 'AgentId')
export const agencyIdFromString = (value: string): AgencyId => idFromString<AgencyId>(value, 'AgencyId')
/** TEMPORARY 1:1 resolver until organizations become first-class entities. */
export const organizationIdForTeam = (teamId: TeamId): OrganizationId => organizationIdFromString(teamId)

export const createCoachId = (): CoachId => coachIdFromString(generateId())
export const createPlayerId = (): PlayerId => playerIdFromString(generateId())
export const createTeamId = (): TeamId => teamIdFromString(generateId())
export const createCompetitionId = (): CompetitionId => competitionIdFromString(generateId())
export const createSeasonId = (): SeasonId => seasonIdFromString(generateId())
export const createGameId = (): GameId => gameIdFromString(generateId())
export const createCountryId = (): CountryId => countryIdFromString(generateId())
