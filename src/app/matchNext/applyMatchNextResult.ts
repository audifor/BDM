import { createDevelopmentStimulusEvent, type DevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import { updateGameWorld, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import type { GameId, TeamId } from '@/domain/ids'
import type { MatchResolution, MatchStatLog } from '@/domain/stats/MatchStatLog'
import { applyPostMatchInjuries } from '@/engine/injury'
import { finalizeCompletedSeason } from '@/engine/season'
import { recordEligibilityParticipation } from '@/engine/eligibility'
import { applyMatchResult } from '@/engine/match'
import { createMatchStatLogFromMatchNext, type MatchNextResult } from './MatchNextResult'
import { applyDynamicConsequences, deriveMatchNextDynamicConsequences, type MatchNextPlayerDynamicConsequence } from './MatchNextDynamicConsequences'

/**
 * WSR1: the one canonical boundary through which a resolved Game reaches the world, whatever resolution produced it. Each resolution
 * supplies its canonical stat log and its per-player dynamic consequences; the chain (result, standings, stat log, fatigue and
 * development, eligibility, season completion, post-match injuries) is the same for all.
 */
export interface CompletedMatch {
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly score: { readonly home: number; readonly away: number }
  readonly resolution: MatchResolution
  readonly statLog: (world: GameWorld) => MatchStatLog
  readonly consequences: (world: GameWorld) => readonly MatchNextPlayerDynamicConsequence[]
}

export function completeResolvedMatch(world: GameWorld, match: CompletedMatch, pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  if (world.matchStatLogsByGameId[match.gameId] !== undefined) throw new Error(`MatchStatLog already exists for Game ${match.gameId}`)
  // ME-LOCK1.1: the chain below is one application; the whole world is validated once, on the world it returns.
  return withSingleWorldValidation(world, (current) => applyCompletedMatchChain(current, match, pendingEvidence))
}

/** Applies a Match Next result (FULL when watched live, FAST otherwise) through the canonical chain. */
export function completeMatchNext(world: GameWorld, result: MatchNextResult, resolution: Exclude<MatchResolution, 'BACKGROUND'> = 'FAST', pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  return completeResolvedMatch(world, {
    gameId: result.gameId, homeTeamId: result.homeTeamId, awayTeamId: result.awayTeamId, score: result.score, resolution,
    statLog: (current) => createMatchStatLogFromMatchNext(current, result, resolution),
    consequences: (current) => deriveMatchNextDynamicConsequences(current, result),
  }, pendingEvidence)
}

function applyCompletedMatchChain(world: GameWorld, match: CompletedMatch, pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  const log = match.statLog(world)
  const withResult = applyMatchResult(world, {
    gameId: match.gameId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: match.score.home,
    awayScore: match.score.away,
  })
  const withStats = updateGameWorld(withResult, { matchStatLogs: [...Object.values(withResult.matchStatLogsByGameId), log] })
  const consequences = match.consequences(withStats)
  let withDynamicConsequences = applyDynamicConsequences(withStats, consequences)
  // Keep immutable learning evidence alongside MAIN's canonical action-derived stimulus.
  const evidence = consequences.filter(item => item.minutesPlayed > 0 && Object.values(item.developmentStimulusDelta).some(amount => amount !== undefined && amount > 0))
    .map(item => createDevelopmentStimulusEvent({ id: `match:${match.gameId}:${item.playerId}`, playerId: item.playerId, sourceType: 'match', sourceId: match.gameId, date: log.gameDate, byRating: item.developmentStimulusDelta }))
  if (pendingEvidence !== undefined) pendingEvidence.push(...evidence)
  else if (evidence.length > 0) withDynamicConsequences = updateGameWorld(withDynamicConsequences, { developmentStimulusEventAdditions: evidence })
  const eligible = recordEligibilityParticipation(withDynamicConsequences, match.gameId)
  const completed = finalizeCompletedSeason(eligible, world.games[match.gameId]!.seasonId)
  return applyPostMatchInjuries(completed, match.gameId)
}
