import { createCoach } from '@/domain/coach'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { parseGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import {
  coachIdFromString,
  competitionIdFromString,
  countryIdFromString,
  gameIdFromString,
  injuryIdFromString,
  contractIdFromString,
  playerTransactionIdFromString,
  playerIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import { calculateAge, createPlayer } from '@/domain/player'
import { createSeason } from '@/domain/season'
import type { MatchStatLog, PlayerGameStatsSnapshot } from '@/domain/stats/MatchStatLog'
import type { SeasonHistoryRecord } from '@/domain/season'
import { createTeam } from '@/domain/team'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator'
import { generatePlayerPotential } from '@/engine/world/PlayerPotentialGenerator'

type JsonRecord = Readonly<Record<string, unknown>>

/** Disk representation. It deliberately remains separate from the runtime world. */
export interface GameWorldSaveV1 {
  readonly currentDate: string
  readonly currentSeasonId: string
  readonly userCoachId: string
  readonly countries: readonly JsonRecord[]
  readonly coaches: readonly JsonRecord[]
  readonly players: readonly JsonRecord[]
  readonly teams: readonly JsonRecord[]
  readonly competitions: readonly JsonRecord[]
  readonly seasons: readonly JsonRecord[]
  readonly games: readonly JsonRecord[]
  readonly matchStatLogs: readonly JsonRecord[]
  readonly seasonHistoryBySeasonId: readonly JsonRecord[]
  readonly injuries: readonly JsonRecord[]
  readonly contracts: readonly JsonRecord[]
  readonly playerTransactions: readonly JsonRecord[]
}

export interface SaveGameEnvelopeV1 {
  readonly schemaVersion: 1
  readonly savedAt: string
  readonly payload: GameWorldSaveV1
}

export function serializeGameWorldV1(world: GameWorld, savedAt: string): SaveGameEnvelopeV1 {
  requireIsoTimestamp(savedAt)
  return {
    schemaVersion: 1,
    savedAt,
    payload: {
      currentDate: world.currentDate,
      currentSeasonId: world.currentSeasonId,
      userCoachId: world.userCoachId,
      countries: copyRecords(Object.values(world.countries)),
      coaches: copyRecords(Object.values(world.coaches)),
      players: copyRecords(Object.values(world.players)),
      teams: copyRecords(Object.values(world.teams)),
      competitions: copyRecords(Object.values(world.competitions)),
      seasons: copyRecords(Object.values(world.seasons)),
      games: copyRecords(Object.values(world.games)),
      matchStatLogs: copyRecords(Object.values(world.matchStatLogsByGameId)),
      seasonHistoryBySeasonId: copyRecords(Object.values(world.seasonHistoryBySeasonId)),
      injuries: copyRecords(Object.values(world.injuriesById)),
      contracts: copyRecords(Object.values(world.contractsById)),
      playerTransactions: copyRecords(Object.values(world.playerTransactionsById)),
    },
  }
}

/** Parses structural disk data, then rebuilds the world through its canonical semantic validator. */
export function deserializeGameWorldV1(value: unknown): GameWorld {
  const envelope = record(value, 'Save file')
  const version = envelope.schemaVersion
  if (version !== 1) {
    throw new Error(typeof version === 'number' && version > 1 ? 'Unsupported save version' : 'Invalid save version')
  }
  requireIsoTimestamp(string(envelope.savedAt, 'Save savedAt'))
  const payload = record(envelope.payload, 'Save payload')
  const seasons = array(payload.seasons, 'Save seasons').map(readSeason)
  const referenceDate = seasons.reduce((earliest, season) => season.startDate < earliest ? season.startDate : earliest, seasons[0]?.startDate ?? fail('Save seasons must not be empty'))

  const historyWasOmitted = payload.seasonHistoryBySeasonId === undefined
  const currentDate = parseGameDate(string(payload.currentDate, 'Save currentDate'))
  const world = createGameWorld({
    currentDate,
    ...(payload.currentSeasonId === undefined ? {} : { currentSeasonId: seasonIdFromString(string(payload.currentSeasonId, 'Save currentSeasonId')) }),
    userCoachId: coachIdFromString(string(payload.userCoachId, 'Save userCoachId')),
    countries: array(payload.countries, 'Save countries').map(readCountry),
    coaches: array(payload.coaches, 'Save coaches').map(readCoach),
    players: array(payload.players, 'Save players').map((player) => readPlayer(player, referenceDate, currentDate)),
    teams: array(payload.teams, 'Save teams').map(readTeam),
    competitions: array(payload.competitions, 'Save competitions').map(readCompetition),
    seasons,
    games: array(payload.games, 'Save games').map(readGame),
    matchStatLogs: array(payload.matchStatLogs, 'Save matchStatLogs').map(readMatchStatLog),
    seasonHistory: historyWasOmitted ? [] : array(payload.seasonHistoryBySeasonId, 'Save seasonHistoryBySeasonId').map(readSeasonHistory),
    injuries: payload.injuries === undefined ? [] : array(payload.injuries, 'Save injuries').map(readInjury),
    contracts: payload.contracts === undefined ? [] : array(payload.contracts, 'Save contracts').map(readContract),
    playerTransactions: payload.playerTransactions === undefined ? [] : array(payload.playerTransactions, 'Save playerTransactions').map(readTransaction),
  })
  if (Object.values(world.seasons).some((season) => Object.values(world.games).filter((game) => game.seasonId === season.id).every((game) => game.status === 'completed') && world.seasonHistoryBySeasonId[season.id] === undefined)) {
    throw new Error('Completed season is missing season history')
  }
  return world
}

function readCountry(value: unknown) { const v = record(value, 'Country'); return createCountry({ id: countryIdFromString(string(v.id, 'Country id')), name: string(v.name, 'Country name'), code: string(v.code, 'Country code') }) }
function readCoach(value: unknown) { const v = record(value, 'Coach'); return createCoach({ id: coachIdFromString(string(v.id, 'Coach id')), firstName: string(v.firstName, 'Coach firstName'), lastName: string(v.lastName, 'Coach lastName'), gender: gender(v.gender), nationalityId: countryIdFromString(string(v.nationalityId, 'Coach nationalityId')) }) }
function readPlayer(value: unknown, referenceDate: import('@/domain/date').GameDate, currentDate: import('@/domain/date').GameDate) {
  const v = record(value, 'Player'); const basketball = record(v.basketball, 'Player basketball'); const ratings = record(basketball.ratings, 'Player ratings')
  const id = playerIdFromString(string(v.id, 'Player id')); const primaryPosition = position(basketball.primaryPosition)
  const parsedRatings = { finishing: integer(ratings.finishing, 'finishing'), shooting: integer(ratings.shooting, 'shooting'), playmaking: integer(ratings.playmaking, 'playmaking'), perimeterDefense: integer(ratings.perimeterDefense, 'perimeterDefense'), interiorDefense: integer(ratings.interiorDefense, 'interiorDefense'), rebounding: integer(ratings.rebounding, 'rebounding'), athleticism: integer(ratings.athleticism, 'athleticism') }
  const bio = v.bio === undefined ? generatePlayerBio(id, primaryPosition, referenceDate) : readBio(v.bio)
  const potential = v.potential === undefined ? generatePlayerPotential(id, parsedRatings, calculateAge(bio.dateOfBirth, currentDate)) : readPotential(v.potential)
  return createPlayer({ id, firstName: string(v.firstName, 'Player firstName'), lastName: string(v.lastName, 'Player lastName'), gender: gender(v.gender), nationalityId: countryIdFromString(string(v.nationalityId, 'Player nationalityId')), basketball: { primaryPosition, ratings: parsedRatings }, bio, potential })
}
function readPotential(value: unknown) { const v = record(value, 'Player potential'); return { ceiling: integer(v.ceiling, 'Player potential ceiling') } }
function readBio(value: unknown) { const v = record(value, 'Player bio'); return { dateOfBirth: parseGameDate(string(v.dateOfBirth, 'Player bio dateOfBirth')), heightCm: integer(v.heightCm, 'Player bio heightCm'), weightKg: integer(v.weightKg, 'Player bio weightKg') } }
function readTeam(value: unknown) { const v = record(value, 'Team'); return createTeam({ id: teamIdFromString(string(v.id, 'Team id')), name: string(v.name, 'Team name'), gender: gender(v.gender), countryId: countryIdFromString(string(v.countryId, 'Team countryId')), rosterPlayerIds: array(v.rosterPlayerIds, 'Team rosterPlayerIds').map((id) => playerIdFromString(string(id, 'Team player id'))), ...(v.coachId === undefined ? {} : { coachId: coachIdFromString(string(v.coachId, 'Team coachId')) }) }) }
function readCompetition(value: unknown) { const v = record(value, 'Competition'); return createCompetition({ id: competitionIdFromString(string(v.id, 'Competition id')), name: string(v.name, 'Competition name'), gender: gender(v.gender), participantTeamIds: array(v.participantTeamIds, 'Competition participantTeamIds').map((id) => teamIdFromString(string(id, 'Competition team id'))) }) }
function readSeason(value: unknown) { const v = record(value, 'Season'); return createSeason({ id: seasonIdFromString(string(v.id, 'Season id')), competitionId: competitionIdFromString(string(v.competitionId, 'Season competitionId')), label: string(v.label, 'Season label'), startDate: parseGameDate(string(v.startDate, 'Season startDate')), endDate: parseGameDate(string(v.endDate, 'Season endDate')) }) }
function readGame(value: unknown) { const v = record(value, 'Game'); const status = string(v.status, 'Game status'); const result = v.result === null ? null : record(v.result, 'Game result'); return createGame({ id: gameIdFromString(string(v.id, 'Game id')), seasonId: seasonIdFromString(string(v.seasonId, 'Game seasonId')), competitionId: competitionIdFromString(string(v.competitionId, 'Game competitionId')), date: parseGameDate(string(v.date, 'Game date')), homeTeamId: teamIdFromString(string(v.homeTeamId, 'Game homeTeamId')), awayTeamId: teamIdFromString(string(v.awayTeamId, 'Game awayTeamId')), status: status === 'scheduled' || status === 'completed' ? status : fail('Game status is invalid'), result: result === null ? null : { homeScore: integer(result.homeScore, 'Game homeScore'), awayScore: integer(result.awayScore, 'Game awayScore') } }) }
function readMatchStatLog(value: unknown): MatchStatLog {
  const v = record(value, 'MatchStatLog'); const score = record(v.finalScore, 'MatchStatLog finalScore')
  return { gameId: gameIdFromString(string(v.gameId, 'MatchStatLog gameId')), competitionId: competitionIdFromString(string(v.competitionId, 'MatchStatLog competitionId')), seasonId: seasonIdFromString(string(v.seasonId, 'MatchStatLog seasonId')), gameDate: parseGameDate(string(v.gameDate, 'MatchStatLog gameDate')), homeTeamId: teamIdFromString(string(v.homeTeamId, 'MatchStatLog homeTeamId')), awayTeamId: teamIdFromString(string(v.awayTeamId, 'MatchStatLog awayTeamId')), finalScore: { home: integer(score.home, 'MatchStatLog score home'), away: integer(score.away, 'MatchStatLog score away') }, playerLines: array(v.playerLines, 'MatchStatLog playerLines').map(readPlayerLine) }
}
function readSeasonHistory(value: unknown): SeasonHistoryRecord { const v = record(value, 'Season history'); return { seasonId: seasonIdFromString(string(v.seasonId, 'Season history seasonId')), competitionId: competitionIdFromString(string(v.competitionId, 'Season history competitionId')), completedOn: parseGameDate(string(v.completedOn, 'Season history completedOn')), championTeamId: teamIdFromString(string(v.championTeamId, 'Season history championTeamId')), finalStandings: array(v.finalStandings, 'Season history finalStandings').map(readFinalStanding) } }
function readInjury(value: unknown) { const v=record(value,'Injury'); const kind=string(v.kind,'Injury kind'); const severity=string(v.severity,'Injury severity'); return { id: injuryIdFromString(string(v.id,'Injury id')),playerId:playerIdFromString(string(v.playerId,'Injury playerId')),kind:kind as import('@/domain/injury').InjuryKind,severity:severity as import('@/domain/injury').InjurySeverity,injuredOn:parseGameDate(string(v.injuredOn,'Injury injuredOn')),expectedReturnDate:parseGameDate(string(v.expectedReturnDate,'Injury expectedReturnDate')),...(v.sourceGameId===undefined?{}:{sourceGameId:gameIdFromString(string(v.sourceGameId,'Injury sourceGameId'))})} }
function readContract(value: unknown) { const v=record(value,'Contract'); const term=record(v.term,'Contract term'); const compensation=record(v.compensation,'Contract compensation'); return {id:contractIdFromString(string(v.id,'Contract id')),playerId:playerIdFromString(string(v.playerId,'Contract playerId')),teamId:teamIdFromString(string(v.teamId,'Contract teamId')),kind:string(v.kind,'Contract kind') as 'standard',term:{startsOn:parseGameDate(string(term.startsOn,'Contract startsOn')),expiresOn:parseGameDate(string(term.expiresOn,'Contract expiresOn'))},compensation:{annualSalary:integer(compensation.annualSalary,'Contract annualSalary')},...(v.termination===undefined?{}:{termination:readTermination(v.termination)})} }
function readTermination(value:unknown){const v=record(value,'Contract termination');return{terminatedOn:parseGameDate(string(v.terminatedOn,'Contract terminatedOn')),reason:string(v.reason,'Contract termination reason') as 'released'}}
function readTransaction(value:unknown){const v=record(value,'Player transaction');return{id:playerTransactionIdFromString(string(v.id,'Player transaction id')),playerId:playerIdFromString(string(v.playerId,'Player transaction playerId')),kind:string(v.kind,'Player transaction kind') as import('@/domain/transaction').PlayerTransactionKind,occurredOn:parseGameDate(string(v.occurredOn,'Player transaction occurredOn')),...(v.fromTeamId===undefined?{}:{fromTeamId:teamIdFromString(string(v.fromTeamId,'Player transaction fromTeamId'))}),...(v.toTeamId===undefined?{}:{toTeamId:teamIdFromString(string(v.toTeamId,'Player transaction toTeamId'))}),...(v.contractId===undefined?{}:{contractId:contractIdFromString(string(v.contractId,'Player transaction contractId'))})}}
function readFinalStanding(value: unknown) { const v = record(value, 'Final standing'); return { position: integer(v.position, 'Final standing position'), teamId: teamIdFromString(string(v.teamId, 'Final standing teamId')), played: integer(v.played, 'Final standing played'), wins: integer(v.wins, 'Final standing wins'), losses: integer(v.losses, 'Final standing losses'), pointsFor: integer(v.pointsFor, 'Final standing pointsFor'), pointsAgainst: integer(v.pointsAgainst, 'Final standing pointsAgainst'), pointDifference: integer(v.pointDifference, 'Final standing pointDifference') } }
function readPlayerLine(value: unknown) { const v = record(value, 'Player stat line'); return { playerId: playerIdFromString(string(v.playerId, 'Player stat playerId')), teamId: teamIdFromString(string(v.teamId, 'Player stat teamId')), opponentTeamId: teamIdFromString(string(v.opponentTeamId, 'Player stat opponentTeamId')), isHome: boolean(v.isHome, 'Player stat isHome'), started: boolean(v.started, 'Player stat started'), stats: readStats(v.stats) } }
function readStats(value: unknown): PlayerGameStatsSnapshot { const v = record(value, 'Player stats'); return { playerId: playerIdFromString(string(v.playerId, 'Player stats playerId')), secondsPlayed: integer(v.secondsPlayed, 'Player stats secondsPlayed'), points: integer(v.points, 'Player stats points'), fieldGoalsMade: integer(v.fieldGoalsMade, 'Player stats fieldGoalsMade'), fieldGoalsAttempted: integer(v.fieldGoalsAttempted, 'Player stats fieldGoalsAttempted'), twoPointMade: integer(v.twoPointMade, 'Player stats twoPointMade'), twoPointAttempted: integer(v.twoPointAttempted, 'Player stats twoPointAttempted'), threePointMade: integer(v.threePointMade, 'Player stats threePointMade'), threePointAttempted: integer(v.threePointAttempted, 'Player stats threePointAttempted'), freeThrowsMade: integer(v.freeThrowsMade, 'Player stats freeThrowsMade'), freeThrowsAttempted: integer(v.freeThrowsAttempted, 'Player stats freeThrowsAttempted'), offensiveRebounds: integer(v.offensiveRebounds, 'Player stats offensiveRebounds'), defensiveRebounds: integer(v.defensiveRebounds, 'Player stats defensiveRebounds'), rebounds: integer(v.rebounds, 'Player stats rebounds'), assists: integer(v.assists, 'Player stats assists'), steals: integer(v.steals, 'Player stats steals'), blocks: integer(v.blocks, 'Player stats blocks'), turnovers: integer(v.turnovers, 'Player stats turnovers'), foulsCommitted: integer(v.foulsCommitted, 'Player stats foulsCommitted'), plusMinus: integer(v.plusMinus, 'Player stats plusMinus') } }
function copyRecords(values: readonly object[]): readonly JsonRecord[] { return JSON.parse(JSON.stringify(values)) as JsonRecord[] }
function record(value: unknown, name: string): JsonRecord { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as JsonRecord }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value }
function string(value: unknown, name: string): string { if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${name} must be a non-empty string`); return value }
function integer(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) throw new TypeError(`${name} must be an integer`); return value }
function boolean(value: unknown, name: string): boolean { if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`); return value }
function gender(value: unknown): 'male' | 'female' { const result = string(value, 'Gender'); return result === 'male' || result === 'female' ? result : fail('Gender is invalid') }
function position(value: unknown): 'PG' | 'SG' | 'SF' | 'PF' | 'C' { const result = string(value, 'Position'); return ['PG', 'SG', 'SF', 'PF', 'C'].includes(result) ? result as 'PG' | 'SG' | 'SF' | 'PF' | 'C' : fail('Position is invalid') }
function requireIsoTimestamp(value: string): void { if (Number.isNaN(Date.parse(value))) throw new TypeError('Save savedAt must be an ISO-8601 timestamp') }
function fail(message: string): never { throw new TypeError(message) }
