import { compareGameDates } from '@/domain/date'
import type { CompetitionId } from '@/domain/ids'
import type { SeasonHistoryRecord } from '@/domain/season'
import { addNewsItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateStandings } from '@/engine/competition/standings'
import { applySeasonChampionCoachReputation } from '@/engine/coach'
import { resolvePromotionRelegation } from '@/engine/competition'

export function isSeasonComplete(world: GameWorld, seasonId: keyof GameWorld['seasons']): boolean {
  const season = world.seasons[seasonId]
  if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  return isCompetitionComplete(world, season.competitionId)
}

export function isCompetitionComplete(world: GameWorld, competitionId: CompetitionId): boolean {
  const competition = world.competitions[competitionId]
  if (competition === undefined) throw new Error(`Competition does not exist: ${competitionId}`)
  if (competition.rules.completion !== 'allScheduledGamesCompleted') return false
  const games = Object.values(world.games).filter((game) => game.competitionId === competitionId)
  return games.length > 0 && games.every((game) => game.status === 'completed')
}

export function finalizeSeason(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const season = world.seasons[seasonId]
  if (season === undefined || !isCompetitionComplete(world, season.competitionId)) throw new Error(`Season ${seasonId} is not complete`)
  if (world.seasonHistoryBySeasonId[seasonId] !== undefined) throw new Error(`Season ${seasonId} is already finalized`)
  const standings = calculateStandings(world, seasonId)
  const champion = world.competitions[season.competitionId]!.rules.champion === 'standingsLeader' ? standings[0] : undefined
  if (champion === undefined) throw new Error(`Season ${seasonId} has no standings`)
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId)
  const completedOn = games.reduce((latest, game) => compareGameDates(game.date, latest) > 0 ? game.date : latest, games[0]!.date)
  const history: SeasonHistoryRecord = { seasonId, competitionId: season.competitionId, completedOn, championTeamId: champion.teamId, finalStandings: standings.map((line) => ({ ...line })) }
  const finalized=applySeasonChampionCoachReputation(rebuildWorld(world, [...Object.values(world.seasonHistoryBySeasonId), history]), seasonId)
  const team=finalized.teams[champion.teamId]!, competition=finalized.competitions[season.competitionId]!
  const withNews = addNewsItem(finalized,{id:`news:champion:${seasonId}:${team.id}`,gameDate:completedOn,category:'competition',headline:`${team.name} win ${competition.name}`,body:`${team.name} are champions of ${season.label}.`,context:{seasonId,competitionId:competition.id,teamId:team.id}})
  const rule = Object.values(withNews.ecosystems).flatMap((ecosystem) => ecosystem.tierMovementRules).find((item) => item.upperCompetitionId === season.competitionId || item.lowerCompetitionId === season.competitionId)
  if (rule === undefined) return withNews
  const otherCompetitionId = rule.upperCompetitionId === season.competitionId ? rule.lowerCompetitionId : rule.upperCompetitionId
  const other = Object.values(withNews.seasons).filter((candidate) => candidate.competitionId === otherCompetitionId && withNews.seasonHistoryBySeasonId[candidate.id] !== undefined).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0]
  return other === undefined ? withNews : resolvePromotionRelegation(withNews, rule.upperCompetitionId === season.competitionId ? season.id : other.id, rule.lowerCompetitionId === season.competitionId ? season.id : other.id)
}

/** Finalizes only after the result that made its season complete has been applied. */
export function finalizeCompletedSeason(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const season = world.seasons[seasonId]
  return season !== undefined && isCompetitionComplete(world, season.competitionId) && world.seasonHistoryBySeasonId[seasonId] === undefined ? finalizeSeason(world, seasonId) : world
}

export function getSeasonHistory(world: GameWorld): readonly SeasonHistoryRecord[] {
  return Object.values(world.seasonHistoryBySeasonId).sort((a, b) => compareGameDates(b.completedOn, a.completedOn) || (a.seasonId < b.seasonId ? -1 : 1))
}

export function getSeasonHistoryRecord(world: GameWorld, seasonId: keyof GameWorld['seasons']): SeasonHistoryRecord | undefined { return world.seasonHistoryBySeasonId[seasonId] }
export function getCompetitionChampion(world: GameWorld, competitionId: CompetitionId): SeasonHistoryRecord['championTeamId'] | undefined { const season = Object.values(world.seasons).filter((candidate) => candidate.competitionId === competitionId).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0]; return season === undefined ? undefined : world.seasonHistoryBySeasonId[season.id]?.championTeamId }

function rebuildWorld(world: GameWorld, seasonHistory: readonly SeasonHistoryRecord[]): GameWorld { return updateGameWorld(world, { seasonHistory }) }
