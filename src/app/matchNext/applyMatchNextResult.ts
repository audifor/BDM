import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { MatchStatLog } from '@/domain/stats/MatchStatLog'
import { applyPostMatchInjuries } from '@/engine/injury'
import { finalizeCompletedSeason } from '@/engine/season'
import { recordEligibilityParticipation } from '@/engine/eligibility'
import { applyMatchResult } from '@/engine/match'
import { createMatchStatLogFromMatchNext, type MatchNextResult } from './MatchNextResult'

/** Applies the Next result through canonical Game/season/stat-log boundaries without changing save shape. */
export function completeMatchNext(world: GameWorld, result: MatchNextResult): GameWorld {
  if (world.matchStatLogsByGameId[result.gameId] !== undefined) throw new Error(`MatchStatLog already exists for Game ${result.gameId}`)
  const log = createMatchStatLogFromMatchNext(world, result) as MatchStatLog
  const withResult = applyMatchResult(world, {
    gameId: result.gameId,
    homeTeamId: result.homeTeamId,
    awayTeamId: result.awayTeamId,
    homeScore: result.score.home,
    awayScore: result.score.away,
  })
  const withStats = updateGameWorld(withResult, { matchStatLogs: [...Object.values(withResult.matchStatLogsByGameId), log] })
  const eligible = recordEligibilityParticipation(withStats, result.gameId)
  const completed = finalizeCompletedSeason(eligible, world.games[result.gameId]!.seasonId)
  return applyPostMatchInjuries(completed, result.gameId)
}
