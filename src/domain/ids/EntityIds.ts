declare const entityIdBrand: unique symbol

type EntityId<Name extends string> = string & {
  readonly [entityIdBrand]: Name
}

export type CoachId = EntityId<'CoachId'>
export type PlayerId = EntityId<'PlayerId'>
export type TeamId = EntityId<'TeamId'>
export type CompetitionId = EntityId<'CompetitionId'>
export type SeasonId = EntityId<'SeasonId'>
export type GameId = EntityId<'GameId'>
export type InjuryId = EntityId<'InjuryId'>
export type ContractId = EntityId<'ContractId'>
export type CountryId = EntityId<'CountryId'>

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
export const seasonIdFromString = (value: string): SeasonId => idFromString<SeasonId>(value, 'SeasonId')
export const gameIdFromString = (value: string): GameId => idFromString<GameId>(value, 'GameId')
export const injuryIdFromString = (value: string): InjuryId => idFromString<InjuryId>(value, 'InjuryId')
export const contractIdFromString = (value: string): ContractId => idFromString<ContractId>(value, 'ContractId')
export const countryIdFromString = (value: string): CountryId => idFromString<CountryId>(value, 'CountryId')

export const createCoachId = (): CoachId => coachIdFromString(generateId())
export const createPlayerId = (): PlayerId => playerIdFromString(generateId())
export const createTeamId = (): TeamId => teamIdFromString(generateId())
export const createCompetitionId = (): CompetitionId => competitionIdFromString(generateId())
export const createSeasonId = (): SeasonId => seasonIdFromString(generateId())
export const createGameId = (): GameId => gameIdFromString(generateId())
export const createCountryId = (): CountryId => countryIdFromString(generateId())
