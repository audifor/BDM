import { someEventSince } from '@/engine/match-next/events'
import { distanceBetween } from '@/domain/court'
import { attackingBasketForTeam } from '@/engine/match-next/structure/FiveOutStructure'
import { applyCommand, createMatchState, decideRotationSubstitutions, inboundReceiverOrder, inboundTempo, tick, toFrame, type MatchFrame, type MatchSetup, type MatchState } from '@/engine/match-next'
import type { MovementIntent } from '@/engine/match-next/movement/MovementIntent'
import type { InboundStartReason } from '@/engine/match-next/ball/BallTransitions'
import { createMatchNextResult, type MatchNextResult } from './MatchNextResult'
import { ownEvents, publishEvents, trimEvents } from '@/engine/match-next/execution/EventLog'

export interface MatchNextLiveSnapshot {
  readonly frame: MatchFrame
  readonly isComplete: boolean
}

interface PendingInbound {
  readonly teamId: MatchSetup['homeTeamId']
  readonly inbounderPlayerId: MatchSetup['initialLineups']['home'][number]
  readonly receiverPlayerId: MatchSetup['initialLineups']['home'][number]
  readonly responsibilityIds: readonly string[]
  readonly reason: InboundStartReason
  readonly spot: { readonly x: number; readonly y: number }
}

/** Ticks the inbounder holds the ball before passing it in (0.4 s). */
/** A restart closer than this to the attacked baseline is a frontcourt throw-in. */
const FRONTCOURT_RESTART_ROOM_METERS = 12
const FRONTCOURT_DEFENSE_RING = [{ depth: 2.2, lateral: 0 }, { depth: 3.4, lateral: -3.2 }, { depth: 3.4, lateral: 3.2 }, { depth: 5.2, lateral: -1.8 }, { depth: 5.2, lateral: 1.8 }] as const

const INBOUND_HOLD_TICKS = 4

/** Application owner for a Match Next session; consumers receive immutable frames. */
export class MatchNextLiveController {
  private state: MatchState
  private pendingInbound: PendingInbound | null = null
  /** A throw-in already started: the inbounder holds the ball a moment (looks for a target) before releasing it. */
  private inboundHold: { readonly receiverPlayerId: PendingInbound['receiverPlayerId']; readonly releaseAtT: number } | null = null

  public constructor(private readonly setup: MatchSetup) {
    this.state = applyCommand(createMatchState({ ...setup, autonomousActions: true }), {
      type: 'startOpeningJumpBall', homeLineup: setup.initialLineups.home, awayLineup: setup.initialLineups.away,
    })
  }

  /*
   * ME-LOCK1.2 execution boundary: during a step the session owns the event buffer and the engine appends to it in place (see
   * execution/EventLog). Every state that leaves the session (the accessor, the result) is published first: its events become exactly
   * its own and are never written again. Frames copy the events, so a snapshot needs no publication.
   */

  public advanceOneStep(): MatchNextLiveSnapshot {
    return this.advanceTicks(1)
  }

  public advanceTicks(count: number): MatchNextLiveSnapshot {
    for (let index = 0; index < count && !this.state.isComplete; index += 1) this.stepState()
    return this.snapshot()
  }

  public skipToEnd(): MatchNextResult {
    while (!this.state.isComplete) this.stepState()
    return this.result()
  }

  public snapshot(): MatchNextLiveSnapshot {
    return { frame: toFrame(this.state), isComplete: this.state.isComplete }
  }

  public result(): MatchNextResult {
    this.state = publishEvents(this.state)
    return createMatchNextResult(this.setup, this.state)
  }

  public get matchState(): MatchState {
    this.state = publishEvents(this.state)
    return this.state
  }
  public get matchSeed(): number { return this.setup.matchSeed }

