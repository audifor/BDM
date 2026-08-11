import { MatchSimulationError, substitutePlayer, type MatchSession } from '../MatchEngine'
import type { TeamRotationPlan } from './RotationPlan'

export interface RotationControllerState {
  readonly nextInstructionIndex: number
}

export interface ApplyDueRotationsResult {
  readonly session: MatchSession
  readonly controllerState: RotationControllerState
}

export const INITIAL_ROTATION_CONTROLLER_STATE: RotationControllerState = { nextInstructionIndex: 0 }

/** Applies every due instruction in plan order between sporting steps. */
export function applyDueRotations(session: MatchSession, plan: TeamRotationPlan, controllerState: RotationControllerState): ApplyDueRotationsResult {
  if (session.state.isComplete) return { session, controllerState }
  if (plan.teamId !== session.state.homeTeamId && plan.teamId !== session.state.awayTeamId) throw new MatchSimulationError(`Rotation plan Team ${plan.teamId} is not in this Game`)

  let nextSession = session
  let nextInstructionIndex = controllerState.nextInstructionIndex
  while (nextInstructionIndex < plan.instructions.length) {
    const instruction = plan.instructions[nextInstructionIndex]!
    if (!isDue(nextSession, instruction.period, instruction.clockThresholdSeconds)) break
    nextSession = substitutePlayer(nextSession, { teamId: plan.teamId, playerOutId: instruction.playerOutId, playerInId: instruction.playerInId })
    nextInstructionIndex += 1
  }
  return { session: nextSession, controllerState: { nextInstructionIndex } }
}

function isDue(session: MatchSession, period: number, clockThresholdSeconds: number): boolean {
  return session.state.period > period || (session.state.period === period && session.state.clockSecondsRemaining <= clockThresholdSeconds)
}
