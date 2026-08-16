import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'
import type { PromotionRelegationResolution } from '@/domain/competition'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { calculateStandings } from './standings'

export function getCompetitionTier(world: GameWorld, competitionId: CompetitionId) { return Object.values(world.ecosystems).flatMap((ecosystem) => ecosystem.domesticTiers.map((tier) => ({ ecosystem, tier }))).find((item) => item.tier.competitionId === competitionId)?.tier }
export function getUpperDomesticCompetition(world: GameWorld, competitionId: CompetitionId): CompetitionId | undefined { const tier = getCompetitionTier(world, competitionId); if (!tier) return undefined; return Object.values(world.ecosystems).find((e) => e.domesticTiers.some((t) => t.competitionId === competitionId))?.domesticTiers.find((t) => t.level === tier.level - 1)?.competitionId }
export function getLowerDomesticCompetition(world: GameWorld, competitionId: CompetitionId): CompetitionId | undefined { const tier = getCompetitionTier(world, competitionId); if (!tier) return undefined; return Object.values(world.ecosystems).find((e) => e.domesticTiers.some((t) => t.competitionId === competitionId))?.domesticTiers.find((t) => t.level === tier.level + 1)?.competitionId }
export function getPromotionRelegationResolution(world: GameWorld, upperSeasonId: SeasonId, lowerSeasonId: SeasonId) { return world.promotionRelegationResolutionsById[`promotion-relegation:${upperSeasonId}:${lowerSeasonId}`] }
export function resolvePromotionRelegation(world: GameWorld, upperSeasonId: SeasonId, lowerSeasonId: SeasonId): GameWorld {
  const upper = world.seasons[upperSeasonId]; const lower = world.seasons[lowerSeasonId]
  if (!upper || !lower) throw new Error('Promotion/relegation seasons do not exist')
  const id = `promotion-relegation:${upperSeasonId}:${lowerSeasonId}`; if (world.promotionRelegationResolutionsById[id]) return world
  const ecosystem = Object.values(world.ecosystems).find((item) => item.tierMovementRules.some((rule) => rule.upperCompetitionId === upper.competitionId && rule.lowerCompetitionId === lower.competitionId))
  const rule = ecosystem?.tierMovementRules.find((item) => item.upperCompetitionId === upper.competitionId && item.lowerCompetitionId === lower.competitionId)
  if (!rule) throw new Error('Competition tiers are not linked')
  if (!isComplete(world, upperSeasonId) || !isComplete(world, lowerSeasonId) || !world.seasonHistoryBySeasonId[upperSeasonId] || !world.seasonHistoryBySeasonId[lowerSeasonId]) return world
  const promotedTeamIds = calculateStandings(world, lowerSeasonId).slice(0, rule.exchangeCount).map((line) => line.teamId)
  const relegatedTeamIds = calculateStandings(world, upperSeasonId).slice(-rule.exchangeCount).map((line) => line.teamId)
  const resolution: PromotionRelegationResolution = { id, upperCompetitionId: upper.competitionId, lowerCompetitionId: lower.competitionId, upperSeasonId, lowerSeasonId, promotedTeamIds, relegatedTeamIds, resolvedDate: upper.endDate > lower.endDate ? upper.endDate : lower.endDate }
  return rebuild(world, [...Object.values(world.promotionRelegationResolutionsById), resolution])
}
export function buildNextCompetitionParticipants(world: GameWorld, seasonId: SeasonId): readonly TeamId[] {
  const season = world.seasons[seasonId]!; const current = season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds; let result = [...current]
  for (const resolution of Object.values(world.promotionRelegationResolutionsById)) {
    if (resolution.upperSeasonId === seasonId) result = result.filter((id) => !resolution.relegatedTeamIds.includes(id)).concat(resolution.promotedTeamIds)
    if (resolution.lowerSeasonId === seasonId) result = result.filter((id) => !resolution.promotedTeamIds.includes(id)).concat(resolution.relegatedTeamIds)
  }
  if (new Set(result).size !== result.length || result.length !== current.length) throw new Error('Promotion/relegation produced invalid next participants')
  return result
}
function rebuild(world: GameWorld, resolutions: readonly PromotionRelegationResolution[]): GameWorld { return createGameWorld({ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), ecosystems: Object.values(world.ecosystems), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory: Object.values(world.seasonHistoryBySeasonId), injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions: Object.values(world.playerTransactionsById), playerKnowledge: Object.values(world.playerKnowledgeById), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), coachProfessionalProfilesByCoachId: world.coachProfessionalProfilesByCoachId, coachRpgProfilesByCoachId: world.coachRpgProfilesByCoachId, coachReputationProfilesByCoachId: world.coachReputationProfilesByCoachId, coachEmploymentByCoachId: world.coachEmploymentByCoachId, coachCareerHistoryByCoachId: world.coachCareerHistoryByCoachId, coachJobOpeningsById: world.coachJobOpeningsById, coachJobCandidaciesById: world.coachJobCandidaciesById, coachInterviewsByCandidacyId: world.coachInterviewsByCandidacyId, coachJobOffersById: world.coachJobOffersById, relationshipsByKey: world.relationshipsByKey, personalitiesByPersonId: world.personalitiesByPersonId, moraleByPersonId: world.moraleByPersonId, inboxItemsById: world.inboxItemsById, newsItemsById: world.newsItemsById, trainingPlansByTeamId: world.trainingPlansByTeamId, trainingSessionsById: world.trainingSessionsById, developmentStimulusByPlayerId: world.developmentStimulusByPlayerId, careerFatigueByPlayerId: world.careerFatigueByPlayerId, promotionRelegationResolutions: resolutions }) }
function isComplete(world: GameWorld, seasonId: SeasonId): boolean { const games = Object.values(world.games).filter((game) => game.seasonId === seasonId); return games.length > 0 && games.every((game) => game.status === 'completed') }
