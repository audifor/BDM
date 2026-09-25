import { distanceBetween, isInsideCourt, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { createDriveIntent, driveOpportunity, type DriveIntent } from './DribbleDrives'
import type { OffensiveAction } from './OffensiveActions'
import type { RandomSource } from '@/engine/random'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { PASS_RESOLUTION_V1 } from './PassingResolution'
import { chooseWeighted } from './WeightedChoice'
import { controlBallByPlayer, type SpatialState } from './SpatialState'

export const HANDOFF_RULES_V1 = { transferDistanceMeters: 1.25 } as const

export type HandoffContinuation = 'DRIVE' | 'SHOT' | 'PASS' | 'RESET'
export interface HandoffRead { readonly continuation: HandoffContinuation; readonly driveIntent?: DriveIntent }
export interface ActiveHandoff { readonly giverId: PlayerId; readonly receiverId: PlayerId; readonly transferred: boolean }

/** Validates the canonical giver/receiver pair against possession, lineups and spatial state. */
export function validateHandoff(input: {
  readonly action: OffensiveAction | undefined
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly spatial: SpatialState
}): ActiveHandoff | undefined {
  const action = input.action
  if (action?.kind !== 'HANDOFF' || action.teamId !== input.teamId || action.participantIds.length !== 2 || new Set(action.participantIds).size !== 2) return undefined
  const giverId = action.initiatorId
  const receiverId = action.participantIds.find((playerId) => playerId !== giverId)
  if (receiverId === undefined || !input.activeLineup.includes(giverId) || !input.activeLineup.includes(receiverId)) return undefined
  const giver = input.spatial.players.find((player) => player.playerId === giverId)
  const receiver = input.spatial.players.find((player) => player.playerId === receiverId)
  if (giver?.teamId !== input.teamId || receiver?.teamId !== input.teamId
    || !isInsideCourt(giver.position, input.spatial.court) || !isInsideCourt(receiver.position, input.spatial.court)) return undefined
  const owner = input.spatial.ball
  const transferred = owner.kind === 'playerControlled' && owner.teamId === input.teamId && owner.playerId === receiverId
  const waitingOnGiver = owner.kind === 'playerControlled' && owner.teamId === input.teamId && owner.playerId === giverId
  if (!transferred && !waitingOnGiver) return undefined
  return { giverId, receiverId, transferred }
}

/** The receiver approaches the giver through MG6's ordinary spatial target override. */
export function handoffApproachTarget(spatial: SpatialState, giverId: PlayerId): CourtPosition | undefined {
  return spatial.players.find((player) => player.playerId === giverId)?.position
}

export function isHandoffTransferReady(spatial: SpatialState, giverId: PlayerId, receiverId: PlayerId): boolean {
  const giver = spatial.players.find((player) => player.playerId === giverId)
  const receiver = spatial.players.find((player) => player.playerId === receiverId)
  return giver !== undefined && receiver !== undefined
    && giver.teamId === receiver.teamId
    && distanceBetween(giver.position, receiver.position) <= HANDOFF_RULES_V1.transferDistanceMeters
}

/** Invalid transfers return no state; valid transfers change canonical ball ownership in one step. */
export function transferHandoffBall(input: {
  readonly spatial: SpatialState
  readonly teamId: TeamId
  readonly giverId: PlayerId
  readonly receiverId: PlayerId
  readonly activeLineup: readonly PlayerId[]
}): SpatialState | undefined {
  const giver = input.spatial.players.find((player) => player.playerId === input.giverId)
  const receiver = input.spatial.players.find((player) => player.playerId === input.receiverId)
  const ball = input.spatial.ball
  if (input.giverId === input.receiverId || !input.activeLineup.includes(input.giverId) || !input.activeLineup.includes(input.receiverId)
    || giver?.teamId !== input.teamId || receiver?.teamId !== input.teamId
    || !isInsideCourt(giver.position, input.spatial.court) || !isInsideCourt(receiver.position, input.spatial.court)
    || ball.kind !== 'playerControlled' || ball.teamId !== input.teamId || ball.playerId !== input.giverId
    || !isHandoffTransferReady(input.spatial, input.giverId, input.receiverId)) return undefined
  return controlBallByPlayer(input.spatial, input.receiverId)
}

/** Selects a valid continuation using the receiver's existing tendencies and the current defender. */
export function selectHandoffContinuation(input: {
  readonly handler: MatchPlayerProfile
  readonly teamId: TeamId
  readonly defenderId: PlayerId
  readonly activeLineup: readonly PlayerId[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly passesThisPossession: number
  readonly random: RandomSource
}): HandoffRead {
  const handlerIsOwner = input.activeLineup.includes(input.handler.playerId)
    && input.spatial.ball.kind === 'playerControlled'
    && input.spatial.ball.playerId === input.handler.playerId
    && input.spatial.ball.teamId === input.teamId
    && input.spatial.players.some((player) => player.playerId === input.handler.playerId && player.teamId === input.teamId)
  if (!handlerIsOwner) return { continuation: 'RESET' }
  const options: { readonly item: Exclude<HandoffContinuation, 'RESET'>; readonly weight: number }[] = []
  const opportunity = driveOpportunity({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket })
  if (opportunity !== undefined && input.handler.tendencies.DRIVE_FREQUENCY > 0) options.push({ item: 'DRIVE', weight: input.handler.tendencies.DRIVE_FREQUENCY * opportunity })
  const shotWeight = Math.max(input.handler.tendencies.SHOT_FREQUENCY, input.handler.tendencies.PULLUP_FREQUENCY)
  if (shotWeight > 0) options.push({ item: 'SHOT', weight: shotWeight })
  const hasPassTarget = input.passesThisPossession < PASS_RESOLUTION_V1.maximumPassesPerPossession
    && input.activeLineup.some((playerId) => playerId !== input.handler.playerId && input.spatial.players.some((player) => player.playerId === playerId && player.teamId === input.teamId))
  if (hasPassTarget && input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY > 0) options.push({ item: 'PASS', weight: input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY })
  if (options.length === 0) return { continuation: 'RESET' }
  const continuation = chooseWeighted(options, input.random)
  return continuation === 'DRIVE'
    ? { continuation, driveIntent: createDriveIntent({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) }
    : { continuation }
}
