import type { DevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import type { CanonicalRatingKey } from '@/domain/player'
import type { MatchStatLog } from '@/domain/stats/MatchStatLog'
import type { GameWorld } from '@/domain/world'
import { matchSessionFatigueDeltaToCareer } from '@/engine/match-next'
import type { BackgroundMatchResult } from '@/engine/world-sim/background/BackgroundMatchModel'
import { completeResolvedMatch } from '@/app/matchNext/applyMatchNextResult'
import { MATCH_ACTION_STIMULUS, STIMULUS_STAMINA_PER_FULL_GAME, type MatchNextPlayerDynamicConsequence } from '@/app/matchNext/MatchNextDynamicConsequences'

/**
 * WSR1: a BACKGROUND result reaches the world through the same canonical chain as Match Next (completeResolvedMatch): the same stat log
 * contract, the same fatigue and development boundary, the same eligibility, season and post-match injury authorities. What BACKGROUND
 * cannot know in detail (individual actions) enters as expected counts from its calibrated model, never as invented events.
 */
export function completeBackgroundMatch(world: GameWorld, result: BackgroundMatchResult, pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  return completeResolvedMatch(world, {
    gameId: result.gameId, homeTeamId: result.homeTeamId, awayTeamId: result.awayTeamId, score: result.score, resolution: 'BACKGROUND',
    statLog: (current) => createMatchStatLogFromBackground(current, result),
    consequences: (current) => deriveBackgroundDynamicConsequences(current, result),
  }, pendingEvidence)
}

export function createMatchStatLogFromBackground(world: GameWorld, result: BackgroundMatchResult): MatchStatLog {
  const game = world.games[result.gameId]
  if (!game) throw new Error(`Cannot create BACKGROUND stats for missing Game ${result.gameId}`)
  if (game.homeTeamId !== result.homeTeamId || game.awayTeamId !== result.awayTeamId) throw new Error('BACKGROUND result does not match Game teams')
  const home = new Set(result.squads.home)
  const starters = new Set([...result.starters.home, ...result.starters.away])
  const points = (side: ReadonlySet<string>, inside: boolean) => result.playerStats.filter((line) => side.has(line.playerId) === inside).reduce((sum, line) => sum + line.points, 0)
  if (points(home, true) !== result.score.home || points(home, false) !== result.score.away) throw new Error('BACKGROUND player points do not match final score')
  return {
    gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
    finalScore: { ...result.score },
    playerLines: result.playerStats.map((stats) => {
      const isHome = home.has(stats.playerId)
      return { playerId: stats.playerId, teamId: isHome ? game.homeTeamId : game.awayTeamId, opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId, isHome, started: starters.has(stats.playerId), stats: { ...stats } }
    }),
    resolution: 'BACKGROUND',
    backgroundModelVersion: result.modelVersion,
  }
}

/** Fatigue and development from a BACKGROUND result: same units, conversions and stimulus table as Match Next's. */
export function deriveBackgroundDynamicConsequences(world: GameWorld, result: BackgroundMatchResult): readonly MatchNextPlayerDynamicConsequence[] {
  const loads = new Map(result.playerLoad.map((load) => [load.playerId, load]))
  return result.playerStats.map((stats) => {
    const load = loads.get(stats.playerId)
    const minutesPlayed = stats.secondsPlayed / 60
    const before = load?.matchFatigueBefore ?? 0
    const after = load?.matchFatigueAfter ?? before
    return {
      playerId: stats.playerId,
      minutesPlayed: round2(minutesPlayed),
      workload: { minutes: round2(minutesPlayed), eventLoad: round2(load?.eventLoad ?? 0) },
      preMatchCareerFatigue: load?.preMatchCareerFatigue ?? world.careerFatigueByPlayerId[stats.playerId] ?? 0,
      matchFatigueBefore: round2(before),
      matchFatigueAfter: round2(after),
      careerFatigueDelta: stats.secondsPlayed === 0 || load === undefined ? 0 : round2(matchSessionFatigueDeltaToCareer(after - before)),
      developmentStimulusDelta: minutesPlayed <= 0 || load === undefined ? {} : stimulus(minutesPlayed, load.actions),
    }
  })
}

function stimulus(minutes: number, actions: BackgroundMatchResult['playerLoad'][number]['actions']): Partial<Record<CanonicalRatingKey, number>> {
  const s = MATCH_ACTION_STIMULUS
  const total: Partial<Record<CanonicalRatingKey, number>> = { stamina: round2(Math.min(1, minutes / 40) * STIMULUS_STAMINA_PER_FULL_GAME) }
  const add = (amounts: Readonly<Partial<Record<CanonicalRatingKey, number>>>, count: number) => {
    if (count <= 0) return
    for (const [key, amount] of Object.entries(amounts) as [CanonicalRatingKey, number][]) total[key] = (total[key] ?? 0) + amount * count
  }
  add(s.drive, actions.drive)
  add(s.screen, actions.screen)
  add(s.passAction, actions.passAction)
  add(s.threePointShot, actions.shot3)
  add(s.twoPointShot, actions.shot2)
  add(s.passReleased, actions.passReleased)
  add(s.offensiveRebound, actions.offensiveRebounds)
  add(s.defensiveRebound, actions.defensiveRebounds)
  add(s.interception, actions.interceptions)
  add(s.defensiveResponsibility, actions.defResp)
  for (const key of Object.keys(total) as CanonicalRatingKey[]) {
    total[key] = round2(total[key] ?? 0)
    if (total[key] === 0 && key !== 'stamina') delete total[key]
  }
  return total
}

function round2(value: number): number { return Math.round(value * 100) / 100 }
