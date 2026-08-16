import { createCoach } from '@/domain/coach'
import { createCompetition, createCompetitionRules } from '@/domain/competition'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { createCountry } from '@/domain/country'
import { parseGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import {
  coachIdFromString,
  competitionIdFromString,
  ecosystemIdFromString,
  countryIdFromString,
  gameIdFromString,
  injuryIdFromString,
  contractIdFromString,
  playerTransactionIdFromString,
  playerIdFromString,
  seasonIdFromString,
  teamIdFromString,
  staffPersonIdFromString,
  teamStaffAssignmentIdFromString,
} from '@/domain/ids'
import { calculateAge, createPlayer } from '@/domain/player'
import { createSeason } from '@/domain/season'
import type { MatchStatLog, PlayerGameStatsSnapshot } from '@/domain/stats/MatchStatLog'
import type { SeasonHistoryRecord } from '@/domain/season'
import { createTeam } from '@/domain/team'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator'
import { generatePlayerPotential } from '@/engine/world/PlayerPotentialGenerator'
import { ensureTeamFinances } from '@/engine/world/TeamFinancesEnrichment'
import { ensurePlayerKnowledge } from '@/engine/world/PlayerKnowledgeEnrichment'
import { ensureStaffStructure } from '@/engine/world/StaffStructureEnrichment'
import { playerKnowledgeIdFromString } from '@/domain/ids'
import { createCoachRpgProfile } from '@/domain/coachRpg'
import { createStaffProfessionalProfile } from '@/domain/staff'
import { createCoachReputationProfile, type CoachReputationSource } from '@/domain/coachReputation'
import { coachJobCandidacyIdFromString, coachJobOfferIdFromString, coachJobOpeningIdFromString, createCoachEmployment } from '@/domain/coachCareer'
import { type RelationshipEventSource, type RelationshipProfile } from '@/domain/relationships'

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
  readonly ecosystems?: readonly JsonRecord[]
  readonly seasons: readonly JsonRecord[]
  readonly games: readonly JsonRecord[]
  readonly matchStatLogs: readonly JsonRecord[]
  readonly seasonHistoryBySeasonId: readonly JsonRecord[]
  readonly injuries: readonly JsonRecord[]
  readonly contracts: readonly JsonRecord[]
  readonly playerTransactions: readonly JsonRecord[]
  readonly teamFinances: readonly JsonRecord[]
  readonly playerKnowledge: readonly JsonRecord[]
  readonly staffPeople: readonly JsonRecord[]
  readonly teamStaffAssignments: readonly JsonRecord[]
  readonly coachProfessionalProfilesByCoachId?: readonly JsonRecord[]
  readonly coachRpgProfilesByCoachId?: readonly JsonRecord[]
  readonly coachReputationProfilesByCoachId?: readonly JsonRecord[]
  readonly coachEmploymentByCoachId?: readonly JsonRecord[]
  readonly coachCareerHistoryByCoachId?: readonly JsonRecord[]
  readonly coachJobOpenings?: readonly JsonRecord[]
  readonly coachJobCandidacies?: readonly JsonRecord[]
  readonly coachInterviews?: readonly JsonRecord[]
  readonly coachJobOffers?: readonly JsonRecord[]
  readonly relationships?: readonly JsonRecord[]
  readonly personalities?: readonly JsonRecord[]
  readonly morale?: readonly JsonRecord[]
  readonly inboxItems?: readonly JsonRecord[]
  readonly newsItems?: readonly JsonRecord[]
  readonly trainingPlans?: readonly JsonRecord[]
  readonly trainingSessions?: readonly JsonRecord[]
  readonly developmentStimulus?: readonly JsonRecord[]
  readonly careerFatigue?: readonly JsonRecord[]
  readonly promotionRelegationResolutions?: readonly JsonRecord[]
  readonly drafts?: readonly JsonRecord[]
  readonly draftPicks?: readonly JsonRecord[]
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
      ecosystems: copyRecords(Object.values(world.ecosystems)),
      seasons: copyRecords(Object.values(world.seasons)),
      games: copyRecords(Object.values(world.games)),
      matchStatLogs: copyRecords(Object.values(world.matchStatLogsByGameId)),
      seasonHistoryBySeasonId: copyRecords(Object.values(world.seasonHistoryBySeasonId)),
      injuries: copyRecords(Object.values(world.injuriesById)),
      contracts: copyRecords(Object.values(world.contractsById)),
      playerTransactions: copyRecords(Object.values(world.playerTransactionsById)),
      teamFinances: copyRecords(Object.values(world.teamFinancesByTeamId)),
      playerKnowledge: copyRecords(Object.values(world.playerKnowledgeById)),
      staffPeople: copyRecords(Object.values(world.staffPeopleById)), teamStaffAssignments: copyRecords(Object.values(world.teamStaffAssignmentsById)),
      coachProfessionalProfilesByCoachId: copyProfiles(world.coachProfessionalProfilesByCoachId),
      coachRpgProfilesByCoachId: copyProfiles(world.coachRpgProfilesByCoachId),
      coachReputationProfilesByCoachId: copyProfiles(world.coachReputationProfilesByCoachId),
      coachEmploymentByCoachId: copyProfiles(world.coachEmploymentByCoachId),
      coachCareerHistoryByCoachId: Object.entries(world.coachCareerHistoryByCoachId).map(([coachId, history]) => ({ coachId, history: copyRecords(history) })),
      coachJobOpenings: copyRecords(Object.values(world.coachJobOpeningsById)),
      coachJobCandidacies: copyRecords(Object.values(world.coachJobCandidaciesById)),
      coachInterviews: copyRecords(Object.values(world.coachInterviewsByCandidacyId)),
      coachJobOffers: copyRecords(Object.values(world.coachJobOffersById)),
      relationships: copyRecords(Object.values(world.relationshipsByKey)),
      personalities: copyProfiles(world.personalitiesByPersonId),
      morale: copyRecords(Object.values(world.moraleByPersonId)),
      inboxItems: copyRecords(Object.values(world.inboxItemsById)), newsItems: copyRecords(Object.values(world.newsItemsById)),
      trainingPlans: copyRecords(Object.values(world.trainingPlansByTeamId)), trainingSessions: copyRecords(Object.values(world.trainingSessionsById)), developmentStimulus: copyRecords(Object.values(world.developmentStimulusByPlayerId)), careerFatigue: Object.entries(world.careerFatigueByPlayerId).map(([playerId, value]) => ({ playerId, value })),
      promotionRelegationResolutions: copyRecords(Object.values(world.promotionRelegationResolutionsById)),
      drafts: copyRecords(Object.values(world.draftsById)), draftPicks: copyRecords(Object.values(world.draftPicksById)),
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
  const teams = array(payload.teams, 'Save teams').map(readTeam)
  const contracts = payload.contracts === undefined ? [] : array(payload.contracts, 'Save contracts').map(readContract)
  const teamFinances = ensureTeamFinances({
    currentDate,
    teams,
    contracts,
    teamFinances: payload.teamFinances === undefined ? [] : array(payload.teamFinances, 'Save teamFinances').map(readTeamFinances),
  })
  const coaches = array(payload.coaches, 'Save coaches').map(readCoach)
  const professionalProfiles = payload.coachProfessionalProfilesByCoachId === undefined ? Object.fromEntries(coaches.map((coach) => [coach.id, createLegacyProfessionalProfile()])) : readCoachProfessionalProfiles(payload.coachProfessionalProfilesByCoachId)
  const rpgProfiles = payload.coachRpgProfilesByCoachId === undefined ? Object.fromEntries(coaches.map((coach) => [coach.id, createLegacyRpgProfile()])) : readCoachRpgProfiles(payload.coachRpgProfilesByCoachId)
  const reputationProfiles = payload.coachReputationProfilesByCoachId === undefined ? undefined : readCoachReputationProfiles(payload.coachReputationProfilesByCoachId)
  const world = createGameWorld({
    currentDate,
    ...(payload.currentSeasonId === undefined ? {} : { currentSeasonId: seasonIdFromString(string(payload.currentSeasonId, 'Save currentSeasonId')) }),
    userCoachId: coachIdFromString(string(payload.userCoachId, 'Save userCoachId')),
    countries: array(payload.countries, 'Save countries').map(readCountry),
    coaches,
    players: array(payload.players, 'Save players').map((player) => readPlayer(player, referenceDate, currentDate)),
    teams,
    competitions: array(payload.competitions, 'Save competitions').map(readCompetition),
    ...(payload.ecosystems === undefined ? {} : { ecosystems: array(payload.ecosystems, 'Save ecosystems').map(readEcosystem) }),
    seasons,
    games: array(payload.games, 'Save games').map(readGame),
    matchStatLogs: array(payload.matchStatLogs, 'Save matchStatLogs').map(readMatchStatLog),
    seasonHistory: historyWasOmitted ? [] : array(payload.seasonHistoryBySeasonId, 'Save seasonHistoryBySeasonId').map(readSeasonHistory),
    promotionRelegationResolutions: payload.promotionRelegationResolutions === undefined ? [] : array(payload.promotionRelegationResolutions, 'Save promotion/relegation resolutions').map(readPromotionRelegationResolution),
    drafts: payload.drafts === undefined ? [] : array(payload.drafts, 'Save drafts').map(readDraft), draftPicks: payload.draftPicks === undefined ? [] : array(payload.draftPicks, 'Save draft picks').map(readDraftPick),
    injuries: payload.injuries === undefined ? [] : array(payload.injuries, 'Save injuries').map(readInjury),
    contracts,
    playerTransactions: payload.playerTransactions === undefined ? [] : array(payload.playerTransactions, 'Save playerTransactions').map(readTransaction),
    teamFinances,
    playerKnowledge: payload.playerKnowledge === undefined ? [] : array(payload.playerKnowledge, 'Save playerKnowledge').map(readPlayerKnowledge),
    staffPeople: payload.staffPeople === undefined ? [] : array(payload.staffPeople, 'Save staffPeople').map(readStaffPerson), teamStaffAssignments: payload.teamStaffAssignments === undefined ? [] : array(payload.teamStaffAssignments, 'Save teamStaffAssignments').map(readStaffAssignment),
    coachProfessionalProfilesByCoachId: professionalProfiles,
    coachRpgProfilesByCoachId: rpgProfiles,
    coachReputationProfilesByCoachId: reputationProfiles,
    ...(payload.coachEmploymentByCoachId === undefined ? {} : { coachEmploymentByCoachId: readCoachEmployment(payload.coachEmploymentByCoachId) }),
    ...(payload.coachCareerHistoryByCoachId === undefined ? {} : { coachCareerHistoryByCoachId: readCoachCareerHistory(payload.coachCareerHistoryByCoachId) }),
    ...(payload.coachJobOpenings === undefined ? {} : { coachJobOpeningsById: readCoachJobOpenings(payload.coachJobOpenings) }),
    ...(payload.coachJobCandidacies === undefined ? {} : { coachJobCandidaciesById: readCoachJobCandidacies(payload.coachJobCandidacies) }),
    ...(payload.coachInterviews === undefined ? {} : { coachInterviewsByCandidacyId: readCoachInterviews(payload.coachInterviews) }),
    ...(payload.coachJobOffers === undefined ? {} : { coachJobOffersById: readCoachJobOffers(payload.coachJobOffers) }),
    ...(payload.relationships === undefined ? {} : { relationshipsByKey: readRelationships(payload.relationships) }),
    ...(payload.personalities === undefined ? {} : { personalitiesByPersonId: readPersonalities(payload.personalities) }),
    ...(payload.morale === undefined ? {} : { moraleByPersonId: readMorale(payload.morale) }),
    ...(payload.inboxItems === undefined ? {} : { inboxItemsById: readInboxItems(payload.inboxItems) }), ...(payload.newsItems === undefined ? {} : { newsItemsById: readNewsItems(payload.newsItems) }),
    ...(payload.trainingPlans === undefined ? {} : { trainingPlansByTeamId: readTrainingPlans(payload.trainingPlans) }), ...(payload.trainingSessions === undefined ? {} : { trainingSessionsById: readTrainingSessions(payload.trainingSessions) }), ...(payload.developmentStimulus === undefined ? {} : { developmentStimulusByPlayerId: readDevelopmentStimulus(payload.developmentStimulus) }), ...(payload.careerFatigue === undefined ? {} : { careerFatigueByPlayerId: readCareerFatigue(payload.careerFatigue) }),
  })
  if (Object.values(world.seasons).some((season) => Object.values(world.games).filter((game) => game.seasonId === season.id).every((game) => game.status === 'completed') && world.seasonHistoryBySeasonId[season.id] === undefined)) {
    throw new Error('Completed season is missing season history')
  }
  return ensureStaffStructure(ensurePlayerKnowledge(world))
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
function readCompetition(value: unknown) { const v = record(value, 'Competition'); return createCompetition({ id: competitionIdFromString(string(v.id, 'Competition id')), name: string(v.name, 'Competition name'), gender: gender(v.gender), participantTeamIds: array(v.participantTeamIds, 'Competition participantTeamIds').map((id) => teamIdFromString(string(id, 'Competition team id'))), ...(v.rules === undefined ? {} : { rules: readCompetitionRules(v.rules) }), ...(v.ecosystemId === undefined ? {} : { ecosystemId: ecosystemIdFromString(string(v.ecosystemId, 'Competition ecosystem id')) }) }) }
function readEcosystem(value: unknown) { const v = record(value, 'Sports ecosystem'); const kind = string(v.kind, 'Sports ecosystem kind'); return createSportsEcosystem({ id: ecosystemIdFromString(string(v.id, 'Sports ecosystem id')), name: string(v.name, 'Sports ecosystem name'), kind: kind === 'fibaLike' || kind === 'nbaLike' ? kind : fail('Sports ecosystem kind is invalid'), domesticTiers: v.domesticTiers === undefined ? [] : array(v.domesticTiers, 'Domestic tiers').map((tier) => { const t = record(tier, 'Domestic tier'); return { competitionId: competitionIdFromString(string(t.competitionId, 'Domestic tier competition')), level: integer(t.level, 'Domestic tier level') } }), tierMovementRules: v.tierMovementRules === undefined ? [] : array(v.tierMovementRules, 'Tier movement rules').map((rule) => { const r = record(rule, 'Tier movement rule'); return { upperCompetitionId: competitionIdFromString(string(r.upperCompetitionId, 'Tier rule upper competition')), lowerCompetitionId: competitionIdFromString(string(r.lowerCompetitionId, 'Tier rule lower competition')), exchangeCount: integer(r.exchangeCount, 'Tier rule exchange count') } }) }) }
function readCompetitionRules(value: unknown) { const v = record(value, 'Competition rules'); const schedule = record(v.schedule, 'Competition schedule rules'); const standings = record(v.standings, 'Competition standings rules'); return createCompetitionRules({ format: string(v.format, 'Competition format') as 'leagueRoundRobin', schedule: { meetingsPerPair: integer(schedule.meetingsPerPair, 'Competition meetings per pair'), homeAwayBalance: string(schedule.homeAwayBalance, 'Competition home/away balance') as 'equal' }, standings: { tiebreakers: array(standings.tiebreakers, 'Competition tiebreakers').map((item) => string(item, 'Competition tiebreaker') as import('@/domain/competition').StandingsTiebreaker) }, completion: string(v.completion, 'Competition completion rule') as 'allScheduledGamesCompleted', champion: string(v.champion, 'Competition champion rule') as 'standingsLeader' }) }
function readSeason(value: unknown) { const v = record(value, 'Season'); return createSeason({ id: seasonIdFromString(string(v.id, 'Season id')), competitionId: competitionIdFromString(string(v.competitionId, 'Season competitionId')), label: string(v.label, 'Season label'), startDate: parseGameDate(string(v.startDate, 'Season startDate')), endDate: parseGameDate(string(v.endDate, 'Season endDate')), ...(v.participantTeamIds === undefined ? {} : { participantTeamIds: array(v.participantTeamIds, 'Season participantTeamIds').map((id) => teamIdFromString(string(id, 'Season team id'))) }) }) }
function readPromotionRelegationResolution(value: unknown) { const v = record(value, 'Promotion/relegation resolution'); return { id: string(v.id, 'Promotion/relegation resolution id'), upperCompetitionId: competitionIdFromString(string(v.upperCompetitionId, 'Resolution upper competition')), lowerCompetitionId: competitionIdFromString(string(v.lowerCompetitionId, 'Resolution lower competition')), upperSeasonId: seasonIdFromString(string(v.upperSeasonId, 'Resolution upper season')), lowerSeasonId: seasonIdFromString(string(v.lowerSeasonId, 'Resolution lower season')), promotedTeamIds: array(v.promotedTeamIds, 'Resolution promoted teams').map((id) => teamIdFromString(string(id, 'Resolution promoted team'))), relegatedTeamIds: array(v.relegatedTeamIds, 'Resolution relegated teams').map((id) => teamIdFromString(string(id, 'Resolution relegated team'))), resolvedDate: parseGameDate(string(v.resolvedDate, 'Resolution date')) } }
function readDraft(value: unknown) { const v = record(value, 'Draft'); const rules = record(v.rules, 'Draft rules'); const status = string(v.status, 'Draft status'); return { id: string(v.id, 'Draft id'), ecosystemId: ecosystemIdFromString(string(v.ecosystemId, 'Draft ecosystem')), sourceSeasonId: seasonIdFromString(string(v.sourceSeasonId, 'Draft source season')), rules: { rounds: integer(rules.rounds, 'Draft rounds'), orderMethod: string(rules.orderMethod, 'Draft order method') as 'reverseStandings', scheduledAfterDays: integer(rules.scheduledAfterDays, 'Draft timing') }, scheduledOn: parseGameDate(string(v.scheduledOn, 'Draft date')), status: ['scheduled','inProgress','completed'].includes(status) ? status as import('@/domain/draft').DraftStatus : fail('Draft status is invalid'), prospectPlayerIds: array(v.prospectPlayerIds, 'Draft prospects').map((id) => playerIdFromString(string(id, 'Draft prospect'))) } }
function readDraftPick(value: unknown) { const v = record(value, 'Draft pick'); const selection = v.selection === undefined ? undefined : record(v.selection, 'Draft selection'); return { id: string(v.id, 'Draft pick id'), draftId: string(v.draftId, 'Draft pick draft'), round: integer(v.round, 'Draft pick round'), order: integer(v.order, 'Draft pick order'), originalTeamId: teamIdFromString(string(v.originalTeamId, 'Draft pick original Team')), ownerTeamId: teamIdFromString(string(v.ownerTeamId, 'Draft pick owner Team')), ...(selection === undefined ? {} : { selection: { playerId: playerIdFromString(string(selection.playerId, 'Draft selection Player')), teamId: teamIdFromString(string(selection.teamId, 'Draft selection Team')) } }) } }
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
function readTeamFinances(value:unknown){const v=record(value,'Team finances');return{teamId:teamIdFromString(string(v.teamId,'Team finances teamId')),playerSalaryBudget:integer(v.playerSalaryBudget,'Team finances playerSalaryBudget')}}
function readPlayerKnowledge(value:unknown){const v=record(value,'Player knowledge');const basketball=record(v.basketball,'Player knowledge basketball');const ratings=record(basketball.ratings,'Player knowledge ratings');const read=(key:string)=>{const rating=record(ratings[key],`Player knowledge ${key}`);return{estimatedValue:integer(rating.estimatedValue,`Player knowledge ${key} estimate`),uncertainty:integer(rating.uncertainty,`Player knowledge ${key} uncertainty`)}};return{id:playerKnowledgeIdFromString(string(v.id,'Player knowledge id')),observerTeamId:teamIdFromString(string(v.observerTeamId,'Player knowledge observerTeamId')),subjectPlayerId:playerIdFromString(string(v.subjectPlayerId,'Player knowledge subjectPlayerId')),assessedOn:parseGameDate(string(v.assessedOn,'Player knowledge assessedOn')),basketball:{ratings:{finishing:read('finishing'),shooting:read('shooting'),playmaking:read('playmaking'),perimeterDefense:read('perimeterDefense'),interiorDefense:read('interiorDefense'),rebounding:read('rebounding'),athleticism:read('athleticism')}}}}
function readStaffPerson(value:unknown){const v=record(value,'Staff person');const identity=record(v.identity,'Staff identity');const profile=record(v.professional,'Staff professional');const a=record(profile.attributes,'Staff attributes');const read=(key:string)=>integer(a[key],`Staff ${key}`);return{id:staffPersonIdFromString(string(v.id,'Staff id')),identity:{firstName:string(identity.firstName,'Staff firstName'),lastName:string(identity.lastName,'Staff lastName')},professional:{attributes:{coaching:read('coaching'),tacticalKnowledge:read('tacticalKnowledge'),playerDevelopment:read('playerDevelopment'),talentEvaluation:read('talentEvaluation'),potentialEvaluation:read('potentialEvaluation'),medicalKnowledge:read('medicalKnowledge'),rehabilitation:read('rehabilitation'),analysis:read('analysis'),leadership:read('leadership'),communication:read('communication'),motivation:read('motivation'),discipline:read('discipline'),adaptability:read('adaptability')}}}}
function readStaffAssignment(value:unknown){const v=record(value,'Staff assignment');const role=string(v.role,'Staff role');return{id:teamStaffAssignmentIdFromString(string(v.id,'Staff assignment id')),staffPersonId:staffPersonIdFromString(string(v.staffPersonId,'Staff assignment person')),teamId:teamIdFromString(string(v.teamId,'Staff assignment team')),role:role as import('@/domain/staff').StaffRole,assignedOn:parseGameDate(string(v.assignedOn,'Staff assignedOn'))}}
function createLegacyProfessionalProfile() { return createStaffProfessionalProfile({ attributes: { coaching: 0, tacticalKnowledge: 0, playerDevelopment: 0, talentEvaluation: 0, potentialEvaluation: 0, medicalKnowledge: 0, rehabilitation: 0, analysis: 0, leadership: 0, communication: 0, motivation: 0, discipline: 0, adaptability: 0 } }) }
function createLegacyRpgProfile() { return createCoachRpgProfile({ professionalExperience: { byAttribute: { coaching: 0, tacticalKnowledge: 0, playerDevelopment: 0, talentEvaluation: 0, potentialEvaluation: 0, medicalKnowledge: 0, rehabilitation: 0, analysis: 0, leadership: 0, communication: 0, motivation: 0, discipline: 0, adaptability: 0 } }, development: { globalProgress: 0, developmentPoints: 0 }, skills: {}, professionalTraits: [], professionalTraitEvidence: {}, perks: {} }) }
function copyProfiles(values: Readonly<Record<string, object>>): readonly JsonRecord[] { return Object.entries(values).map(([coachId, profile]) => ({ coachId, profile: JSON.parse(JSON.stringify(profile)) as JsonRecord })) }
function readCoachProfessionalProfiles(value: unknown) { return Object.fromEntries(array(value, 'Save coach professional profiles').map((entry) => { const v=record(entry,'Coach professional profile');const p=record(v.profile,'Coach professional profile value');const a=record(p.attributes,'Coach professional attributes');return [coachIdFromString(string(v.coachId,'Coach profile coachId')),createStaffProfessionalProfile({attributes:{coaching:integer(a.coaching,'coaching'),tacticalKnowledge:integer(a.tacticalKnowledge,'tacticalKnowledge'),playerDevelopment:integer(a.playerDevelopment,'playerDevelopment'),talentEvaluation:integer(a.talentEvaluation,'talentEvaluation'),potentialEvaluation:integer(a.potentialEvaluation,'potentialEvaluation'),medicalKnowledge:integer(a.medicalKnowledge,'medicalKnowledge'),rehabilitation:integer(a.rehabilitation,'rehabilitation'),analysis:integer(a.analysis,'analysis'),leadership:integer(a.leadership,'leadership'),communication:integer(a.communication,'communication'),motivation:integer(a.motivation,'motivation'),discipline:integer(a.discipline,'discipline'),adaptability:integer(a.adaptability,'adaptability')}})] })) }
function readCoachRpgProfiles(value: unknown) { return Object.fromEntries(array(value,'Save coach RPG profiles').map((entry)=>{const v=record(entry,'Coach RPG profile');return [coachIdFromString(string(v.coachId,'Coach RPG coachId')),createCoachRpgProfile(record(v.profile,'Coach RPG profile value') as never)]})) }
function readCoachReputationProfiles(value: unknown) { return Object.fromEntries(array(value, 'Save coach reputation profiles').map((entry) => { const v = record(entry, 'Coach reputation profile'); const profile = record(v.profile, 'Coach reputation profile value'); const values = record(profile.values, 'Coach reputation values'); return [coachIdFromString(string(v.coachId, 'Coach reputation coachId')), createCoachReputationProfile({ values: { competitive: number(values.competitive, 'Coach reputation competitive'), development: number(values.development, 'Coach reputation development'), professional: number(values.professional, 'Coach reputation professional'), publicStanding: number(values.publicStanding, 'Coach reputation publicStanding') }, events: array(profile.events, 'Coach reputation events').map(readCoachReputationEvent) })] })) }
function readCoachEmployment(value: unknown) { return Object.fromEntries(array(value, 'Save coach employment').map((entry) => { const v = record(entry, 'Coach employment'); const p = record(v.profile, 'Coach employment value'); const status = string(p.status, 'Coach employment status'); return [coachIdFromString(string(v.coachId, 'Coach employment coachId')), createCoachEmployment(status === 'employed' ? { status, teamId: teamIdFromString(string(p.teamId, 'Coach employment teamId')), ...(p.startedOn === undefined ? {} : { startedOn: parseGameDate(string(p.startedOn, 'Coach employment startedOn')) }) } : { status: status === 'unemployed' ? status : fail('Coach employment status is invalid') })] })) }
function readCoachCareerHistory(value: unknown) { return Object.fromEntries(array(value, 'Save coach career history').map((entry) => { const v = record(entry, 'Coach career history'); const coachId = coachIdFromString(string(v.coachId, 'Coach career history coachId')); return [coachId, array(v.history, 'Coach career history entries').map((item) => { const h = record(item, 'Coach career history entry'); const kind = string(h.kind, 'Coach career history kind'); const reason = string(h.reason, 'Coach career history reason'); return { kind: kind === 'appointment' || kind === 'departure' ? kind : fail('Coach career history kind is invalid'), coachId: coachIdFromString(string(h.coachId, 'Coach career history entry coachId')), teamId: teamIdFromString(string(h.teamId, 'Coach career history teamId')), date: parseGameDate(string(h.date, 'Coach career history date')), reason } as never })] })) }
function readCoachJobOpenings(value: unknown) { return Object.fromEntries(array(value, 'Save coach job openings').map((entry) => { const v = record(entry, 'Coach job opening'); const id = coachJobOpeningIdFromString(string(v.id, 'Coach job opening id')); return [id, { id, teamId: teamIdFromString(string(v.teamId, 'Coach job opening teamId')), status: string(v.status, 'Coach job opening status') as never, createdOn: parseGameDate(string(v.createdOn, 'Coach job opening createdOn')) }] })) }
function readCoachJobCandidacies(value: unknown) { return Object.fromEntries(array(value, 'Save coach candidacies').map((entry) => { const v = record(entry, 'Coach candidacy'); const id = coachJobCandidacyIdFromString(string(v.id, 'Coach candidacy id')); return [id, { id, jobOpeningId: coachJobOpeningIdFromString(string(v.jobOpeningId, 'Coach candidacy opening')), coachId: coachIdFromString(string(v.coachId, 'Coach candidacy coach')), status: string(v.status, 'Coach candidacy status') as never, createdOn: parseGameDate(string(v.createdOn, 'Coach candidacy createdOn')) }] })) }
function readCoachInterviews(value: unknown) { return Object.fromEntries(array(value, 'Save coach interviews').map((entry) => { const v = record(entry, 'Coach interview'); const candidacyId = coachJobCandidacyIdFromString(string(v.candidacyId, 'Coach interview candidacy')); return [candidacyId, { candidacyId, status: string(v.status, 'Coach interview status') as never }] })) }
function readCoachJobOffers(value: unknown) { return Object.fromEntries(array(value, 'Save coach offers').map((entry) => { const v = record(entry, 'Coach offer'); const id = coachJobOfferIdFromString(string(v.id, 'Coach offer id')); return [id, { id, jobOpeningId: coachJobOpeningIdFromString(string(v.jobOpeningId, 'Coach offer opening')), coachId: coachIdFromString(string(v.coachId, 'Coach offer coach')), teamId: teamIdFromString(string(v.teamId, 'Coach offer team')), createdOn: parseGameDate(string(v.createdOn, 'Coach offer createdOn')), status: string(v.status, 'Coach offer status') as never }] })) }
function readRelationships(value: unknown): Readonly<Record<string, RelationshipProfile>> { return Object.fromEntries(array(value, 'Save relationships').map((entry) => { const v = record(entry, 'Relationship'); const sourceId = string(v.sourceId, 'Relationship source person'); const targetId = string(v.targetId, 'Relationship target person'); return [`${sourceId}->${targetId}`, { sourceId, targetId, value: integer(v.value, 'Relationship value'), events: array(v.events, 'Relationship events').map(readRelationshipEvent) }] })) }
function readRelationshipEvent(value: unknown) { const v = record(value, 'Relationship event'); const source = string(v.source, 'Relationship event source'); return { id: string(v.id, 'Relationship event id'), gameDate: parseGameDate(string(v.gameDate, 'Relationship event date')), source: ['careerEvent', 'teamDecision', 'playingTime', 'developmentEvent', 'professionalInteraction'].includes(source) ? source as RelationshipEventSource : fail('Relationship event source is invalid'), delta: integer(v.delta, 'Relationship event delta'), context: readRelationshipContext(record(v.context, 'Relationship event context')) } }
function readRelationshipContext(context: JsonRecord): Readonly<Record<string, string | number | boolean>> { const result: Record<string, string | number | boolean> = {}; for (const [key, value] of Object.entries(context)) { if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new TypeError(`Relationship event context ${key} is invalid`); if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`Relationship event context ${key} is invalid`); result[key] = value } return result }
function readPersonalities(value: unknown) { return Object.fromEntries(array(value, 'Save personalities').map((entry) => { const v = record(entry, 'Personality'); const p = record(v.profile, 'Personality profile'); const values = record(p.values, 'Personality values'); return [string(v.coachId, 'Personality person'), { values: { ambition: integer(values.ambition, 'Personality ambition'), professionalism: integer(values.professionalism, 'Personality professionalism'), loyalty: integer(values.loyalty, 'Personality loyalty'), resilience: integer(values.resilience, 'Personality resilience'), temperament: integer(values.temperament, 'Personality temperament'), teamOrientation: integer(values.teamOrientation, 'Personality teamOrientation') } }] })) }
function readMorale(value: unknown) { return Object.fromEntries(array(value, 'Save morale').map((entry) => { const v = record(entry, 'Morale'); const personId = string(v.personId, 'Morale person'); return [personId, { personId, value: integer(v.value, 'Morale value'), events: array(v.events, 'Morale events').map((item) => { const e = record(item, 'Morale event'); return { id: string(e.id, 'Morale event id'), personId: string(e.personId, 'Morale event person'), gameDate: parseGameDate(string(e.gameDate, 'Morale event date')), source: string(e.source, 'Morale event source') as import('@/domain/morale').MoraleEventSource, delta: integer(e.delta, 'Morale event delta'), context: readRelationshipContext(record(e.context, 'Morale event context')) } }) }] })) }
function readInboxItems(value:unknown){return Object.fromEntries(array(value,'Save inbox').map(item=>{const v=record(item,'Inbox');const id=string(v.id,'Inbox id');const action=v.action===undefined?undefined:record(v.action,'Inbox action');return[id,{id,coachId:string(v.coachId,'Inbox coach'),gameDate:parseGameDate(string(v.gameDate,'Inbox date')),category:string(v.category,'Inbox category') as import('@/domain/inbox').InboxCategory,priority:string(v.priority,'Inbox priority') as import('@/domain/inbox').InboxPriority,title:string(v.title,'Inbox title'),body:string(v.body,'Inbox body'),status:string(v.status,'Inbox status') as import('@/domain/inbox').InboxItemStatus,...(action===undefined?{}:{action:{type:string(action.type,'Inbox action type') as 'coachJobOffer',entityId:string(action.entityId,'Inbox action entity')}}),context:readRelationshipContext(record(v.context,'Inbox context'))}]}))}
function readNewsItems(value:unknown){return Object.fromEntries(array(value,'Save news').map(item=>{const v=record(item,'News');const id=string(v.id,'News id');return[id,{id,gameDate:parseGameDate(string(v.gameDate,'News date')),category:string(v.category,'News category') as import('@/domain/inbox').NewsCategory,headline:string(v.headline,'News headline'),body:string(v.body,'News body'),context:readRelationshipContext(record(v.context,'News context'))}]}))}
function readTrainingPlans(value: unknown) { return Object.fromEntries(array(value, 'Save training plans').map((item) => { const v = record(item, 'Training plan'); const teamId = string(v.teamId, 'Training plan team'); return [teamId, { teamId, intensity: string(v.intensity, 'Training intensity') as import('@/domain/training').TrainingIntensity, focus: string(v.focus, 'Training focus') as import('@/domain/training').TrainingFocus }] })) }
function readTrainingSessions(value: unknown) { return Object.fromEntries(array(value, 'Save training sessions').map((item) => { const v = record(item, 'Training session'); const id = string(v.id, 'Training session id'); return [id, { id, teamId: string(v.teamId, 'Training session team'), gameDate: parseGameDate(string(v.gameDate, 'Training session date')), intensity: string(v.intensity, 'Training session intensity') as import('@/domain/training').TrainingIntensity, focus: string(v.focus, 'Training session focus') as import('@/domain/training').TrainingFocus, playerResults: array(v.playerResults, 'Training session results').map((result) => { const r = record(result, 'Training player result'); const stimulus = record(r.stimulus, 'Training player stimulus'); return { playerId: string(r.playerId, 'Training result player'), stimulus: { finishing: number(stimulus.finishing, 'Training finishing'), shooting: number(stimulus.shooting, 'Training shooting'), playmaking: number(stimulus.playmaking, 'Training playmaking'), perimeterDefense: number(stimulus.perimeterDefense, 'Training perimeter defense'), interiorDefense: number(stimulus.interiorDefense, 'Training interior defense'), rebounding: number(stimulus.rebounding, 'Training rebounding'), athleticism: number(stimulus.athleticism, 'Training athleticism') }, careerFatigueAdded: number(r.careerFatigueAdded, 'Training fatigue') } }) }] })) }
function readDevelopmentStimulus(value: unknown) { return Object.fromEntries(array(value, 'Save development stimulus').map((item) => { const v = record(item, 'Development stimulus'); const r = record(v.byRating, 'Development stimulus ratings'); const playerId = string(v.playerId, 'Development stimulus player'); return [playerId, { playerId, byRating: { finishing: number(r.finishing, 'Stimulus finishing'), shooting: number(r.shooting, 'Stimulus shooting'), playmaking: number(r.playmaking, 'Stimulus playmaking'), perimeterDefense: number(r.perimeterDefense, 'Stimulus perimeter defense'), interiorDefense: number(r.interiorDefense, 'Stimulus interior defense'), rebounding: number(r.rebounding, 'Stimulus rebounding'), athleticism: number(r.athleticism, 'Stimulus athleticism') } }] })) }
function readCareerFatigue(value: unknown) { return Object.fromEntries(array(value, 'Save career fatigue').map((item) => { const v = record(item, 'Career fatigue'); return [string(v.playerId, 'Career fatigue player'), number(v.value, 'Career fatigue value')] })) }
function readCoachReputationEvent(value: unknown) { const v = record(value, 'Coach reputation event'); const source = coachReputationSource(v.source); const context = record(v.context, 'Coach reputation event context'); const deltas = record(v.deltas, 'Coach reputation event deltas'); const result: Record<string, number> = {}; for (const dimension of ['competitive', 'development', 'professional', 'publicStanding']) if (deltas[dimension] !== undefined) result[dimension] = number(deltas[dimension], `Coach reputation event ${dimension}`); return { id: string(v.id, 'Coach reputation event id'), gameDate: parseGameDate(string(v.gameDate, 'Coach reputation event gameDate')), source, deltas: result, context: readCoachReputationContext(context) } }
function readCoachReputationContext(context: JsonRecord) { const kind = coachReputationSource(context.kind); const base = { kind, key: string(context.key, 'Coach reputation event context key') }; if (kind === 'matchResult' && context.gameId !== undefined) return { ...base, gameId: string(context.gameId, 'Coach reputation match gameId'), teamId: string(context.teamId, 'Coach reputation match teamId'), opponentTeamId: string(context.opponentTeamId, 'Coach reputation match opponentTeamId'), seasonId: string(context.seasonId, 'Coach reputation match seasonId'), competitionId: string(context.competitionId, 'Coach reputation match competitionId'), result: matchResult(context.result), expectedWinProbability: number(context.expectedWinProbability, 'Coach reputation expected win probability'), teamStrength: number(context.teamStrength, 'Coach reputation team strength'), opponentTeamStrength: number(context.opponentTeamStrength, 'Coach reputation opponent team strength'), coachIsHome: boolean(context.coachIsHome, 'Coach reputation coach is home') }; if (kind === 'seasonAchievement' && context.achievement !== undefined) return { ...base, seasonId: string(context.seasonId, 'Coach reputation season id'), teamId: string(context.teamId, 'Coach reputation team id'), competitionId: string(context.competitionId, 'Coach reputation competition id'), achievement: seasonAchievement(context.achievement) }; return base }
function matchResult(value: unknown): 'win' | 'loss' { const result = string(value, 'Coach reputation match result'); return result === 'win' || result === 'loss' ? result : fail('Coach reputation match result is invalid') }
function seasonAchievement(value: unknown): 'champion' { return string(value, 'Coach reputation season achievement') === 'champion' ? 'champion' : fail('Coach reputation season achievement is invalid') }
function coachReputationSource(value: unknown): CoachReputationSource { const source = string(value, 'Coach reputation source'); return ['matchResult', 'seasonAchievement', 'professionalEvent', 'developmentEvent', 'publicEvent'].includes(source) ? source as CoachReputationSource : fail('Coach reputation source is invalid') }
function readFinalStanding(value: unknown) { const v = record(value, 'Final standing'); return { position: integer(v.position, 'Final standing position'), teamId: teamIdFromString(string(v.teamId, 'Final standing teamId')), played: integer(v.played, 'Final standing played'), wins: integer(v.wins, 'Final standing wins'), losses: integer(v.losses, 'Final standing losses'), pointsFor: integer(v.pointsFor, 'Final standing pointsFor'), pointsAgainst: integer(v.pointsAgainst, 'Final standing pointsAgainst'), pointDifference: integer(v.pointDifference, 'Final standing pointDifference') } }
function readPlayerLine(value: unknown) { const v = record(value, 'Player stat line'); return { playerId: playerIdFromString(string(v.playerId, 'Player stat playerId')), teamId: teamIdFromString(string(v.teamId, 'Player stat teamId')), opponentTeamId: teamIdFromString(string(v.opponentTeamId, 'Player stat opponentTeamId')), isHome: boolean(v.isHome, 'Player stat isHome'), started: boolean(v.started, 'Player stat started'), stats: readStats(v.stats) } }
function readStats(value: unknown): PlayerGameStatsSnapshot { const v = record(value, 'Player stats'); return { playerId: playerIdFromString(string(v.playerId, 'Player stats playerId')), secondsPlayed: integer(v.secondsPlayed, 'Player stats secondsPlayed'), points: integer(v.points, 'Player stats points'), fieldGoalsMade: integer(v.fieldGoalsMade, 'Player stats fieldGoalsMade'), fieldGoalsAttempted: integer(v.fieldGoalsAttempted, 'Player stats fieldGoalsAttempted'), twoPointMade: integer(v.twoPointMade, 'Player stats twoPointMade'), twoPointAttempted: integer(v.twoPointAttempted, 'Player stats twoPointAttempted'), threePointMade: integer(v.threePointMade, 'Player stats threePointMade'), threePointAttempted: integer(v.threePointAttempted, 'Player stats threePointAttempted'), freeThrowsMade: integer(v.freeThrowsMade, 'Player stats freeThrowsMade'), freeThrowsAttempted: integer(v.freeThrowsAttempted, 'Player stats freeThrowsAttempted'), offensiveRebounds: integer(v.offensiveRebounds, 'Player stats offensiveRebounds'), defensiveRebounds: integer(v.defensiveRebounds, 'Player stats defensiveRebounds'), rebounds: integer(v.rebounds, 'Player stats rebounds'), assists: integer(v.assists, 'Player stats assists'), steals: integer(v.steals, 'Player stats steals'), blocks: integer(v.blocks, 'Player stats blocks'), turnovers: integer(v.turnovers, 'Player stats turnovers'), foulsCommitted: integer(v.foulsCommitted, 'Player stats foulsCommitted'), plusMinus: integer(v.plusMinus, 'Player stats plusMinus') } }
function copyRecords(values: readonly object[]): readonly JsonRecord[] { return JSON.parse(JSON.stringify(values)) as JsonRecord[] }
function record(value: unknown, name: string): JsonRecord { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as JsonRecord }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value }
function string(value: unknown, name: string): string { if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${name} must be a non-empty string`); return value }
function integer(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) throw new TypeError(`${name} must be an integer`); return value }
function number(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`); return value }
function boolean(value: unknown, name: string): boolean { if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`); return value }
function gender(value: unknown): 'male' | 'female' { const result = string(value, 'Gender'); return result === 'male' || result === 'female' ? result : fail('Gender is invalid') }
function position(value: unknown): 'PG' | 'SG' | 'SF' | 'PF' | 'C' { const result = string(value, 'Position'); return ['PG', 'SG', 'SF', 'PF', 'C'].includes(result) ? result as 'PG' | 'SG' | 'SF' | 'PF' | 'C' : fail('Position is invalid') }
function requireIsoTimestamp(value: string): void { if (Number.isNaN(Date.parse(value))) throw new TypeError('Save savedAt must be an ISO-8601 timestamp') }
function fail(message: string): never { throw new TypeError(message) }
