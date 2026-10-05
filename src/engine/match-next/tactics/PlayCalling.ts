import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { hashStringToSeed } from '@/engine/random'
import type { MatchPlayerState, MatchState, PossessionState } from '../state'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { creatorStanding, lineupRoles, type LineupRoles } from './OffensiveRoles'
import { clamp, tacticalIntent, type TacticalIntent } from './TacticalIdentity'
import { tuning } from '../tuning'

/**
 * BT5.5-5.9: what the offense runs in a half court. The family is chosen from the tactical intent (coach + roster + plan + context) and
 * weighed by what the five on the floor can execute; the location, the initiator and the partners of the action come from the same
 * roles. A call only says what the team TRIES: whether the action pays is still decided read by read by the value model.
 */
export type PlayFamily = 'BALL_SCREEN' | 'DRIVE_KICK' | 'CIRCULATION' | 'MOVEMENT' | 'POST' | 'ISOLATION' | 'EARLY_OFFENSE'
export type PlayLocation = 'HIGH' | 'SIDE' | 'EMPTY_CORNER' | 'TOP' | 'WING' | 'LOW_POST' | 'ELBOW' | 'TRANSITION'
export type Spacing = '5OUT' | '4OUT1IN'

export const HALF_COURT_FAMILIES: readonly PlayFamily[] = ['BALL_SCREEN', 'DRIVE_KICK', 'CIRCULATION', 'MOVEMENT', 'POST', 'ISOLATION']

export interface PlayCall {
  readonly possessionId: string
  readonly family: PlayFamily
  readonly location: PlayLocation
  readonly spacing: Spacing
  /** Who starts the action (the handler of the screen, the isolation player, the passer of a movement set). */
  readonly initiatorId: PlayerId | null
  /** The partner: the screener of a ball screen or a pin-down. */
  readonly screenerId?: PlayerId
  /** The man the action is for: the interior target of a post entry, the shooter of a pin-down. */
  readonly targetId?: PlayerId
  readonly calledT: number
  readonly weights: Readonly<Record<string, number>>
  readonly reason: string
}

/** Weight of each half-court family: what the intent asks for times what the roster can execute (an action nobody can run is rarely called). */
export function familyWeights(intent: TacticalIntent, roles: LineupRoles): Record<PlayFamily, number> {
  const o = intent.offense
  const r = intent.roster
  const fitScale = (fit: number): number => 0.3 + 0.7 * clamp(fit, 0, 1)
  const weights: Record<PlayFamily, number> = {
    // A ball screen is the handler's action first: a great screener does not make up for a handler who cannot use it.
    BALL_SCREEN: (0.12 + 1.7 * o.ballScreen) * (0.2 + 0.8 * clamp(0.7 * r.handler + 0.3 * Math.max(r.roller, r.popper), 0, 1)),
    DRIVE_KICK: (0.3 + 0.55 * (1 - o.ballMovement) / 2 + 0.25 * Math.max(0, o.interior)) * fitScale(0.45 * r.isolation + 0.3 * r.handler + 0.25 * r.shooting),
    CIRCULATION: (0.15 + 1.0 * (1 + o.ballMovement) / 2 + 0.2 * Math.max(0, -o.interior)) * fitScale(0.55 * r.passing + 0.45 * r.shooting),
    MOVEMENT: roles.movementShooterId === null ? 0 : (0.04 + 1.25 * o.offBall) * fitScale(0.55 * r.shooting + 0.45 * r.cutting),
    POST: roles.interiorTargetId === null ? 0 : (0.02 + 1.7 * Math.max(0, o.interior)) * fitScale(r.post),
    ISOLATION: (0.03 + 1.3 * o.isolation) * fitScale(r.isolation),
    EARLY_OFFENSE: 0,
  }
  if (tuning().newFamilies === 0) { weights.MOVEMENT = 0; weights.POST = 0; weights.ISOLATION = 0 }
  // A coach's system is his system: the family he prefers is called clearly more often than its plain share (weights ^ 1.5).
  for (const family of HALF_COURT_FAMILIES) weights[family] = Math.pow(weights[family], tuning().familySharpness)
  // A team that does not know its system yet runs it less faithfully: the calls drift toward a plain mix.
  const familiarity = intent.familiarity
  const mean = HALF_COURT_FAMILIES.reduce((sum, family) => sum + weights[family], 0) / HALF_COURT_FAMILIES.length
  for (const family of HALF_COURT_FAMILIES) if (weights[family] > 0) weights[family] = weights[family] + (1 - familiarity) * 0.35 * (mean - weights[family])
  return weights
}

/**
 * BT5.8: 4-out-1-in when the offense wants the ball inside and has someone to put there, or when a big cannot space the floor (a
 * non-shooter in the corner only brings his defender into the lane). Otherwise five out.
 */
