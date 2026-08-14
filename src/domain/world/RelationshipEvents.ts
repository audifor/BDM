import { applyRelationshipEvent, createRelationshipProfile, relationshipKey, type RelationshipEvent, type RelationshipPersonId } from '@/domain/relationships'

import { createGameWorld, type GameWorld } from './GameWorld'

/** Applies a deterministic event to one directed relationship without mutating the world. */
export function applyRelationshipEventToWorld(world: GameWorld, sourceId: RelationshipPersonId, targetId: RelationshipPersonId, event: RelationshipEvent): GameWorld {
  const key = relationshipKey(sourceId, targetId)
  const profile = world.relationshipsByKey[key] ?? createRelationshipProfile(sourceId, targetId)
  const updated = applyRelationshipEvent(profile, event)
  if (updated === profile) return world
  return createGameWorld({
    currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId,
    countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory: Object.values(world.seasonHistoryBySeasonId), injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions: Object.values(world.playerTransactionsById), playerKnowledge: Object.values(world.playerKnowledgeById), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), coachProfessionalProfilesByCoachId: world.coachProfessionalProfilesByCoachId, coachRpgProfilesByCoachId: world.coachRpgProfilesByCoachId, coachReputationProfilesByCoachId: world.coachReputationProfilesByCoachId, coachEmploymentByCoachId: world.coachEmploymentByCoachId, coachCareerHistoryByCoachId: world.coachCareerHistoryByCoachId, coachJobOpeningsById: world.coachJobOpeningsById, coachJobCandidaciesById: world.coachJobCandidaciesById, coachInterviewsByCandidacyId: world.coachInterviewsByCandidacyId, coachJobOffersById: world.coachJobOffersById,
    relationshipsByKey: { ...world.relationshipsByKey, [key]: updated },
  })
}
