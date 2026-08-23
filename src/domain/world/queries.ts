import type { Coach } from '@/domain/coach'
import type { Competition } from '@/domain/competition'
import type { SportsEcosystem } from '@/domain/ecosystem'
import type { Conference } from '@/domain/conference'
import type { Country } from '@/domain/country'
import type { Game } from '@/domain/game'
import type {
  CoachId,
  CompetitionId,
  EcosystemId,
  CountryId,
  GameId,
  PlayerId,
  SeasonId,
  TeamId,
} from '@/domain/ids'
import type { Player } from '@/domain/player'
import type { Season } from '@/domain/season'
import type { Team } from '@/domain/team'
import { calculateHeadCoachProfessionalProficiency, type CoachRpgProfile } from '@/domain/coachRpg'
import type { StaffProfessionalProfile } from '@/domain/staff'
import type { CoachReputationProfile } from '@/domain/coachReputation'
import type { CoachCareerHistoryEntry, CoachEmployment } from '@/domain/coachCareer'
import { getCoachFinancialPosition, type CoachFinanceProfile } from '@/domain/coachFinances'

import { GameWorldValidationError, type GameWorld } from './GameWorld'
import { getRelationshipBand, relationshipKey, type RelationshipPersonId } from '@/domain/relationships'
import { getMoraleBand, getRecentMoraleEvents } from '@/domain/morale'
import type { InboxItem, NewsItem } from '@/domain/inbox'
import { createDefaultTrainingPlan, type TeamTrainingPlan, type TrainingSession } from '@/domain/training'
import { getCurrentlyRelevantMemories, getMemoriesBetween, getMemoryReinforcement, getRecentMemories, queryMemories, type MemoryQuery } from '@/domain/memory'
import { getNarrativeRelevance, type NarrativeThread } from '@/domain/narrative'

export function getCountry(world: GameWorld, id: CountryId): Country {
  return getEntity(world.countries, id, 'Country')
}

export function getCoach(world: GameWorld, id: CoachId): Coach {
  return getEntity(world.coaches, id, 'Coach')
}

export function getPlayer(world: GameWorld, id: PlayerId): Player {
  return getEntity(world.players, id, 'Player')
}

export function getTeam(world: GameWorld, id: TeamId): Team {
  return getEntity(world.teams, id, 'Team')
}

export function getCompetition(world: GameWorld, id: CompetitionId): Competition {
  return getEntity(world.competitions, id, 'Competition')
}
export function getEcosystem(world: GameWorld, id: EcosystemId): SportsEcosystem { return getEntity(world.ecosystems, id, 'Sports ecosystem') }
export function getEcosystems(world: GameWorld): readonly SportsEcosystem[] { return Object.values(world.ecosystems).sort((a, b) => a.id.localeCompare(b.id)) }
export function getEcosystemsByKind(world: GameWorld, kind: SportsEcosystem['kind']): readonly SportsEcosystem[] { return getEcosystems(world).filter((ecosystem) => ecosystem.kind === kind) }
export function isNbaLikeCompetition(world: GameWorld, competitionId: CompetitionId): boolean { return getEcosystemForCompetition(world, competitionId).kind === 'nbaLike' }
export function getConference(world: GameWorld, id: import('@/domain/ids').ConferenceId): Conference { return getEntity(world.conferencesById, id, 'Conference') }
export function getConferencesForEcosystem(world: GameWorld, ecosystemId: EcosystemId): readonly Conference[] { return Object.values(world.conferencesById).filter((conference) => conference.ecosystemId === ecosystemId).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }
export function getConferenceMembers(world: GameWorld, conferenceId: import('@/domain/ids').ConferenceId, seasonId: SeasonId): readonly Team[] { getConference(world, conferenceId); return world.conferenceMemberships.filter((membership) => membership.conferenceId === conferenceId && membership.seasonId === seasonId).map((membership) => getTeam(world, membership.teamId)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }
export function getTeamConferenceMembership(world: GameWorld, teamId: TeamId, seasonId: SeasonId) { return world.conferenceMemberships.find((membership) => membership.teamId === teamId && membership.seasonId === seasonId) }
export function getEcosystemForCompetition(world: GameWorld, competitionId: CompetitionId): SportsEcosystem { return getEcosystem(world, getCompetition(world, competitionId).ecosystemId) }
export function getCompetitionsForEcosystem(world: GameWorld, ecosystemId: EcosystemId): readonly Competition[] { getEcosystem(world, ecosystemId); return getCompetitions(world).filter((competition) => competition.ecosystemId === ecosystemId) }
export function getEcosystemForTeam(world: GameWorld, teamId: TeamId): SportsEcosystem | undefined { return getCompetitionsForTeam(world, teamId).map((competition) => getEcosystem(world, competition.ecosystemId)).sort((a, b) => a.id.localeCompare(b.id))[0] }
export function getTeamsForEcosystem(world: GameWorld, ecosystemId: EcosystemId): readonly Team[] { return [...new Set(getCompetitionsForEcosystem(world, ecosystemId).flatMap((competition) => competition.participantTeamIds))].sort().map((teamId) => getTeam(world, teamId)) }
export function getCompetitions(world: GameWorld): readonly Competition[] { return Object.values(world.competitions).sort((a, b) => a.id.localeCompare(b.id)) }
export function getCompetitionsForTeam(world: GameWorld, teamId: TeamId): readonly Competition[] { return getCompetitions(world).filter((competition) => competition.participantTeamIds.includes(teamId)) }
export function getGamesForCompetition(world: GameWorld, competitionId: CompetitionId): readonly Game[] { getCompetition(world, competitionId); return Object.values(world.games).filter((game) => game.competitionId === competitionId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) }
export function getGamesForTeam(world: GameWorld, teamId: TeamId): readonly Game[] { getTeam(world, teamId); return Object.values(world.games).filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) }

