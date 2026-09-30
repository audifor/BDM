import { distanceBetween } from '@/domain/court'
import { emitEvent } from '../events'
import { draw } from '../rng'
import { commitFoul } from '../rules/Fouls'
import { activePossession, type MatchPlayerState, type MatchState } from '../state'
import { assessBallContestContact } from './ContactModel'

/**
 * BT3C: the player who wins a rebound or a loose ball may have got there by pushing through an opponent. The referee
 * judges the contact of the winner with the nearest opponent once, at the moment of the touch: if it is a foul the ball is
 * dead and the rules decide the rest (turnover for an offensive foul, throw-in or free throws for a defensive one).
 */
export function judgeBallContestContact(state: MatchState, winner: MatchPlayerState, kind: 'REBOUNDING' | 'LOOSE_BALL'): { readonly state: MatchState; readonly fouled: boolean } {
  if (!state.autonomousActions) return { state, fouled: false }
  const opponent = state.players
    .filter((player) => player.active && player.teamId !== winner.teamId)
    .sort((left, right) => distanceBetween(left.position, winner.position) - distanceBetween(right.position, winner.position) || String(left.playerId).localeCompare(String(right.playerId)))[0]
  if (!opponent) return { state, fouled: false }
  const assessment = assessBallContestContact(winner, opponent, kind)
  let next = state
  if (assessment.severity >= 0.12) {
    next = emitEvent(next, 'contact', {
      playerId: assessment.offenderId ?? winner.playerId, victimPlayerId: assessment.victimId ?? opponent.playerId, contactKind: kind === 'REBOUNDING' ? 'REBOUNDING' : 'INCIDENTAL',
      severity: Number(assessment.severity.toFixed(3)), ...(assessment.foulType === null ? {} : { foulType: assessment.foulType }),
    })
  }
  if (assessment.foulType === null || assessment.offenderId === null || assessment.victimId === null) return { state: next, fouled: false }
  const roll = draw(next.rng, 'outcome')
  next = { ...next, rng: roll.state }
  if (roll.value >= assessment.callProbability) return { state: next, fouled: false }
  if (assessment.severity < 0.12) {
    next = emitEvent(next, 'contact', { playerId: assessment.offenderId, victimPlayerId: assessment.victimId, contactKind: kind === 'REBOUNDING' ? 'REBOUNDING' : 'INCIDENTAL', severity: Number(assessment.severity.toFixed(3)), foulType: assessment.foulType })
  }
  const offender = next.players.find((player) => player.playerId === assessment.offenderId)
  const possession = activePossession(next)
  const outcome = commitFoul(next, {
    offenderId: assessment.offenderId, victimId: assessment.victimId, type: assessment.foulType, contact: assessment.kind, severity: assessment.severity,
    offensive: offender !== undefined && possession !== undefined && offender.teamId === possession.teamId,
  })
  return { state: outcome.record === null ? next : outcome.state, fouled: outcome.record !== null }
}
