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

import { GameWorldValidationError, type GameWorld } from './GameWorld'

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
export function getUserCoachProfessionalProfile(world: GameWorld): StaffProfessionalProfile | undefined { return getCoachProfessionalProfile(world, world.userCoachId) }
export function getUserCoachRpgProfile(world: GameWorld): CoachRpgProfile | undefined { return getCoachRpgProfile(world, world.userCoachId) }
export function getUserCoachReputationProfile(world: GameWorld): CoachReputationProfile | undefined { return getCoachReputationProfile(world, world.userCoachId) }
export function getCoachProfessionalProficiency(world: GameWorld, coachId: CoachId): number | undefined { const profile=getCoachProfessionalProfile(world, coachId); return profile===undefined?undefined:calculateHeadCoachProfessionalProficiency(profile) }

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
