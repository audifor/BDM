import { distanceBetween } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import { commitFoul } from '../rules/Fouls'
import { draw } from '../rng'
import { tuning } from '../tuning'
import { activePossession, type ContactEpisode, type MatchPlayerState, type MatchState } from '../state'
import { closingSpeed, CONTACT_DISTANCE_METERS, contactSeverity, isEstablished, isInPath } from './ContactModel'

/**
 * BT4J: contact between a man and the defender guarding him, on or off the ball. BT3 only judged contact inside a drive, a shot, a
 * screen or a fight for the ball, so a defender chasing a cutter, hand-checking a dribbler or a cutter running into a set defender
 * never produced a whistle: the game had almost no non-shooting fouls, hence no team-foul build-up and no bonus free throws.
 *
 * An episode is the time two guarding bodies are within reach of each other. It is judged once, when they part: who was moving into
 * whom, how hard, and whether the defender was set (the attacker charged) or moving (he reached, held or blocked). Nothing is drawn
 * unless the contact was measured.
 */
export const EPISODE_TOLERANCE = Object.freeze({ charge: 0.2, reachOnBall: 0.4, holdOffBall: 0.2, blocking: 0.2 })
const SEPARATION_METERS = 1.35
const STALE_TICKS = 14
const MIN_SEVERITY = 0.09

export function reconcileEpisodeContacts(state: MatchState): MatchState {
  const possession = activePossession(state)
  // Only while the ball is with a player or in a pass: a shot in the air, a rebound or a loose ball have their own judgement.
  if (!state.autonomousActions || possession === undefined || state.defensiveStructure === null || (state.ball.kind !== 'HELD' && state.ball.kind !== 'PASS_IN_FLIGHT') || state.isComplete) {
    return state.contactEpisodes.length === 0 ? state : { ...state, contactEpisodes: [] }
  }
  let next = state
  let episodes: ContactEpisode[] = [...state.contactEpisodes]
  for (const assignment of state.defensiveStructure.assignments) {
    const attacker = next.players.find((player) => player.playerId === assignment.attackerPlayerId && player.active)
    const defender = next.players.find((player) => player.playerId === assignment.defenderPlayerId && player.active)
    if (attacker === undefined || defender === undefined || attacker.teamId !== possession.teamId) continue
    const gap = distanceBetween(attacker.position, defender.position)
    const index = episodes.findIndex((item) => item.attackerId === attacker.playerId && item.defenderId === defender.playerId)
    if (gap <= CONTACT_DISTANCE_METERS) {
      const attackerClosing = closingSpeed(attacker, defender)
      const defenderClosing = closingSpeed(defender, attacker)
      const current: ContactEpisode = index < 0
        ? { attackerId: attacker.playerId, defenderId: defender.playerId, minGap: gap, attackerClosing, defenderClosing, established: isEstablished(defender, attacker), inPath: isInPath(defender, attacker), startedT: next.t, lastT: next.t }
        : { ...episodes[index]!, lastT: next.t, ...(gap < episodes[index]!.minGap ? { minGap: gap, attackerClosing, defenderClosing, established: isEstablished(defender, attacker), inPath: isInPath(defender, attacker) } : {}) }
      if (index < 0) episodes.push(current)
      else episodes[index] = current
    } else if (index >= 0 && (gap > SEPARATION_METERS || next.t - episodes[index]!.lastT > STALE_TICKS)) {
      const episode = episodes[index]!
      episodes = episodes.filter((_, at) => at !== index)
      next = { ...next, contactEpisodes: episodes }
      next = judgeEpisode(next, episode, attacker, defender)
      if (next.ball.kind === 'DEAD') return { ...next, contactEpisodes: [] }
      episodes = [...next.contactEpisodes]
    }
  }
  return episodes.length === state.contactEpisodes.length && episodes.every((item, at) => item === state.contactEpisodes[at]) && next === state ? state : { ...next, contactEpisodes: episodes }
}

function ownedElsewhere(state: MatchState, attacker: PlayerId, tick: number): boolean {
  // Contact inside a drive, a screen or a shot is judged there, once.
  return state.actions.some((action) => (action.status === 'ACTIVE' || (action.resolvedT !== undefined && tick - action.resolvedT <= 8))
    && action.playerId === attacker && (action.kind === 'DRIVE' || action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT' || action.kind === 'SCREEN'))
    || (state.screen !== null && (state.screen.handlerId === attacker || state.screen.screenerId === attacker))
}

function judgeEpisode(state: MatchState, episode: ContactEpisode, attacker: MatchPlayerState, defender: MatchPlayerState): MatchState {
  if (ownedElsewhere(state, attacker.playerId, state.t)) return state
  const hasBall = state.ball.kind === 'HELD' && state.ball.ownerPlayerId === attacker.playerId
  const attackerFault = episode.attackerClosing >= episode.defenderClosing + 0.9 && episode.established
  const mover = attackerFault ? attacker : defender
  const severity = contactSeverity(Math.max(0, Math.max(episode.attackerClosing, episode.defenderClosing)), mover.weightKg)
  if (severity < MIN_SEVERITY) return state
  const skill = (defender.defense.pointOfAttack + defender.defense.mobility) / 200
  const offenderIsAttacker = attackerFault
  const type = offenderIsAttacker ? 'CHARGING' as const : episode.inPath ? 'BLOCKING' as const : 'REACH' as const
  const tolerance = offenderIsAttacker ? EPISODE_TOLERANCE.charge : episode.inPath ? EPISODE_TOLERANCE.blocking : hasBall ? EPISODE_TOLERANCE.reachOnBall : EPISODE_TOLERANCE.holdOffBall
  const probability = Math.min(0.85, tuning().episodeFoulScale * tolerance * severity * (offenderIsAttacker ? 1.15 - 0.4 * (attacker.offense.rimAttack + attacker.offense.ballSecurity) / 200 : 1.3 - skill))
  const roll = draw(state.rng, 'outcome')
  let next: MatchState = { ...state, rng: roll.state }
  if (roll.value >= probability) return next
  next = emitEvent(next, 'contact', { playerId: mover.playerId, victimPlayerId: offenderIsAttacker ? defender.playerId : attacker.playerId, contactKind: offenderIsAttacker ? 'DRIVE' : 'LEGAL_DEFENSIVE', severity: Number(severity.toFixed(3)), foulType: type })
  const outcome = commitFoul(next, {
    offenderId: offenderIsAttacker ? attacker.playerId : defender.playerId, victimId: offenderIsAttacker ? defender.playerId : attacker.playerId, type,
    contact: offenderIsAttacker ? 'DRIVE' : 'LEGAL_DEFENSIVE', severity, offensive: offenderIsAttacker,
  })
  return outcome.record === null ? next : outcome.state
}
