import { getUserTeam } from '@/engine/calendar'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { BASKETBALL_RATING_KEYS } from '@/domain/player'
import { playerKnowledgeIdFromString } from '@/domain/ids'
import { createGameWorld, type GameWorld } from '@/domain/world'
import type { PlayerKnowledgeRecord } from '@/domain/knowledge'

export function ensurePlayerKnowledge(world: GameWorld): GameWorld {
  const observer = getUserTeam(world); if (!observer) return world
  const existing = Object.values(world.playerKnowledgeById)
  const known = new Set(existing.filter((record) => record.observerTeamId === observer.id).map((record) => record.subjectPlayerId))
  const added = Object.values(world.players).filter((player) => !known.has(player.id)).map((player): PlayerKnowledgeRecord => {
    const own = observer.rosterPlayerIds.includes(player.id)
    return { id: playerKnowledgeIdFromString(`player-knowledge:${observer.id}:${player.id}`), observerTeamId: observer.id, subjectPlayerId: player.id, assessedOn: world.currentDate, basketball: { ratings: Object.fromEntries(BASKETBALL_RATING_KEYS.map((key) => { const estimate = new SeededRandomSource(hashStringToSeed(`player-knowledge-estimate-v1:${observer.id}:${player.id}:${key}`)).nextInt(own ? -1 : -6, own ? 1 : 6); const uncertainty = new SeededRandomSource(hashStringToSeed(`player-knowledge-uncertainty-v1:${observer.id}:${player.id}:${key}`)).nextInt(own ? 1 : 4, own ? 2 : 8); return [key, { estimatedValue: Math.max(0, Math.min(100, player.basketball.ratings[key] + estimate)), uncertainty }] })) as PlayerKnowledgeRecord['basketball']['ratings'] } }
  })
  if (!added.length) return world
  return createGameWorld({ currentDate:world.currentDate,currentSeasonId:world.currentSeasonId,userCoachId:world.userCoachId,countries:Object.values(world.countries),coaches:Object.values(world.coaches),players:Object.values(world.players),teams:Object.values(world.teams),competitions:Object.values(world.competitions),seasons:Object.values(world.seasons),games:Object.values(world.games),matchStatLogs:Object.values(world.matchStatLogsByGameId),seasonHistory:Object.values(world.seasonHistoryBySeasonId),injuries:Object.values(world.injuriesById),contracts:Object.values(world.contractsById),teamFinances:Object.values(world.teamFinancesByTeamId),playerTransactions:Object.values(world.playerTransactionsById),playerKnowledge:[...existing,...added],staffPeople:Object.values(world.staffPeopleById),teamStaffAssignments:Object.values(world.teamStaffAssignmentsById) })
}
