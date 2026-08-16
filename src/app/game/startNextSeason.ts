import { addDays, addYears, formatGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { applyOffseasonDevelopment } from '@/engine/development'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { maintainAiTeamMinimumRosters } from '@/app/market'
import { getCurrentSeason } from './selectors'
import { buildNextCompetitionParticipants } from '@/engine/competition'

/** Starts the next edition of the current competition without synchronizing others. */
export function startNextSeason(world: GameWorld): GameWorld {
  const primary = getCurrentSeason(world)
  if (!isSeasonComplete(world, primary.id)) throw new Error('Current season is not complete')
  if (getSeasonHistoryRecord(world, primary.id) === undefined) throw new Error('Current season requires a history record')
  const nextPrimary = createSeason({ id: nextSeasonIds(world, 1)[0]!, competitionId: primary.competitionId, label: `${formatGameDate(addYears(primary.startDate, 1))} to ${formatGameDate(addYears(primary.endDate, 1))}`, startDate: addYears(primary.startDate, 1), endDate: addYears(primary.endDate, 1), participantTeamIds: buildNextCompetitionParticipants(world, primary.id) })
  const developed = applyOffseasonDevelopment(world, { fromSeasonId: primary.id, toSeasonId: nextPrimary.id, targetDate: nextPrimary.startDate }).world
  const staged = rebuild(developed, [...Object.values(developed.seasons), nextPrimary], nextPrimary.id, Object.values(developed.games))
  const schedule = generateRoundRobinSchedule({ world: staged, seasonId: nextPrimary.id })
  return maintainAiTeamMinimumRosters(reconcileExpiredPlayerContracts(rebuild(developed, [...Object.values(developed.seasons), nextPrimary], nextPrimary.id, [...Object.values(developed.games), ...schedule]), nextPrimary.startDate)).world
}

function nextSeasonIds(world: GameWorld, count: number) { let ordinal = Object.keys(world.seasons).length + 1; const ids = []; while (ids.length < count) { const id = seasonIdFromString(`generated-season-${ordinal.toString().padStart(4, '0')}`); if (world.seasons[id] === undefined) ids.push(id); ordinal += 1 } return ids }
function rebuild(world: GameWorld, seasons: readonly (typeof world.seasons)[keyof typeof world.seasons][], currentSeasonId: GameWorld['currentSeasonId'], games: readonly (typeof world.games)[keyof typeof world.games][]): GameWorld { return createGameWorld({ currentDate: currentSeasonId === world.currentSeasonId ? world.currentDate : seasons.find((season) => season.id === currentSeasonId)!.startDate, currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), ecosystems: Object.values(world.ecosystems), seasons, games, matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory: Object.values(world.seasonHistoryBySeasonId), injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions: Object.values(world.playerTransactionsById), playerKnowledge: Object.values(world.playerKnowledgeById), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), coachProfessionalProfilesByCoachId: world.coachProfessionalProfilesByCoachId, coachRpgProfilesByCoachId: world.coachRpgProfilesByCoachId, coachReputationProfilesByCoachId: world.coachReputationProfilesByCoachId, coachEmploymentByCoachId: world.coachEmploymentByCoachId, coachCareerHistoryByCoachId: world.coachCareerHistoryByCoachId, coachJobOpeningsById: world.coachJobOpeningsById, coachJobCandidaciesById: world.coachJobCandidaciesById, coachInterviewsByCandidacyId: world.coachInterviewsByCandidacyId, coachJobOffersById: world.coachJobOffersById, relationshipsByKey: world.relationshipsByKey, personalitiesByPersonId: world.personalitiesByPersonId, moraleByPersonId: world.moraleByPersonId, inboxItemsById: world.inboxItemsById, newsItemsById: world.newsItemsById, trainingPlansByTeamId: world.trainingPlansByTeamId, trainingSessionsById: world.trainingSessionsById, developmentStimulusByPlayerId: world.developmentStimulusByPlayerId, careerFatigueByPlayerId: world.careerFatigueByPlayerId, promotionRelegationResolutions: Object.values(world.promotionRelegationResolutionsById) }) }
