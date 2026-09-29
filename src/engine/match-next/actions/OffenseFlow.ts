import { hashStringToSeed } from '@/engine/random'
import type { PlayerId } from '@/domain/ids'
import { activePossession, type MatchPlayerState, type MatchState, type OffenseFlowState, type OffenseStage } from '../state'
import { isInsideZone } from '../structure/OffensiveStructure'

/** Share of the four off-ball players that must be in their zones for the half-court offense to count as set. */
export const SETTLE_READY_SHARE = 0.75
/** A rebounder needs this long to land, secure and square up before he can act again. */
export const OFFENSIVE_REBOUND_GATHER_TICKS = 7
/** After an advantage (help collapsed / finished drive) the next read is quick: the defense is still rotating. */
const ADVANTAGE_WINDOW_TICKS = 20
const POST_ACTION_READ_TICKS = 3

/** Deterministic value in [0, 1) that depends only on match seed state, tick, player and a salt (no RNG stream advance). */
export function decisionNoise(state: Pick<MatchState, 'rng' | 't'>, playerId: string, salt: string): number {
  return hashStringToSeed(`bt2:${state.rng.decision}:${state.t}:${playerId}:${salt}`) / 0x1_0000_0000
}

/** How long a player needs to read the floor after gaining control. Better passers/readers see it sooner. */
export function readTicksFor(state: Pick<MatchState, 'rng' | 't'>, player: MatchPlayerState): number {
  const reading = (player.passing.vision + player.passing.timing) / 2
  const base = 3 + Math.round((100 - Math.max(0, Math.min(100, reading))) / 30)
  return base + (decisionNoise(state, player.playerId, 'read') < 0.5 ? 0 : 1)
}

export function offenseSettlement(state: MatchState): { readonly inZone: number; readonly total: number; readonly share: number } {
  const structure = state.offensiveStructure
  if (structure === null) return { inZone: 0, total: 0, share: 0 }
  let inZone = 0
  let total = 0
  for (const assignment of structure.assignments) {
    if (assignment.slot === 'BALL') continue
    const player = state.players.find((candidate) => candidate.playerId === assignment.playerId)
    const slot = structure.slots.find((candidate) => candidate.slot === assignment.slot)
    if (!player || !slot) continue
    total += 1
    if (isInsideZone(player.position, slot.position, structure.attackingBasket)) inZone += 1
  }
  return { inZone, total, share: total === 0 ? 0 : inZone / total }
}

function freshFlow(state: MatchState, possessionId: string, teamId: OffenseFlowState['teamId'], offensiveRebounds: number): OffenseFlowState {
  return {
    possessionId, teamId, stage: 'EARLY', stageStartedT: state.t, holderPlayerId: null, holderSinceT: state.t, caughtFromPass: false,
    readyAtT: state.t, halfCourtSinceT: null, settledAtT: null, offensiveRebounds, lastResolvedT: state.t, resetPending: false, reads: 0, moves: [],
  }
}

/** Owns the possession phase structure: EARLY -> HALF_COURT -> ACTION -> ADVANTAGE / RESET, and the decision clock. */
export function reconcileOffenseFlow(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!possession) return state.offenseFlow === null ? state : { ...state, offenseFlow: null }
  let flow = state.offenseFlow?.possessionId === possession.id ? state.offenseFlow : freshFlow(state, possession.id, possession.teamId, possession.offensiveRebounds)

  // Ball control: whoever gains it needs a real read before the next decision.
  if (state.ball.kind === 'HELD' && state.ball.ownerTeamId === possession.teamId && state.ball.ownerPlayerId !== flow.holderPlayerId) {
    const ownerId: PlayerId = state.ball.ownerPlayerId
    const owner = state.players.find((player) => player.playerId === ownerId)
    if (owner) {
      const caughtFromPass = state.actions.some((action) => (action.kind === 'PASS' || action.kind === 'KICK_OUT') && action.status === 'COMPLETED'
        && action.outcome === 'CAUGHT' && action.targetPlayerId === ownerId && (action.resolvedT ?? -100) >= state.t - 1)
      flow = { ...flow, holderPlayerId: ownerId, holderSinceT: state.t, caughtFromPass, readyAtT: state.t + readTicksFor(state, owner) }
    }
  }

  // A finished action (drive, pass reception is handled above) leaves the handler a short read before the next one.
  const offensive = state.actions.filter((action) => action.teamId === possession.teamId && action.kind !== 'CLOSEOUT')
  const lastResolved = offensive.reduce((latest, action) => Math.max(latest, action.resolvedT ?? -1), -1)
  if (lastResolved > flow.lastResolvedT) {
    const last = offensive.find((action) => action.resolvedT === lastResolved)
    flow = { ...flow, lastResolvedT: lastResolved, readyAtT: Math.max(flow.readyAtT, lastResolved + (last?.kind === 'DRIVE' ? POST_ACTION_READ_TICKS : last?.kind === 'SCREEN' ? 2 : 0)) }
  }

  // Offensive rebound: gather and control first, then choose (putback is only one of the options).
  if (possession.offensiveRebounds > flow.offensiveRebounds) {
    flow = {
      ...flow, offensiveRebounds: possession.offensiveRebounds, resetPending: true, settledAtT: null, halfCourtSinceT: state.t,
      readyAtT: Math.max(flow.readyAtT, state.t + OFFENSIVE_REBOUND_GATHER_TICKS),
    }
  }

  const early = state.transition?.teamId === possession.teamId && state.transition.advantage === 'ADVANTAGE'
  const activeAction = offensive.some((action) => action.status === 'ACTIVE')
  const lastAdvantage = offensive.some((action) => action.kind === 'DRIVE' && action.status === 'COMPLETED'
    && (action.outcome === 'ADVANTAGE' || action.outcome === 'FINISH') && (action.resolvedT ?? -100) >= state.t - ADVANTAGE_WINDOW_TICKS)
  const inHalfCourt = possession.phase === 'SETUP' || possession.phase === 'ACTION' || (!early && possession.phase !== 'INBOUND' && possession.phase !== 'ADVANCE')
  let stage: OffenseStage
  if (possession.phase === 'INBOUND' || possession.phase === 'ADVANCE' || early) stage = 'EARLY'
  else if (activeAction) stage = 'ACTION'
  else if (flow.resetPending) stage = 'RESET'
  else if (lastAdvantage) stage = 'ADVANTAGE'
  else stage = 'HALF_COURT'
  if (stage !== flow.stage) flow = { ...flow, stage, stageStartedT: state.t }

  if (inHalfCourt && !early) {
    const halfCourtSinceT = flow.halfCourtSinceT ?? state.t
    const settlement = offenseSettlement(state)
    const settledAtT = flow.settledAtT ?? (settlement.total > 0 && settlement.share >= SETTLE_READY_SHARE ? state.t : null)
    if (halfCourtSinceT !== flow.halfCourtSinceT || settledAtT !== flow.settledAtT) flow = { ...flow, halfCourtSinceT, settledAtT }
  }
  return flow === state.offenseFlow ? state : { ...state, offenseFlow: flow }
}

export function isSettled(flow: OffenseFlowState | null): boolean {
  return flow === null || flow.settledAtT !== null
}
