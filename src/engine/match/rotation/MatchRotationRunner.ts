import { createMatchSession, stepMatchSession, toMatchSimulation, type MatchSimulation, type SimulateMatchOptions } from '../MatchEngine'
import { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE } from './RotationController'
import type { TeamRotationPlan } from './RotationPlan'

export interface SimulateMatchWithRotationsOptions extends SimulateMatchOptions {
  readonly homeRotationPlan: TeamRotationPlan
  readonly awayRotationPlan: TeamRotationPlan
}

/** Orchestrates rotation decisions around the neutral incremental MatchEngine. */
export function simulateMatchWithRotations(options: SimulateMatchWithRotationsOptions): MatchSimulation {
  let session = createMatchSession(options)
  let homeController = INITIAL_ROTATION_CONTROLLER_STATE
  let awayController = INITIAL_ROTATION_CONTROLLER_STATE
  while (!session.state.isComplete) {
    const home = applyDueRotations(session, options.homeRotationPlan, homeController)
    const away = applyDueRotations(home.session, options.awayRotationPlan, awayController)
    session = stepMatchSession(away.session).session
    homeController = home.controllerState
    awayController = away.controllerState
  }
  return toMatchSimulation(session)
}