export function spacingFor(state: MatchState, teamId: TeamId, intent: TacticalIntent = tacticalIntent(state, teamId), roles: LineupRoles = lineupRoles(state, teamId, intent)): { readonly spacing: Spacing; readonly postPlayerId: PlayerId | null } {
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  if (tuning().postSpacing === 0) return { spacing: '5OUT', postPlayerId: null }
  const nonShootingBig = lineup.filter((player) => player.playerId !== roles.primaryCreatorId && player.heightCm >= 203 && player.offense.shooting < 52)
    .sort((left, right) => left.offense.shooting - right.offense.shooting || String(left.playerId).localeCompare(String(right.playerId)))[0]
  if (roles.interiorTargetId !== null && intent.offense.interior > 0.05) return { spacing: '4OUT1IN', postPlayerId: roles.interiorTargetId }
  if (nonShootingBig !== undefined && intent.offense.interior > -0.45) return { spacing: '4OUT1IN', postPlayerId: nonShootingBig.playerId }
  return { spacing: '5OUT', postPlayerId: null }
}

function noise(key: string): number {
  return hashStringToSeed(key) / 0x1_0000_0000
}

function guardOf(state: MatchState, attacker: MatchPlayerState): MatchPlayerState | undefined {
  const id = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === attacker.playerId)?.defenderPlayerId
  return id === undefined ? undefined : state.players.find((player) => player.playerId === id)
}

/**
 * BT5.5: who starts this possession's action. Creation, handle and vision first; then the matchup (a weaker defender), the role, the
 * plan's featured player, fatigue, and how many of the last possessions he already started (a star carries more, not all of them).
 */
export function selectInitiator(state: MatchState, teamId: TeamId, family: PlayFamily, roles: LineupRoles, recent: readonly PlayerId[], salt: string): MatchPlayerState | undefined {
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  const scored = lineup.map((player) => {
    const guard = guardOf(state, player)
    const role = player.playerId === roles.primaryCreatorId ? 6 : player.playerId === roles.secondaryCreatorId ? 3 : 0
    const load = recent.filter((id) => id === player.playerId).length * 3.5
    const matchup = guard === undefined ? 0 : (65 - (family === 'ISOLATION' ? (guard.defense.pointOfAttack + guard.defensiveMobility) / 2 : guard.defense.pointOfAttack)) * 0.25
    const foulTrouble = guard !== undefined && family === 'ISOLATION' ? (state.fouls.personal[guard.playerId] ?? 0) * 1.5 : 0
    const base = family === 'ISOLATION' ? (player.offense.creation + player.offense.rimAttack) / 2 - player.fatigue * 0.15 : creatorStanding(state, player)
    return { player, score: base + role + matchup + foulTrouble - load + (noise(`${salt}:init:${player.playerId}`) - 0.5) * 6 }
  })
  return scored.sort((left, right) => right.score - left.score || String(left.player.playerId).localeCompare(String(right.player.playerId)))[0]?.player
}

/** Calls this half court's play. Deterministic: the intent, the roles, the match memory and a hash of the possession. */
export function callPlay(state: MatchState, possession: PossessionState): PlayCall {
  const teamId = possession.teamId
  const intent = tacticalIntent(state, teamId)
  const roles = lineupRoles(state, teamId, intent)
  const weights = familyWeights(intent, roles)
  const salt = `bt5-play:${possession.id}:${possession.offensiveRebounds}`
  const total = HALF_COURT_FAMILIES.reduce((sum, family) => sum + weights[family], 0)
  let u = noise(salt) * total
  let family: PlayFamily = 'CIRCULATION'
  for (const candidate of HALF_COURT_FAMILIES) {
    if (weights[candidate] <= 0) continue
    if (u < weights[candidate]) { family = candidate; break }
    u -= weights[candidate]
  }
  const memory = teamId === state.homeTeamId ? state.tactics?.home : state.tactics?.away
  const recent = memory?.recentInitiators ?? []
  const { spacing } = spacingFor(state, teamId, intent, roles)
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  const holderId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
  let initiator = selectInitiator(state, teamId, family, roles, recent, salt)
  let screenerId: PlayerId | undefined
  let targetId: PlayerId | undefined
  let location: PlayLocation = 'TOP'
  const r = intent.roster
  const pick = (options: readonly (readonly [PlayLocation, number])[]): PlayLocation => {
    const sum = options.reduce((a, [, w]) => a + Math.max(0, w), 0)
    let v = noise(`${salt}:loc`) * sum
    for (const [option, w] of options) { if (v < Math.max(0, w)) return option; v -= Math.max(0, w) }
    return options[0]![0]
  }
  if (family === 'BALL_SCREEN') {
    screenerId = roles.screenerId !== null && roles.screenerId !== initiator?.playerId ? roles.screenerId : lineup.find((player) => player.playerId !== initiator?.playerId && player.heightCm >= 200)?.playerId
    // An elite roller wants the strong corner empty (no tagger there); a team of shooters keeps it filled and plays on a side; the default is the top.
    location = pick([['HIGH', 1], ['SIDE', 0.4 + 0.6 * r.shooting], ['EMPTY_CORNER', 0.15 + 1.2 * r.roller * intent.offense.ballScreen]])
  } else if (family === 'POST') {
    targetId = roles.interiorTargetId ?? undefined
    const target = lineup.find((player) => player.playerId === targetId)
    initiator = lineup.find((player) => player.playerId === holderId && player.playerId !== targetId) ?? initiator
    location = target !== undefined && (target.offense.shooting >= 62 || target.passing.vision >= 66) ? 'ELBOW' : 'LOW_POST'
  } else if (family === 'MOVEMENT') {
    targetId = roles.movementShooterId ?? undefined
    if (initiator?.playerId === targetId) initiator = lineup.find((player) => player.playerId === roles.primaryCreatorId && player.playerId !== targetId) ?? lineup.find((player) => player.playerId !== targetId)
    screenerId = [roles.screenerId, roles.interiorTargetId].find((id) => id !== null && id !== targetId && id !== initiator?.playerId) ?? undefined
    location = 'WING'
  } else if (family === 'ISOLATION') {
    location = initiator !== undefined && initiator.heightCm >= 203 ? 'ELBOW' : initiator !== undefined && initiator.heightCm >= 196 ? 'WING' : 'TOP'
  } else if (family === 'DRIVE_KICK') {
    location = r.shooting >= 0.55 ? 'WING' : 'TOP'
  }
  const reason = `${family} @${location} (${spacing}): weights ${HALF_COURT_FAMILIES.map((f) => `${f}=${weights[f].toFixed(2)}`).join(' ')}; initiator ${initiator?.playerId ?? 'none'}`
  return {
    possessionId: possession.id, family, location, spacing, initiatorId: initiator?.playerId ?? null,
    ...(screenerId === undefined ? {} : { screenerId }), ...(targetId === undefined ? {} : { targetId }),
    calledT: state.t, weights: Object.fromEntries(HALF_COURT_FAMILIES.map((f) => [f, Math.round(weights[f] * 1000) / 1000])), reason,
  }
}