export function getSeason(world: GameWorld, id: SeasonId): Season {
  return getEntity(world.seasons, id, 'Season')
}

export function getGame(world: GameWorld, id: GameId): Game {
  return getEntity(world.games, id, 'Game')
}

export function getUserCoach(world: GameWorld): Coach {
  return getCoach(world, world.userCoachId)
}
export function getCoachProfessionalProfile(world: GameWorld, coachId: CoachId): StaffProfessionalProfile | undefined { return world.coachProfessionalProfilesByCoachId[coachId] }
export function getCoachRpgProfile(world: GameWorld, coachId: CoachId): CoachRpgProfile | undefined { return world.coachRpgProfilesByCoachId[coachId] }
export function getCoachReputationProfile(world: GameWorld, coachId: CoachId): CoachReputationProfile | undefined { return world.coachReputationProfilesByCoachId[coachId] }
export function getCoachEmployment(world: GameWorld, coachId: CoachId): CoachEmployment | undefined { return world.coachEmploymentByCoachId[coachId] }
export function getCoachCareerHistory(world: GameWorld, coachId: CoachId): readonly CoachCareerHistoryEntry[] | undefined { return world.coachCareerHistoryByCoachId[coachId] }
export function getUserCoachProfessionalProfile(world: GameWorld): StaffProfessionalProfile | undefined { return getCoachProfessionalProfile(world, world.userCoachId) }
export function getUserCoachRpgProfile(world: GameWorld): CoachRpgProfile | undefined { return getCoachRpgProfile(world, world.userCoachId) }
export function getUserCoachReputationProfile(world: GameWorld): CoachReputationProfile | undefined { return getCoachReputationProfile(world, world.userCoachId) }
export function getCoachFinanceProfile(world: GameWorld, coachId: CoachId): CoachFinanceProfile | undefined { return world.coachFinancesByCoachId[coachId] }
export function getUserCoachFinanceProfile(world: GameWorld): CoachFinanceProfile | undefined { return getCoachFinanceProfile(world, world.userCoachId) }
export function getCoachFinancialPositionForCareer(world: GameWorld, coachId: CoachId) { const profile = getCoachFinanceProfile(world, coachId); return profile === undefined ? undefined : getCoachFinancialPosition(profile) }
export function getUserCoachFinancialSummary(world: GameWorld) { const profile = getUserCoachFinanceProfile(world); return profile === undefined ? undefined : { profile, ...getCoachFinancialPosition(profile) } }
export function getCoachProfessionalProficiency(world: GameWorld, coachId: CoachId): number | undefined { const profile=getCoachProfessionalProfile(world, coachId); return profile===undefined?undefined:calculateHeadCoachProfessionalProficiency(profile) }
export function getRelationshipValue(world: GameWorld, sourceId: RelationshipPersonId, targetId: RelationshipPersonId): number { return world.relationshipsByKey[relationshipKey(sourceId, targetId)]?.value ?? 0 }
export function getRelationshipBandForPeople(world: GameWorld, sourceId: RelationshipPersonId, targetId: RelationshipPersonId) { return getRelationshipBand(getRelationshipValue(world, sourceId, targetId)) }
export function getRelationshipsForPerson(world: GameWorld, personId: RelationshipPersonId) { return Object.values(world.relationshipsByKey).filter((profile) => profile.sourceId === personId || profile.targetId === personId).sort((a, b) => b.value - a.value || a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId)) }
export function getPersonality(world: GameWorld, personId: string) { return world.personalitiesByPersonId[personId] }
export function getMorale(world: GameWorld, personId: string) { return world.moraleByPersonId[personId] }
export function getMoraleBandForPerson(world: GameWorld, personId: string) { const morale = getMorale(world, personId); return morale === undefined ? undefined : getMoraleBand(morale.value) }
export function getRecentMoraleEventsForPerson(world: GameWorld, personId: string, limit = 5) { const morale = getMorale(world, personId); return morale === undefined ? [] : getRecentMoraleEvents(morale, limit) }
export function getInboxItemsForCoach(world: GameWorld, coachId: string): readonly InboxItem[] { return Object.values(world.inboxItemsById).filter((item)=>item.coachId===coachId).sort((a,b)=>b.gameDate.localeCompare(a.gameDate)||a.id.localeCompare(b.id)) }
export function getUnreadInboxCount(world: GameWorld, coachId: string):number{return getInboxItemsForCoach(world,coachId).filter((item)=>item.status==='unread').length}
export function getNewsFeed(world: GameWorld):readonly NewsItem[]{return Object.values(world.newsItemsById).sort((a,b)=>b.gameDate.localeCompare(a.gameDate)||a.id.localeCompare(b.id))}
export function getTrainingPlanForTeam(world: GameWorld, teamId: TeamId): TeamTrainingPlan { return world.trainingPlansByTeamId[teamId] ?? createDefaultTrainingPlan(teamId) }
export function getTrainingSessionsForTeam(world: GameWorld, teamId: TeamId): readonly TrainingSession[] { return Object.values(world.trainingSessionsById).filter((session) => session.teamId === teamId).sort((a, b) => b.gameDate.localeCompare(a.gameDate) || b.id.localeCompare(a.id)) }
export function getLatestTrainingSession(world: GameWorld, teamId: TeamId): TrainingSession | undefined { return getTrainingSessionsForTeam(world, teamId)[0] }
export function getDevelopmentStimulusForPlayer(world: GameWorld, playerId: PlayerId) { return world.developmentStimulusByPlayerId[playerId] }
export function getCareerFatigueForPlayer(world: GameWorld, playerId: PlayerId): number { return world.careerFatigueByPlayerId[playerId] ?? 0 }
export function getMemoriesForEntity(world: GameWorld, entityId: string, query: Omit<MemoryQuery, 'ownerId'> = {}) { return queryMemories(Object.values(world.memoriesById), { ...query, ownerId: entityId }) }
export function getMemoriesBetweenEntities(world: GameWorld, firstId: string, secondId: string) { return getMemoriesBetween(Object.values(world.memoriesById), firstId, secondId) }
export function getImportantMemories(world: GameWorld, query: MemoryQuery = {}) { return queryMemories(Object.values(world.memoriesById), { minimumImportance: 'important', ...query }) }
export function getRecentMemoriesForEntity(world: GameWorld, entityId: string, limit = 10) { return getRecentMemories(getMemoriesForEntity(world, entityId), limit) }
export function getCurrentlyRelevantMemoriesForEntity(world: GameWorld, entityId: string, limit = 10) { return getCurrentlyRelevantMemories(getMemoriesForEntity(world, entityId), world.currentDate, limit) }
export function getMemoryReinforcementForEntities(world: GameWorld, ownerId: string, relatedEntityId: string) { return getMemoryReinforcement(Object.values(world.memoriesById), ownerId, relatedEntityId) }
export function getCoachActiveNarratives(world: GameWorld, coachId: string): readonly NarrativeThread[] { return Object.values(world.narrativesById).filter((thread) => thread.protagonistIds.includes(coachId) && !['resolved', 'historic'].includes(thread.status)).sort((a, b) => getNarrativeRelevance(b, world.userCoachId, world.currentDate) - getNarrativeRelevance(a, world.userCoachId, world.currentDate)) }
export function getNarrativesBetweenEntities(world: GameWorld, firstId: string, secondId: string): readonly NarrativeThread[] { return Object.values(world.narrativesById).filter((thread) => thread.protagonistIds.includes(firstId) && thread.relatedEntityIds.includes(secondId) || thread.protagonistIds.includes(secondId) && thread.relatedEntityIds.includes(firstId)) }
export function getMatchNarrativeContext(world: GameWorld, homeTeamId: string, awayTeamId: string): readonly NarrativeThread[] { const coaches = [world.teams[homeTeamId as TeamId]?.coachId, world.teams[awayTeamId as TeamId]?.coachId].filter((id): id is CoachId => id !== undefined); return Object.values(world.narrativesById).filter((thread) => coaches.some((coachId) => thread.protagonistIds.includes(coachId)) && [homeTeamId, awayTeamId].some((teamId) => thread.relatedEntityIds.includes(teamId))).sort((a, b) => getNarrativeRelevance(b, world.userCoachId, world.currentDate) - getNarrativeRelevance(a, world.userCoachId, world.currentDate)) }
export function getTopNarratives(world: GameWorld, limit = 10): readonly NarrativeThread[] { return Object.values(world.narrativesById).sort((a, b) => getNarrativeRelevance(b, world.userCoachId, world.currentDate) - getNarrativeRelevance(a, world.userCoachId, world.currentDate)).slice(0, limit) }

export function getTeamRoster(world: GameWorld, teamId: TeamId): readonly Player[] {
  return getTeam(world, teamId).rosterPlayerIds.map((playerId) => getPlayer(world, playerId))
}

export function getTeamCoach(world: GameWorld, teamId: TeamId): Coach | undefined {
  const coachId = getTeam(world, teamId).coachId
  return coachId === undefined ? undefined : getCoach(world, coachId)
}

function getEntity<Id extends string, Entity>(
  collection: Readonly<Record<Id, Entity>>,
  id: Id,
  entityName: string,
): Entity {
  const entity = collection[id]
  if (entity === undefined) {
    throw new GameWorldValidationError(`${entityName} does not exist: ${id}`)
  }

  return entity
}
