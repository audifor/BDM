import { distanceBetween, isBeyondThreePointLine, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { MatchActionState, MatchDecision, MatchDecisionKind } from './ActionState'
import { activePossession, type MatchPlayerState, type MatchState } from '../state'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'

export interface ShotContest {
  readonly score: number
  readonly defenderPlayerId: PlayerId | null
  readonly distanceMeters: number | null
}

export function shotValueAt(position: CourtPosition, basket: CourtPosition, state: Pick<MatchState, 'court'>): 2 | 3 {
  return isBeyondThreePointLine(position, basket, state.court) ? 3 : 2
}

export function estimateShotContest(state: MatchState, shooterPlayerId: PlayerId): ShotContest {
  const shooter = state.players.find((player) => player.playerId === shooterPlayerId)
  if (!shooter) return { score: 0, defenderPlayerId: null, distanceMeters: null }
  const closest = state.players
    .filter((player) => player.active && player.teamId !== shooter.teamId)
    .map((defender) => ({
      defender,
      distance: distanceBetween(defender.position, shooter.position),
      score: clamp((3.4 - distanceBetween(defender.position, shooter.position)) / 2.8, 0, 1)
        * (0.6 + clamp(defender.defense.pointOfAttack, 0, 100) / 250),
    }))
    .sort((left, right) => right.score - left.score || String(left.defender.playerId).localeCompare(String(right.defender.playerId)))[0]
  return closest
    ? { score: closest.score, defenderPlayerId: closest.defender.playerId, distanceMeters: closest.distance }
    : { score: 0, defenderPlayerId: null, distanceMeters: null }
}

export function shotMakeProbability(shooting: number, distanceMeters: number, points: 2 | 3, contestScore: number): number {
  const base = points === 3 ? 0.35 : distanceMeters <= 2.2 ? 0.66 : distanceMeters <= 5 ? 0.53 : 0.44
  const ratingEffect = (clamp(shooting, 0, 100) - 50) * 0.004
  const longTwoPenalty = points === 2 ? Math.max(0, distanceMeters - 5) * 0.012 : 0
  return clamp(base + ratingEffect - longTwoPenalty - clamp(contestScore, 0, 1) * 0.28, 0.04, 0.82)
}

export function passQuality(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState): number {
  const average = (passer.passing.accuracy + passer.passing.vision + passer.passing.timing) / 3
  const laneDistance = Math.min(...state.players
    .filter((player) => player.active && player.teamId !== passer.teamId)
    .map((player) => distanceToSegment(player.position, passer.position, receiver.position)), Number.POSITIVE_INFINITY)
  const pressure = clamp((2.1 - laneDistance) / 2.1, 0, 1)
  return clamp(0.55 + (clamp(average, 0, 100) - 50) * 0.004 - pressure * 0.22, 0.28, 0.94)
}

/** Selects one possession action from current MatchState and the completed action that led here. */
export function selectDecision(state: MatchState): MatchDecision | null {
  const possession = activePossession(state)
  const liveTransition = possession !== undefined && state.transition?.teamId === possession.teamId
    && (possession.phase === 'ADVANCE' || possession.phase === 'ACTION')
  if (!possession || (possession.phase !== 'SETUP' && possession.phase !== 'ACTION' && !liveTransition) || state.ball.kind !== 'HELD' || state.ball.ownerTeamId !== possession.teamId) return null
  const ownerPlayerId = state.ball.ownerPlayerId
  const actor = state.players.find((player) => player.playerId === ownerPlayerId)
  if (!actor) return null
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  if (liveTransition && state.transition?.trigger === 'defensiveRebound' && state.t - state.transition.startedT < 4) return null
  const lastOffensive = [...state.actions].reverse().find((action) => action.teamId === possession.teamId && action.kind !== 'CLOSEOUT')
  let kind: MatchDecisionKind
  let targetPlayerId: PlayerId | undefined
  let reason: string

  const outletAlreadyCaught = state.actions.some((action) => action.teamId === possession.teamId
    && action.startedT >= (state.transition?.startedT ?? Number.POSITIVE_INFINITY)
    && (action.kind === 'PASS' || action.kind === 'KICK_OUT') && action.status === 'COMPLETED' && action.outcome === 'CAUGHT')
  const outlet = liveTransition && state.transition && !outletAlreadyCaught
    && (state.transition.trigger === 'defensiveRebound' || state.transition.advantage === 'ADVANTAGE')
    ? bestTransitionReceiver(state, actor, basket) ?? (state.transition.trigger === 'defensiveRebound' ? bestReceiver(state, actor, false) : undefined)
    : undefined

  if (outlet) {
    kind = 'PASS'
    targetPlayerId = outlet.playerId
    reason = state.transition?.trigger === 'defensiveRebound'
      ? 'Outlet the defensive rebound to a teammate advancing into open court'
      : 'Pass ahead to preserve the transition advantage'
  } else if (lastOffensive?.kind === 'DRIVE' && lastOffensive.status === 'COMPLETED' && lastOffensive.outcome === 'ADVANTAGE') {
    targetPlayerId = bestReceiver(state, actor, true)?.playerId
    kind = targetPlayerId ? 'KICK_OUT' : 'SHOOT'
    reason = targetPlayerId ? 'Help has collapsed on the drive; pass to the most open shooter' : 'No viable kick-out target; finish the advantage at the rim'
  } else if ((lastOffensive?.kind === 'KICK_OUT' || lastOffensive?.kind === 'PASS')
    && lastOffensive.status === 'COMPLETED' && lastOffensive.outcome === 'CAUGHT' && lastOffensive.targetPlayerId === actor.playerId) {
    const value = shotValueAt(actor.position, basket, state)
    const contest = estimateShotContest(state, actor.playerId)
    kind = lastOffensive.kind === 'KICK_OUT' && actor.offense.shooting >= 60 ? 'CATCH_AND_SHOOT'
      : value === 3 && actor.offense.shooting >= 68 && contest.score < 0.35 ? 'CATCH_AND_SHOOT'
        : 'DRIVE'
    reason = kind === 'CATCH_AND_SHOOT' ? 'Catch in shooting range before the closeout arrives' : 'Attack the closeout with a drive'
  } else {
    const distance = distanceBetween(actor.position, basket)
    const contest = estimateShotContest(state, actor.playerId)
    const points = shotValueAt(actor.position, basket, state)
    const probability = shotMakeProbability(actor.offense.shooting, distance, points, contest.score)
    const receiver = bestReceiver(state, actor, false)
    if (distance <= 7.5 && actor.offense.shooting >= 70 && probability >= 0.42) {
      kind = 'SHOOT'
      reason = 'Take the available shot from live position and contest'
    } else if (distance > 3.2 && (actor.offense.rimAttack + actor.offense.creation) / 2 >= 62) {
      kind = 'DRIVE'
      reason = 'Use rim pressure and creation to attack the basket'
    } else if (receiver) {
      kind = 'PASS'
      targetPlayerId = receiver.playerId
      reason = 'Move the ball to the best available teammate'
    } else {
      kind = 'SHOOT'
      reason = 'Use the available possession before the clock expires'
    }
  }

  return {
    id: `match-decision-${state.nextMatchDecisionSequence}`,
    kind,
    playerId: actor.playerId,
    teamId: actor.teamId,
    decidedT: state.t,
    reason,
    ...(targetPlayerId === undefined ? {} : { targetPlayerId }),
  }
}

export function bestReceiver(state: MatchState, passer: MatchPlayerState, preferOpenShooter: boolean): MatchPlayerState | undefined {
  const candidates = state.players.filter((player) => player.active && player.teamId === passer.teamId && player.playerId !== passer.playerId)
  return candidates.map((player) => {
    const nearestDefenderDistance = Math.min(...state.players.filter((candidate) => candidate.active && candidate.teamId !== player.teamId)
      .map((defender) => distanceBetween(defender.position, player.position)), Number.POSITIVE_INFINITY)
    const score = Math.min(nearestDefenderDistance, 8) * 0.08
      + (preferOpenShooter ? player.offense.shooting * 0.004 : player.offense.creation * 0.002)
    return { player, score }
  }).sort((left, right) => right.score - left.score || String(left.player.playerId).localeCompare(String(right.player.playerId)))[0]?.player
}

function bestTransitionReceiver(state: MatchState, passer: MatchPlayerState, basket: CourtPosition): MatchPlayerState | undefined {
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  return state.players.filter((player) => player.active && player.teamId === passer.teamId && player.playerId !== passer.playerId)
    .map((player) => {
      const progress = (player.position.x - passer.position.x) * direction
      const nearestDefender = Math.min(...state.players.filter((candidate) => candidate.active && candidate.teamId !== passer.teamId)
        .map((defender) => distanceBetween(defender.position, player.position)), Number.POSITIVE_INFINITY)
      const lane = Math.min(...state.players.filter((candidate) => candidate.active && candidate.teamId !== passer.teamId)
        .map((defender) => distanceToSegment(defender.position, passer.position, player.position)), Number.POSITIVE_INFINITY)
      const score = progress + Math.min(nearestDefender, 8) * 0.28 + player.offense.creation * 0.008
        - Math.max(0, 1.1 - lane) * 3
      return { player, score, progress, lane }
    })
    .filter((candidate) => candidate.progress > 0.75 && candidate.lane > 0.45)
    .sort((left, right) => right.score - left.score || String(left.player.playerId).localeCompare(String(right.player.playerId)))[0]?.player
}

export function driveTarget(state: MatchState, player: MatchPlayerState): CourtPosition {
  const possession = activePossession(state)
  const basket = attackingBasketForTeam(possession?.teamId ?? player.teamId, state.homeTeamId, state.period, state.court)
  const direction = basket.x >= state.court.lengthMeters / 2 ? -1 : 1
  return {
    x: clamp(basket.x + direction * 3.4, 0.8, state.court.lengthMeters - 0.8),
    y: clamp(player.position.y, 2.5, state.court.widthMeters - 2.5),
  }
}

function distanceToSegment(point: CourtPosition, start: CourtPosition, end: CourtPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-9) return distanceBetween(point, start)
  const projection = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  return distanceBetween(point, { x: start.x + projection * dx, y: start.y + projection * dy })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