/**
 * Where the initiator brings the ball before the action starts (BT5.7): the top of the key for a high ball screen, isolation or
 * circulation, the wing for a side / empty-corner screen, a movement set or a drive and kick, the wing on the post side for an entry.
 */
export function initiatorSpot(state: MatchState, teamId: TeamId, call: PlayCall | null | undefined, holder: MatchPlayerState): CourtPosition {
  const basket = attackingBasketForTeam(teamId, state.homeTeamId, state.period, state.court)
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const centerY = state.court.widthMeters / 2
  const sideSign = holder.position.y >= centerY ? 1 : -1
  const wing = call !== null && call !== undefined && (call.location === 'SIDE' || call.location === 'EMPTY_CORNER' || call.location === 'WING' || call.location === 'LOW_POST')
  if (wing) return { x: basket.x - direction * 5.6, y: centerY + sideSign * 4.6 }
  if (call?.location === 'ELBOW' && call.family === 'ISOLATION') return { x: basket.x - direction * 5.4, y: centerY + sideSign * 2.2 }
  return { x: basket.x - direction * 7.4, y: centerY + clamp((holder.position.y - centerY) * 0.5, -3, 3) }
}

/**
 * BT5.12 quick initiation: how a team restarts after the opponent scores. A fast team takes the ball out as soon as the thrower and his
 * receiver are there (it does not wait for the formation) and throws it in at once; a controlled one takes its time. Returns whether
 * the formation may be skipped and the hold (ticks) before the throw.
 */
export function inboundTempo(state: MatchState, teamId: TeamId): { readonly skipFormation: boolean; readonly holdTicks: number } {
  const tempo = tacticalIntent(state, teamId).offense.tempo
  return { skipFormation: tempo > 0.35, holdTicks: Math.max(2, Math.min(7, Math.round(4 - tempo * 3))) }
}

/** The first receivers of a throw-in, in order: the primary creator first (the man who brings it up), then the rest of the lineup. */
export function inboundReceiverOrder(state: MatchState, teamId: TeamId, inbounderId: PlayerId): readonly PlayerId[] {
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId && player.playerId !== inbounderId)
  if (tuning().inboundToCreator === 0) return lineup.map((player) => player.playerId)
  const intent = tacticalIntent(state, teamId)
  const roles = lineupRoles(state, teamId, intent)
  // The primary creator brings it up, unless he has started most of the last possessions and there is a second creator: the load is shared, not rotated.
  const memory = teamId === state.homeTeamId ? state.tactics?.home : state.tactics?.away
  const recent = memory?.recentInitiators ?? []
  const primaryLoad = recent.filter((id) => id === roles.primaryCreatorId).length
  const preferred = roles.secondaryCreatorId !== null && primaryLoad >= 4 ? roles.secondaryCreatorId : roles.primaryCreatorId
  const first = lineup.find((player) => player.playerId === preferred) ?? lineup.find((player) => player.playerId === roles.secondaryCreatorId)
  return first === undefined ? lineup.map((player) => player.playerId) : [first.playerId, ...lineup.filter((player) => player !== first).map((player) => player.playerId)]
}
