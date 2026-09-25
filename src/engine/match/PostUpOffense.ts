import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import { distanceBetween } from '@/domain/court'
import { createBackDownTarget } from './PostUpMovement'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { PASS_RESOLUTION_V1 } from './PassingResolution'
import { chooseWeighted } from './WeightedChoice'
import type { SpatialState } from './SpatialState'

export type PostUpContinuation = 'BACK_DOWN' | 'POST_SHOT' | 'PASS_OUT' | 'RESET'

export interface PostUpRead {
  readonly continuation: PostUpContinuation
  readonly backDownTarget?: CourtPosition
}

/** Chooses a post continuation after confirming that the current handler and defender are available. */
export function selectPostUpContinuation(input: {
  readonly postPlayer: MatchPlayerProfile
  readonly defender: MatchPlayerProfile
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly passesThisPossession: number
  readonly random: RandomSource
}): PostUpRead {
  const postSpatial = input.spatial.players.find((player) => player.playerId === input.postPlayer.playerId)
  const defenderSpatial = input.spatial.players.find((player) => player.playerId === input.defender.playerId)
  const ownsBall = input.spatial.ball.kind === 'playerControlled'
    && input.spatial.ball.playerId === input.postPlayer.playerId
    && input.spatial.ball.teamId === input.teamId
  if (!ownsBall || !input.activeLineup.includes(input.postPlayer.playerId) || postSpatial === undefined || defenderSpatial === undefined || postSpatial.teamId === defenderSpatial.teamId) {
    return { continuation: 'RESET' }
  }

  const options: { readonly item: Exclude<PostUpContinuation, 'RESET'>; readonly weight: number; readonly target?: CourtPosition }[] = []
  const backDownTarget = createBackDownTarget({ postPlayerId: input.postPlayer.playerId, defenderId: input.defender.playerId, spatial: input.spatial, attackingBasket: input.attackingBasket })
  if (backDownTarget !== undefined) {
    const physicalAdvantage = clamp(1 + (input.postPlayer.physical.weightKg - input.defender.physical.weightKg) / 100, 0.5, 1.5)
    const postUpInclination = input.postPlayer.tendencies.POST_UP_FREQUENCY
    const closeDefenderFactor = clamp(4 / Math.max(0.25, distanceBetween(postSpatial.position, defenderSpatial.position)), 0.5, 1.25)
    const backDownWeight = postUpInclination * physicalAdvantage * closeDefenderFactor
    if (backDownWeight > 0) options.push({ item: 'BACK_DOWN', weight: backDownWeight, target: backDownTarget })
  }

  const shotWeight = Math.max(input.postPlayer.tendencies.RIM_ATTEMPT_FREQUENCY, input.postPlayer.tendencies.SHOT_FREQUENCY)
  if (shotWeight > 0) options.push({ item: 'POST_SHOT', weight: shotWeight })

  const hasPassTarget = input.passesThisPossession < PASS_RESOLUTION_V1.maximumPassesPerPossession
    && input.activeLineup.some((playerId) => playerId !== input.postPlayer.playerId && input.spatial.players.some((player) => player.playerId === playerId))
  const passWeight = input.postPlayer.tendencies.ADVANTAGE_PASS_FREQUENCY
  if (hasPassTarget && passWeight > 0) options.push({ item: 'PASS_OUT', weight: passWeight })

  const availableOptions = options.filter((option) => option.weight > 0)
  if (availableOptions.length === 0) return { continuation: 'RESET' }

  const continuation = chooseWeighted(availableOptions.map(({ item, weight }) => ({ item, weight })), input.random)
  if (continuation !== 'BACK_DOWN') return { continuation }
  const target = availableOptions.find((option) => option.item === continuation)?.target
  return target === undefined
    ? { continuation: 'RESET' }
    : { continuation, backDownTarget: target }
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
