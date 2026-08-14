import { addDays } from '@/domain/date'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market'

/** Advances only the simulation date, leaving game resolution to other services. */
export function advanceDay(world: GameWorld): GameWorld {
  const advanced = createGameWorld({
    currentDate: addDays(world.currentDate, 1),
    currentSeasonId: world.currentSeasonId,
    userCoachId: world.userCoachId,
    countries: Object.values(world.countries),
    coaches: Object.values(world.coaches),
    players: Object.values(world.players),
    teams: Object.values(world.teams),
    competitions: Object.values(world.competitions),
    seasons: Object.values(world.seasons),
    games: Object.values(world.games),
    matchStatLogs: Object.values(world.matchStatLogsByGameId),
    seasonHistory: Object.values(world.seasonHistoryBySeasonId),
    injuries: Object.values(world.injuriesById),
    contracts: Object.values(world.contractsById),
    teamFinances: Object.values(world.teamFinancesByTeamId),
    playerTransactions: Object.values(world.playerTransactionsById),
    playerKnowledge: Object.values(world.playerKnowledgeById),
    staffPeople: Object.values(world.staffPeopleById),
    teamStaffAssignments: Object.values(world.teamStaffAssignmentsById),
    coachProfessionalProfilesByCoachId: world.coachProfessionalProfilesByCoachId,
    coachRpgProfilesByCoachId: world.coachRpgProfilesByCoachId,
  })
  return reconcileExpiredPlayerContracts(advanced, advanced.currentDate)
}
