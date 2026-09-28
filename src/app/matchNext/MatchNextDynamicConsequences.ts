import { addDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import type { PlayerId } from '@/domain/ids'
import type { CanonicalRatingKey } from '@/domain/player'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { matchEventFatigueIncrement, matchSessionFatigueDeltaToCareer } from '@/engine/match-next'
import type { MatchNextResult } from './MatchNextResult'

export interface MatchNextPlayerDynamicConsequence {
  readonly playerId: PlayerId
  readonly minutesPlayed: number
  /** Elapsed court minutes plus the sum of weighted, player-attributed Match Next events. */
  readonly workload: { readonly minutes: number; readonly eventLoad: number }
  readonly preMatchCareerFatigue: number
  readonly matchFatigueBefore: number
  readonly matchFatigueAfter: number
  readonly careerFatigueDelta: number
  readonly developmentStimulusDelta: Readonly<Partial<Record<CanonicalRatingKey, number>>>
}

/** Projects deterministic post-match load and learning from one canonical Match Next result. */
export function deriveMatchNextDynamicConsequences(world: GameWorld, result: MatchNextResult): readonly MatchNextPlayerDynamicConsequence[] {
  const matchPlayerById = new Map(result.finalState.players.map((player) => [player.playerId, player]))
  const workloadByPlayerId = new Map<PlayerId, number>()
  for (const event of result.events) {
    const playerId = event.playerId ?? event.shooterPlayerId ?? event.passerPlayerId ?? event.receiverPlayerId
    if (playerId === undefined) continue
    const eventLoad = matchEventFatigueIncrement(event)
    if (eventLoad > 0) workloadByPlayerId.set(playerId, (workloadByPlayerId.get(playerId) ?? 0) + eventLoad)
  }

  return result.playerStats.map((stats) => {
    const matchPlayer = matchPlayerById.get(stats.playerId)
    const preMatchCareerFatigue = matchPlayer?.preMatchCareerFatigue ?? world.careerFatigueByPlayerId[stats.playerId] ?? 0
    const matchFatigueBefore = matchPlayer?.initialFatigue ?? 0
    const matchFatigueAfter = matchPlayer?.fatigue ?? matchFatigueBefore
    const careerFatigueDelta = stats.secondsPlayed === 0 || matchPlayer === undefined
      ? 0
      : round2(matchSessionFatigueDeltaToCareer(matchFatigueAfter - matchFatigueBefore))
    const minutesPlayed = stats.secondsPlayed / 60
    const stimulusDelta = deriveMatchStimulus(stats.playerId, minutesPlayed, result)
    return {
      playerId: stats.playerId,
      minutesPlayed: round2(minutesPlayed),
      workload: { minutes: round2(minutesPlayed), eventLoad: round2(workloadByPlayerId.get(stats.playerId) ?? 0) },
      preMatchCareerFatigue,
      matchFatigueBefore: round2(matchFatigueBefore),
      matchFatigueAfter: round2(matchFatigueAfter),
      careerFatigueDelta,
      developmentStimulusDelta: stimulusDelta,
    }
  })
}

export function applyMatchNextDynamicConsequences(world: GameWorld, result: MatchNextResult): GameWorld {
  const fatigue = { ...world.careerFatigueByPlayerId }
  const stimulus = { ...world.developmentStimulusByPlayerId }
  let changed = false
  for (const consequence of deriveMatchNextDynamicConsequences(world, result)) {
    if (consequence.careerFatigueDelta <= 0 && Object.keys(consequence.developmentStimulusDelta).length === 0) continue
    if (consequence.careerFatigueDelta > 0) {
      fatigue[consequence.playerId] = clampCareerFatigue((fatigue[consequence.playerId] ?? 0) + consequence.careerFatigueDelta)
    }
    if (Object.keys(consequence.developmentStimulusDelta).length > 0) {
      const current = stimulus[consequence.playerId]
      if (current !== undefined) stimulus[consequence.playerId] = addDevelopmentStimulus(current, consequence.developmentStimulusDelta)
    }
    changed = true
  }
  return changed ? updateGameWorld(world, { careerFatigueByPlayerId: fatigue, developmentStimulusByPlayerId: stimulus }) : world
}

function deriveMatchStimulus(playerId: PlayerId, minutesPlayed: number, result: MatchNextResult): Partial<Record<CanonicalRatingKey, number>> {
  if (minutesPlayed <= 0) return {}
  const stimulus: Partial<Record<CanonicalRatingKey, number>> = { stamina: round2(Math.min(1, minutesPlayed / 40) * 0.2) }
  const add = (key: CanonicalRatingKey, amount: number) => { stimulus[key] = (stimulus[key] ?? 0) + amount }
  for (const event of result.events) {
    if (event.playerId !== playerId && event.shooterPlayerId !== playerId && event.passerPlayerId !== playerId) continue
    if (event.type === 'actionStarted') {
      if (event.actionKind === 'DRIVE') { add('firstStep', 0.04); add('rimFinishing', 0.04) }
      else if (event.actionKind === 'SCREEN') { add('strength', 0.03); add('offBallAwareness', 0.03) }
      else if (event.actionKind === 'PASS' || event.actionKind === 'KICK_OUT') { add('passing', 0.03); add('courtVision', 0.02) }
    } else if (event.type === 'shotReleased') {
      if (event.points === 3) add('threePointShooting', 0.06)
      else { add('midRangeShooting', 0.03); add('rimFinishing', 0.03) }
    } else if (event.type === 'passReleased') {
      add('passing', 0.02)
    } else if (event.type === 'reboundSecured') {
      add(event.reboundType === 'offensive' ? 'offensiveRebounding' : 'defensiveRebounding', 0.04)
      add('vertical', 0.02)
    } else if (event.type === 'passIntercepted') {
      add('steal', 0.03); add('anticipation', 0.02)
    } else if (event.type === 'defensiveResponsibilityChanged') {
      add('defensiveAwareness', 0.02)
    }
  }
  for (const key of Object.keys(stimulus) as CanonicalRatingKey[]) stimulus[key] = round2(stimulus[key] ?? 0)
  return stimulus
}

function round2(value: number): number { return Math.round(value * 100) / 100 }
