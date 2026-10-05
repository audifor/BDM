/**
 * BT2K: ball and body continuity. Steps the engine one tick at a time and measures how far the ball and every player
 * move between consecutive ticks, grouped by what the ball is doing, so a teleport shows up as an outlier.
 */

import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { distanceBetween } from '@/domain/court'
import { dist, preparedSetup } from './economy'

/** Ball speed above which a single 0.1 s tick is not a physical movement (30 m/s = 3 m per tick). */
export const BALL_TELEPORT_METERS_PER_TICK = 2.5

export interface ContinuityReport {
  readonly seed: number
  readonly ticks: number
  readonly ballStepMetersByKind: Readonly<Record<string, ReturnType<typeof dist>>>
  readonly ballTeleports: readonly { readonly t: number; readonly from: string; readonly to: string; readonly meters: number }[]
  readonly ballHeightJumps: readonly { readonly t: number; readonly from: string; readonly to: string; readonly meters: number }[]
  readonly maxPlayerStepMeters: number
  readonly deadBallSeconds: ReturnType<typeof dist>
  readonly inboundRecoveryMeters: ReturnType<typeof dist>
}

export function auditContinuity(seed: number, maxTicks: number): ContinuityReport {
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  const steps: Record<string, number[]> = {}
  const teleports: ContinuityReport['ballTeleports'][number][] = []
  const heightJumps: ContinuityReport['ballHeightJumps'][number][] = []
  const deadSeconds: number[] = []
  const inboundRecovery: number[] = []
  let maxPlayerStep = 0
  let previous = live.matchState
  let deadSince: number | null = null
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const state = live.matchState
    const kind = `${previous.ball.kind}->${state.ball.kind}`
    const step = distanceBetween(previous.ball.position, state.ball.position)
    ;(steps[kind] ??= []).push(step)
    const flying = previous.ball.kind === 'PASS_IN_FLIGHT' || previous.ball.kind === 'SHOT_IN_FLIGHT' || previous.ball.kind === 'LOOSE' || previous.ball.kind === 'JUMP_BALL'
    if (!flying && step > BALL_TELEPORT_METERS_PER_TICK && state.period === previous.period) teleports.push({ t: state.t, from: previous.ball.kind, to: state.ball.kind, meters: Number(step.toFixed(2)) })
    const heightStep = Math.abs(previous.ball.heightMeters - state.ball.heightMeters)
    if (heightStep > 1.6 && previous.ball.kind !== 'SHOT_IN_FLIGHT' && state.period === previous.period) heightJumps.push({ t: state.t, from: previous.ball.kind, to: state.ball.kind, meters: Number(heightStep.toFixed(2)) })
    if (previous.ball.kind === 'DEAD' && state.ball.kind === 'INBOUND') inboundRecovery.push(distanceBetween(previous.ball.position, state.ball.position))
    if (state.ball.kind === 'DEAD' && deadSince === null) deadSince = previous.t
    if (state.ball.kind !== 'DEAD' && state.ball.kind !== 'INBOUND' && deadSince !== null) { deadSeconds.push((state.t - deadSince) / 10); deadSince = null }
    if (state.period === previous.period) {
      for (const player of state.players) {
        const before = previous.players.find((candidate) => candidate.playerId === player.playerId)
        if (before?.active && player.active) maxPlayerStep = Math.max(maxPlayerStep, distanceBetween(before.position, player.position))
      }
    }
    previous = state
  }
  return {
    seed, ticks: live.matchState.t,
    ballStepMetersByKind: Object.fromEntries(Object.entries(steps).map(([key, values]) => [key, dist(values)])),
    ballTeleports: teleports.slice(0, 40), ballHeightJumps: heightJumps.slice(0, 40),
    maxPlayerStepMeters: Number(maxPlayerStep.toFixed(2)), deadBallSeconds: dist(deadSeconds), inboundRecoveryMeters: dist(inboundRecovery),
  }
}
