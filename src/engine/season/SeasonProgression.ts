import { compareGameDates } from '@/domain/date'
import type { SeasonHistoryRecord } from '@/domain/season'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { calculateStandings } from '@/engine/competition/standings'
import { applySeasonChampionCoachReputation } from '@/engine/coach'

export function isSeasonComplete(world: GameWorld, seasonId: keyof GameWorld['seasons']): boolean {
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId)
  return games.length > 0 && games.every((game) => game.status === 'completed')
}

export function finalizeSeason(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  if (!isSeasonComplete(world, seasonId)) throw new Error(`Season ${seasonId} is not complete`)
  if (world.seasonHistoryBySeasonId[seasonId] !== undefined) throw new Error(`Season ${seasonId} is already finalized`)
  const season = world.seasons[seasonId]!
  const standings = calculateStandings(world, seasonId)
  const champion = standings[0]
  if (champion === undefined) throw new Error(`Season ${seasonId} has no standings`)
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId)
  const completedOn = games.reduce((latest, game) => compareGameDates(game.date, latest) > 0 ? game.date : latest, games[0]!.date)
  const history: SeasonHistoryRecord = { seasonId, competitionId: season.competitionId, completedOn, championTeamId: champion.teamId, finalStandings: standings.map((line) => ({ ...line })) }
  return applySeasonChampionCoachReputation(rebuildWorld(world, [...Object.values(world.seasonHistoryBySeasonId), history]), seasonId)
}

/** Finalizes only after the result that made its season complete has been applied. */
export function finalizeCompletedSeason(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  return isSeasonComplete(world, seasonId) && world.seasonHistoryBySeasonId[seasonId] === undefined ? finalizeSeason(world, seasonId) : world
}

export function getSeasonHistory(world: GameWorld): readonly SeasonHistoryRecord[] {
  return Object.values(world.seasonHistoryBySeasonId).sort((a, b) => compareGameDates(b.completedOn, a.completedOn) || (a.seasonId < b.seasonId ? -1 : 1))
}

export function getSeasonHistoryRecord(world: GameWorld, seasonId: keyof GameWorld['seasons']): SeasonHistoryRecord | undefined { return world.seasonHistoryBySeasonId[seasonId] }

function rebuildWorld(world: GameWorld, seasonHistory: readonly SeasonHistoryRecord[]): GameWorld {
  return createGameWorld({ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory, injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions: Object.values(world.playerTransactionsById), playerKnowledge: Object.values(world.playerKnowledgeById), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), coachProfessionalProfilesByCoachId: world.coachProfessionalProfilesByCoachId, coachRpgProfilesByCoachId: world.coachRpgProfilesByCoachId, coachReputationProfilesByCoachId: world.coachReputationProfilesByCoachId })
}