  private teamsReadyForInbound(): boolean {
    const pending = this.pendingInbound
    if (!pending) return false
    // The dead ball is carried to the restart spot first: the throw-in never starts with the ball somewhere else.
    const ball = this.state.ball
    // A period restart has no restart spot on the ball: the throw-in spot is the pending one (the ball is carried there from where the horn caught it).
    if (ball.kind === 'DEAD' && distanceBetween(ball.position, ball.restartSpot ?? pending.spot) > 0.6) return false
    // Only the restart formation counts: an unrelated intent that happens to sit under the player must not release the throw-in.
    const ids = new Set(pending.responsibilityIds)
    const inbounder = this.state.players.find((player) => player.playerId === pending.inbounderPlayerId)
    if (inbounder === undefined || !inbounder.active || distanceBetween(inbounder.position, pending.spot) > 0.75) return false
    // BT5.12: after a basket a fast team does not wait for the formation: thrower and receiver in place, and the ball goes in.
    if (pending.reason === 'madeBasketInbound' && inboundTempo(this.state, pending.teamId).skipFormation) {
      const receiver = this.state.players.find((player) => player.playerId === pending.receiverPlayerId)
      const intent = receiver === undefined ? undefined : this.state.movementIntents.find((item) => item.playerId === receiver.playerId && ids.has(item.provenance.responsibilityId))
      return receiver !== undefined && intent !== undefined && distanceBetween(receiver.position, intent.target) <= 1.5
    }
    return this.state.players.filter((player) => player.active).every((player) => {
      const intent = this.state.movementIntents.find((item) => item.playerId === player.playerId && ids.has(item.provenance.responsibilityId))
      return intent !== undefined && distanceBetween(player.position, intent.target) <= 0.75
    })
  }

  private releasePeriodInbound(): void {
    const pending = this.pendingInbound
    if (!pending) return
    const ids = new Set(pending.responsibilityIds)
    const responsibilities = this.state.responsibilities.filter((item) => !ids.has(item.id))
    const decisions = this.state.decisions.filter((item) => !ids.has(item.responsibilityId))
    const movementIntents = this.state.movementIntents.filter((item) => !ids.has(item.provenance.responsibilityId))
    this.state = { ...this.state, responsibilities, decisions, movementIntents }
    this.state = applyCommand(this.state, { type: 'startInbound', teamId: pending.teamId, inbounderPlayerId: pending.inbounderPlayerId, reason: pending.reason })
    const hold = pending.reason === 'madeBasketInbound' ? inboundTempo(this.state, pending.teamId).holdTicks : INBOUND_HOLD_TICKS
    this.inboundHold = { receiverPlayerId: pending.receiverPlayerId, releaseAtT: this.state.t + hold }
    this.pendingInbound = null
  }

  /** The throw-in is in the inbounder's hands (INBOUND phase); after a short look he passes it in. */
  private releaseHeldInbound(): void {
    const hold = this.inboundHold
    if (!hold) return
    // The hold dies with the throw-in: a whistle or the horn during the hold must not block whatever restarts play next.
    if (this.state.ball.kind !== 'INBOUND') { this.inboundHold = null; return }
    if (this.state.t < hold.releaseAtT) return
    // Same pass-speed rule as ActionCore passes (about 10 m/s, 2-8 ticks). A fixed 1 tick moved the ball 3 m in 0.1 s
    // (30 m/s) on every inbound (BT1-Next: ~160 inbounds per game).
    const inbounderId = this.state.ball.inbounderPlayerId
    const inbounder = this.state.players.find((player) => player.playerId === inbounderId)
    const receiver = this.state.players.find((player) => player.playerId === hold.receiverPlayerId)
    const passDistance = inbounder === undefined || receiver === undefined ? 0 : distanceBetween(inbounder.position, receiver.position)
    const travelTicks = Math.max(2, Math.min(8, Math.ceil(passDistance)))
    this.state = applyCommand(this.state, { type: 'releaseInbound', receiverPlayerId: hold.receiverPlayerId, passKind: 'chest', travelTicks })
    this.inboundHold = null
  }

  private stepState(): void {
    this.state = ownEvents(this.state)
    this.stepOwnedState()
    this.state = trimEvents(this.state)
  }

  private stepOwnedState(): void {
    const previousPeriod = this.state.period
    this.state = tick(this.state)
    const reachedStoppage = someEventSince(this.state, this.state.t, (event) => event.type === 'ballDead')
    const substitutions = reachedStoppage ? decideRotationSubstitutions(this.state) : []
    if (substitutions.length > 0) this.state = applyCommand(this.state, { type: 'coachSubstitutions', proposals: substitutions })
    if (!this.state.isComplete && this.state.period !== previousPeriod) {
      this.state = preparePeriodInbound(this.state, this.setup, (pending) => { this.pendingInbound = pending })
    } else if (!this.state.isComplete && this.inboundHold !== null) {
      this.releaseHeldInbound()
    } else if (!this.state.isComplete && this.pendingInbound && this.teamsReadyForInbound()) {
      this.releasePeriodInbound()
    } else if (!this.state.isComplete && !this.pendingInbound && this.state.freeThrows === null && this.state.ball.kind === 'DEAD' && this.state.ball.reason !== 'periodEnd' && this.state.ball.reason !== 'freeThrow') {
      const restart = this.state.ball
      const teamId = restart.restartTeamId
      const reason = inboundReasonForDeadBall(restart.reason)
      if (teamId && reason) this.state = prepareRestartInbound(this.state, this.setup, teamId, reason, (pending) => { this.pendingInbound = pending })
    }
  }
}

