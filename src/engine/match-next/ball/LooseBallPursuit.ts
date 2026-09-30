import { distanceBetween } from '@/domain/court'
import { BALL_ACQUISITION_RADIUS_METERS } from './BallState'
import { recoverLooseBall } from './BallTransitions'
import { judgeBallContestContact } from '../contact/BallContestFouls'
import { activePossession, type MatchState } from '../state'
import type { PlayerResponsibility, StructuralDecision } from '../responsibility/Responsibility'
import type { MovementIntent } from '../movement/MovementIntent'

/** A live loose ball has one chaser per team; everyone else keeps the floor shape. */
export function reconcileLooseBallPursuit(state: MatchState): MatchState {
  if (state.ball.kind !== 'LOOSE') return clearPursuit(state)
  const prior = state.responsibilities.filter((item) => item.kind === 'PURSUE_LOOSE_BALL')
  const selected = [state.homeTeamId, state.awayTeamId].flatMap((teamId) => {
    const players = state.players.filter((player) => player.active && player.teamId === teamId)
    const existing = prior.find((item) => item.teamId === teamId)
    const player = players.find((item) => item.playerId === existing?.playerId)
      ?? players.sort((a, b) => distanceBetween(a.position, state.ball.position) - distanceBetween(b.position, state.ball.position)
        || String(a.playerId).localeCompare(String(b.playerId)))[0]
    return player ? [{ player, teamId, existing }] : []
  })
  const selectedIds = new Set(selected.map((item) => item.player.playerId))
  const responsibilities = state.responsibilities.filter((item) => !selectedIds.has(item.playerId) && item.kind !== 'PURSUE_LOOSE_BALL')
  const decisions = state.decisions.filter((item) => !selectedIds.has(item.playerId) && !prior.some((role) => role.id === item.responsibilityId))
  const movementIntents = state.movementIntents.filter((item) => !selectedIds.has(item.playerId) && !prior.some((role) => role.id === item.provenance.responsibilityId))
  let nextResponsibilitySequence = state.nextResponsibilitySequence
  let nextDecisionSequence = state.nextDecisionSequence
  for (const { player, teamId, existing } of selected) {
    const owner = teamId === activePossession(state)?.teamId ? 'offensiveStructure' : 'defensiveStructure'
    const responsibility: PlayerResponsibility = existing ?? {
      id: `responsibility-${nextResponsibilitySequence++}`, playerId: player.playerId, teamId,
      kind: 'PURSUE_LOOSE_BALL', owner, startedT: state.t,
      reason: 'Recover the live loose ball', endCondition: { kind: 'phaseChanges' },
    }
    const oldDecision = state.decisions.find((item) => item.responsibilityId === responsibility.id)
    const decision: StructuralDecision = oldDecision ?? {
      id: `decision-${nextDecisionSequence++}`, playerId: player.playerId,
      responsibilityId: responsibility.id, kind: 'PURSUE_LOOSE_BALL', owner,
      startedT: state.t, reason: 'Pursue the loose ball',
    }
    const intent: MovementIntent = {
      playerId: player.playerId, target: state.ball.position, urgency: 'sprint', facing: { kind: 'BALL' },
      provenance: { responsibilityId: responsibility.id, decisionId: decision.id, owner },
    }
    responsibilities.push(responsibility)
    decisions.push(decision)
    movementIntents.push(intent)
  }
  return { ...state, responsibilities, decisions, movementIntents, nextResponsibilitySequence, nextDecisionSequence }
}

/** A physical touch, including a player already in range, ends the loose-ball phase. */
export function securePhysicalLooseBall(state: MatchState): MatchState {
  if (state.ball.kind !== 'LOOSE') return state
  const eligible = state.players.filter((player) => player.active
    && distanceBetween(player.position, state.ball.position) <= BALL_ACQUISITION_RADIUS_METERS)
    .sort((a, b) => distanceBetween(a.position, state.ball.position) - distanceBetween(b.position, state.ball.position)
      || String(a.playerId).localeCompare(String(b.playerId)))
  if (!eligible[0]) return state
  const judged = judgeBallContestContact(state, eligible[0], 'LOOSE_BALL')
  if (judged.fouled) return judged.state
  return recoverLooseBall(judged.state, eligible[0].playerId)
}

function clearPursuit(state: MatchState): MatchState {
  const roles = state.responsibilities.filter((item) => item.kind === 'PURSUE_LOOSE_BALL')
  if (roles.length === 0) return state
  const ids = new Set(roles.map((item) => item.id))
  return {
    ...state,
    responsibilities: state.responsibilities.filter((item) => !ids.has(item.id)),
    decisions: state.decisions.filter((item) => !ids.has(item.responsibilityId)),
    movementIntents: state.movementIntents.filter((item) => !ids.has(item.provenance.responsibilityId)),
  }
}
