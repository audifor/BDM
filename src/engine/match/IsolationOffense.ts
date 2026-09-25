import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import { createDriveIntent, driveOpportunity } from './DribbleDrives'
import type { DriveIntent } from './DribbleDrives'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { PASS_RESOLUTION_V1 } from './PassingResolution'
import { chooseWeighted } from './WeightedChoice'
import type { SpatialState } from './SpatialState'

export type IsolationContinuation = 'DRIVE' | 'SHOT' | 'PASS' | 'RESET'

export interface IsolationRead {
  readonly continuation: IsolationContinuation
  readonly driveIntent?: DriveIntent
}

/** Reads the current one-on-one context and chooses only among continuations that can run. */
export function selectIsolationContinuation(input: {
  readonly handler: MatchPlayerProfile
  readonly teamId: TeamId
  readonly defenderId: PlayerId
  readonly activeLineup: readonly PlayerId[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly passesThisPossession: number
  readonly random: RandomSource
}): IsolationRead {
  const handlerIsActive = input.activeLineup.includes(input.handler.playerId)
    && input.spatial.ball.kind === 'playerControlled'
    && input.spatial.ball.playerId === input.handler.playerId
    && input.spatial.ball.teamId === input.teamId
    && input.spatial.players.some((player) => player.playerId === input.handler.playerId)
  if (!handlerIsActive) return { continuation: 'RESET' }

  const options: { readonly item: Exclude<IsolationContinuation, 'RESET'>; readonly weight: number }[] = []
  const opportunity = driveOpportunity({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket })
  if (opportunity !== undefined) {
    const driveWeight = input.handler.tendencies.DRIVE_FREQUENCY * opportunity
    if (driveWeight > 0) options.push({ item: 'DRIVE', weight: driveWeight })
  }

  const shotWeight = Math.max(input.handler.tendencies.SHOT_FREQUENCY, input.handler.tendencies.PULLUP_FREQUENCY)
  if (shotWeight > 0) options.push({ item: 'SHOT', weight: shotWeight })

  const hasPassTarget = input.passesThisPossession < PASS_RESOLUTION_V1.maximumPassesPerPossession
    && input.activeLineup.some((playerId) => playerId !== input.handler.playerId && input.spatial.players.some((player) => player.playerId === playerId))
  const passWeight = input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY
  if (hasPassTarget && passWeight > 0) options.push({ item: 'PASS', weight: passWeight })

  const availableOptions = options.filter((option) => option.weight > 0)
  if (availableOptions.length === 0) return { continuation: 'RESET' }

  const continuation = chooseWeighted(availableOptions, input.random)
  return continuation === 'DRIVE'
    ? { continuation, driveIntent: createDriveIntent({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) }
    : { continuation }
}