function preparePeriodInbound(state: MatchState, setup: MatchSetup, setPending: (pending: PendingInbound) => void): MatchState {
  const opensAtHome = setup.matchSeed % 2 === 0
  const homeHasInbound = state.period % 2 === 1 ? opensAtHome : !opensAtHome
  const teamId = homeHasInbound ? setup.homeTeamId : setup.awayTeamId
  return prepareRestartInbound(state, setup, teamId, 'periodStart', setPending, inboundSpot(state))
}

function prepareRestartInbound(
  state: MatchState,
  setup: MatchSetup,
  teamId: MatchSetup['homeTeamId'],
  reason: InboundStartReason,
  setPending: (pending: PendingInbound) => void,
  requestedSpot?: { readonly x: number; readonly y: number },
): MatchState {
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId).map((player) => player.playerId)
  const target = requestedSpot ?? inboundSpot(state)
  // The player closest to the spot takes the ball out (he does not walk the length of the court); a teammate nearest to him receives.
  const inbounderPlayerId = [...lineup].sort((left, right) => spotDistance(state, left, target) - spotDistance(state, right, target) || String(left).localeCompare(String(right)))[0]!
  // The receiver is whoever the restart formation puts nearest to the thrower. BT5.5: that is the man who initiates (the primary creator),
  // then the rest of the lineup in order.
  const receivers = inboundReceiverOrder(state, teamId, inbounderPlayerId)
  const receiverPlayerId = receivers[0]!
  const targets = restartTargets(state, setup, teamId, inbounderPlayerId, target, reason, receivers)
  let nextResponsibilitySequence = state.nextResponsibilitySequence
  let nextDecisionSequence = state.nextDecisionSequence
  const responsibilities: MatchState['responsibilities'][number][] = []
  const decisions: MatchState['decisions'][number][] = []
  const intents: MovementIntent[] = []
  for (const player of state.players) {
    const movementTarget = targets.get(player.playerId)
    if (!movementTarget) continue
    const isInboundTeam = player.teamId === teamId
    const owner = isInboundTeam ? 'possession' : 'defensiveStructure'
    const responsibilityId = `responsibility-${nextResponsibilitySequence++}`
    const decisionId = `decision-${nextDecisionSequence++}`
    responsibilities.push({
      id: responsibilityId, playerId: player.playerId, teamId: player.teamId, kind: 'PERIOD_RESTART', owner, startedT: state.t,
      reason: isInboundTeam ? 'Move into the inbound formation' : 'Retreat into defensive formation before the inbound',
      endCondition: { kind: 'phaseChanges' },
    })
    decisions.push({ id: decisionId, playerId: player.playerId, responsibilityId, kind: 'PERIOD_RESTART', owner, startedT: state.t,
      reason: isInboundTeam && player.playerId === inbounderPlayerId ? 'Reach the inbound spot' : 'Reach the restart formation' })
    intents.push({
      playerId: player.playerId, target: movementTarget, urgency: isInboundTeam ? 'run' : 'sprint', facing: { kind: 'BALL' },
      provenance: { responsibilityId, decisionId, owner },
    })
  }
  setPending({ teamId, inbounderPlayerId, receiverPlayerId, responsibilityIds: responsibilities.map((item) => item.id), reason, spot: target })
  return {
    ...state,
    responsibilities: [...state.responsibilities.filter((item) => !targets.has(item.playerId)), ...responsibilities],
    decisions: [...state.decisions.filter((item) => !targets.has(item.playerId)), ...decisions],
    movementIntents: [...state.movementIntents.filter((item) => !targets.has(item.playerId)), ...intents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
}

function restartTargets(state: MatchState, setup: MatchSetup, inboundTeamId: MatchSetup['homeTeamId'], inbounderPlayerId: MatchSetup['initialLineups']['home'][number], spot: { readonly x: number; readonly y: number }, reason: InboundStartReason, receivers?: readonly MatchSetup['initialLineups']['home'][number][]): Map<MatchSetup['initialLineups']['home'][number], { readonly x: number; readonly y: number }> {
  const inboundIsHome = inboundTeamId === setup.homeTeamId
  const inboundLineup = state.players.filter((player) => player.active && player.teamId === inboundTeamId).map((player) => player.playerId)
  const defenseTeamId = inboundIsHome ? setup.awayTeamId : setup.homeTeamId
  const defenseLineup = state.players.filter((player) => player.active && player.teamId === defenseTeamId).map((player) => player.playerId)
  const basket = attackingBasketForTeam(inboundTeamId, setup.homeTeamId, state.period, state.court)
  const attackDirection = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const centerY = state.court.widthMeters / 2
  // A restart close to the basket the team attacks has no room to open "toward" it (every slot is cut at the baseline and the ten
  // players end up in a line on it): the offense opens into the court and the defense sets up around the basket instead.
  const roomToAttackedBaseline = attackDirection > 0 ? state.court.lengthMeters - spot.x : spot.x
  const frontcourtRestart = roomToAttackedBaseline < FRONTCOURT_RESTART_ROOM_METERS
  const direction = frontcourtRestart ? -attackDirection : attackDirection
  const targets = new Map<MatchSetup['initialLineups']['home'][number], { readonly x: number; readonly y: number }>([[inbounderPlayerId, spot]])
  const inboundTargets = frontcourtRestart
    ? [{ depth: 2.5, lateral: -4.5 }, { depth: 4.5, lateral: 1.5 }, { depth: 6.5, lateral: -2.5 }, { depth: 8, lateral: 4.5 }]
    : reason === 'madeBasketInbound'
    ? [{ depth: 3, lateral: 0 }, { depth: 7.5, lateral: -5 }, { depth: 12, lateral: 5 }, { depth: 16, lateral: 1.8 }]
    : [{ depth: 3, lateral: 0 }, { depth: 6, lateral: -3.8 }, { depth: 6, lateral: 3.8 }, { depth: 9, lateral: 1.8 }]
  // The rest keep the lineup order (guards up the floor, bigs nearer the ball), the natural mapping onto the offense's slots, so
  // the team is already close to its half-court spots when play starts.
  ;(receivers ?? inboundLineup.filter((playerId) => playerId !== inbounderPlayerId)).forEach((playerId, index) => {
    const slot = inboundTargets[index]!
    targets.set(playerId, {
      x: clampCourtX(spot.x + direction * slot.depth, state.court.lengthMeters),
      y: clampCourtY(centerY + slot.lateral, state.court.widthMeters),
    })
  })
  const defenseTargets = reason === 'madeBasketInbound'
    ? [{ depth: 5.5, lateral: 0 }, { depth: 9, lateral: -4.2 }, { depth: 9, lateral: 4.2 }, { depth: 14, lateral: -2.2 }, { depth: 17, lateral: 2.2 }]
    : [{ depth: 5.5, lateral: 0 }, { depth: 7.5, lateral: -4.2 }, { depth: 7.5, lateral: 4.2 }, { depth: 9.5, lateral: -1.8 }, { depth: 9.5, lateral: 1.8 }]
  defenseLineup.forEach((playerId, index) => {
    const slot = defenseTargets[index]!
    if (frontcourtRestart) {
      // Around the basket, between it and the ball: tight on the throw-in, spread across the lane and the arc.
      const ring = FRONTCOURT_DEFENSE_RING[index]!
      targets.set(playerId, {
        x: clampCourtX(basket.x - attackDirection * ring.depth, state.court.lengthMeters),
        y: clampCourtY(basket.y + ring.lateral, state.court.widthMeters),
      })
      return
    }
    targets.set(playerId, {
      x: clampCourtX(spot.x + direction * slot.depth, state.court.lengthMeters),
      y: clampCourtY(centerY + slot.lateral, state.court.widthMeters),
    })
  })
  return targets
}

function spotDistance(state: MatchState, playerId: MatchSetup['initialLineups']['home'][number], spot: { readonly x: number; readonly y: number }): number {
  const player = state.players.find((item) => item.playerId === playerId)
  return player === undefined ? Number.POSITIVE_INFINITY : distanceBetween(player.position, spot)
}

function clampCourtX(x: number, length: number): number { return Math.max(0.5, Math.min(length - 0.5, x)) }
function clampCourtY(y: number, width: number): number { return Math.max(0.5, Math.min(width - 0.5, y)) }

function inboundSpot(state: MatchState): { readonly x: number; readonly y: number } {
  if (state.ball.kind === 'DEAD' && state.ball.restartSpot) return state.ball.restartSpot
  return { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 }
}

function inboundReasonForDeadBall(reason: string): InboundStartReason | null {
  if (reason === 'madeBasket') return 'madeBasketInbound'
  if (reason === 'shotClockViolation') return 'shotClockViolation'
  if (reason === 'outOfBounds' || reason === 'other' || reason === 'foul') return 'turnoverInbound'
  return null
}
