import type { Coach } from '@/domain/coach'
import type { Competition } from '@/domain/competition'
import type { Country } from '@/domain/country'
import type { Game } from '@/domain/game'
import type {
  CoachId,
  CompetitionId,
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

import { GameWorldValidationError, type GameWorld } from './GameWorld'
import { getRelationshipBand, relationshipKey, type RelationshipPersonId } from '@/domain/relationships'
import { getMoraleBand, getRecentMoraleEvents } from '@/domain/morale'
import type { InboxItem, NewsItem } from '@/domain/inbox'
import { createDefaultTrainingPlan, type TeamTrainingPlan, type TrainingSession } from '@/domain/training'

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
