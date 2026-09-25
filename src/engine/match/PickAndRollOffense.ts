import type { PlayerId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import { chooseWeighted } from './WeightedChoice'
import type { DefensiveCoverageState } from './DefensiveCoverages'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import type { ScreenIntent } from './ScreenInteractions'
import type { SpatialState } from './SpatialState'

export type PickAndRollScreenerContinuation = 'roll' | 'pop'
export type PickAndRollScreenDecision = 'USE_SCREEN' | 'REJECT_SCREEN'
export type PickAndRollHandlerContinuation = 'HANDLER_DRIVE' | 'HANDLER_SHOT' | 'PASS_TO_ROLLER' | 'PASS_TO_POPPER' | 'RESET'

export function selectPickAndRollScreenerContinuation(
  screener: MatchPlayerProfile,
  random: RandomSource,
): PickAndRollScreenerContinuation {
  return chooseWeighted([
    { item: 'roll' as const, weight: screener.tendencies.PICK_AND_ROLL_ROLL_FREQUENCY },
    { item: 'pop' as const, weight: screener.tendencies.PICK_AND_POP_FREQUENCY },
  ], random)
}

/** A set screen is used when its geometry actually crosses the on-ball defender's route. */
export function decidePickAndRollScreenUse(input: {
  readonly screen: ScreenIntent
  readonly screenAffectsDefender: boolean
}): PickAndRollScreenDecision {
  if (input.screen.phase !== 'set' || input.screenAffectsDefender) return 'USE_SCREEN'
  return 'REJECT_SCREEN'
}

export function selectPickAndRollHandlerContinuation(input: {
  readonly handler: MatchPlayerProfile
  readonly screen: ScreenIntent
  readonly coverage?: DefensiveCoverageState['type']
  readonly driveAvailable: boolean
  readonly passesThisPossession: number
  readonly activeLineup: readonly PlayerId[]
  readonly spatial: SpatialState
  readonly random: RandomSource
}): PickAndRollHandlerContinuation {
  const options: { readonly item: Exclude<PickAndRollHandlerContinuation, 'RESET'>; readonly weight: number }[] = []
  const handlerIsActive = input.activeLineup.includes(input.handler.playerId)
    && input.spatial.ball.kind === 'playerControlled'
    && input.spatial.ball.playerId === input.handler.playerId
    && input.spatial.players.some((player) => player.playerId === input.handler.playerId)

  if (handlerIsActive && input.driveAvailable && input.coverage !== 'blitz') {
    options.push({ item: 'HANDLER_DRIVE', weight: input.handler.tendencies.DRIVE_FREQUENCY })
  }
  if (handlerIsActive && input.handler.tendencies.PULLUP_FREQUENCY > 0) {
    options.push({ item: 'HANDLER_SHOT', weight: input.handler.tendencies.PULLUP_FREQUENCY })
  }

  const screenerIsAvailable = input.screen.phase === 'postScreen'
    && input.screen.ballHandlerId === input.handler.playerId
    && input.passesThisPossession < 1
    && input.activeLineup.includes(input.screen.screenerId)
    && input.screen.screenerId !== input.handler.playerId
    && input.spatial.players.some((player) => player.playerId === input.screen.screenerId)
    && input.screen.postScreenAction !== undefined
    && input.screen.postScreenTarget !== undefined
  if (handlerIsActive && screenerIsAvailable) {
    const passWeight = input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY
    if (passWeight > 0) options.push({ item: input.screen.postScreenAction === 'roll' ? 'PASS_TO_ROLLER' : 'PASS_TO_POPPER', weight: passWeight })
  }

  const preferredOptions = options.filter((option) => option.weight > 0)
  return preferredOptions.length === 0 ? 'RESET' : chooseWeighted(preferredOptions, input.random)
}
