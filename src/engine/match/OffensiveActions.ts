import type { PlayerId, TeamId } from '@/domain/ids'

/** Offensive behaviors represented by the runtime action contract. */
export type OffensiveActionKind =
  | 'PICK_AND_ROLL'
  | 'ISOLATION'
  | 'POST_UP'
  | 'CUT'
  | 'HANDOFF'
  | 'SPOT_UP'
  | 'TRANSITION'
  | 'DRIVE'

/** The current possession-level basketball behavior; spatial intents remain separate. */
export interface OffensiveAction {
  readonly kind: OffensiveActionKind
  readonly teamId: TeamId
  readonly initiatorId: PlayerId
  readonly participantIds: readonly PlayerId[]
}

/** Creates an action only when its canonical participants belong to the active lineup. */
export function createOffensiveAction(input: {
  readonly kind: OffensiveActionKind
  readonly teamId: TeamId
  readonly initiatorId: PlayerId
  readonly participantIds: readonly PlayerId[]
  readonly activeLineup: readonly PlayerId[]
}): OffensiveAction {
  const participants = new Set(input.participantIds)
  if (!participants.has(input.initiatorId) || participants.size !== input.participantIds.length || input.participantIds.some((playerId) => !input.activeLineup.includes(playerId))) {
    throw new Error('Offensive action participants must be distinct active players and include the initiator')
  }
  return { kind: input.kind, teamId: input.teamId, initiatorId: input.initiatorId, participantIds: [...input.participantIds] }
}
