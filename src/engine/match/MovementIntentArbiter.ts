import type { PlayerId } from '@/domain/ids'
import type { CourtPosition } from '@/domain/court'

export type MovementIntentSource =
  | 'transition'
  | 'drive'
  | 'postUp'
  | 'screen'
  | 'handoff'
  | 'cut'
  | 'screenCoverage'
  | 'defensiveReaction'
  | 'onBallContainment'
  | 'baseSpacing'

/** Diagnostic-only distance cutoff for a target jump considered large. */
export const LARGE_MOVEMENT_TARGET_JUMP_METERS = 5

/** Existing movement precedence made explicit at the arbiter boundary. */
export const MOVEMENT_INTENT_PRIORITY: Readonly<Record<MovementIntentSource, number>> = {
  transition: 100,
  screenCoverage: 90,
  drive: 80,
  postUp: 70,
  defensiveReaction: 70,
  screen: 60,
  handoff: 50,
  onBallContainment: 50,
  cut: 40,
  baseSpacing: 0,
}

export interface MovementIntentProposal {
  readonly key: string
  readonly playerId: PlayerId
  readonly source: MovementIntentSource
  readonly target: CourtPosition
  readonly priority: number
}

export interface ActiveMovementIntent extends MovementIntentProposal {
  readonly startedAtStep: number
}

export interface MovementIntentResolution {
  readonly active?: ActiveMovementIntent
  readonly rejected: readonly { readonly proposal: MovementIntentProposal; readonly reason: 'lowerPriority' | 'continuity' }[]
  readonly lifecycle: 'START' | 'ACTIVE' | 'INTERRUPTED' | 'COMPLETE'
  readonly why: 'newIntentSelected' | 'currentIntentRemainsValid' | 'higherPriorityIntent' | 'currentIntentNoLongerProposed' | 'noValidIntent'
}

/** Resolves one valid proposal set without RNG; a valid current responsibility survives fallback proposals. */
export function arbitrateMovementIntents(input: {
  readonly proposals: readonly MovementIntentProposal[]
  readonly current?: ActiveMovementIntent
  readonly step: number
}): MovementIntentResolution {
  const sorted = [...input.proposals].sort((left, right) =>
    right.priority - left.priority
      || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
      || (String(left.playerId) < String(right.playerId) ? -1 : String(left.playerId) > String(right.playerId) ? 1 : 0))
  const currentProposal = input.current === undefined ? undefined : sorted.find((proposal) => proposal.key === input.current!.key)
  const winner = currentProposal !== undefined
    && sorted[0] !== undefined
    && sorted[0].key !== currentProposal.key
    && sorted[0].priority > currentProposal.priority
    ? sorted[0]
    : currentProposal ?? sorted[0]

  if (winner === undefined) {
    return {
      active: undefined,
      rejected: [],
      lifecycle: 'COMPLETE',
      why: 'noValidIntent',
    }
  }

  const sameIntent = input.current?.key === winner.key
  const active: ActiveMovementIntent = {
    ...winner,
    startedAtStep: sameIntent ? input.current!.startedAtStep : input.step,
  }
  return {
    active,
    rejected: sorted.filter((proposal) => proposal.key !== winner.key).map((proposal) => ({
      proposal,
      reason: sameIntent && proposal.priority === winner.priority ? 'continuity' : 'lowerPriority',
    })),
    lifecycle: sameIntent ? 'ACTIVE' : input.current === undefined ? 'START' : 'INTERRUPTED',
    why: sameIntent
      ? 'currentIntentRemainsValid'
      : input.current === undefined
        ? 'newIntentSelected'
        : currentProposal === undefined
          ? 'currentIntentNoLongerProposed'
          : 'higherPriorityIntent',
  }
}

/** Resolves each player's fixed proposal set and returns a trace suitable for tests/debuggers. */
export function arbitrateMovementIntentSet(input: {
  readonly proposals: readonly MovementIntentProposal[]
  readonly currentByPlayerId: Readonly<Partial<Record<PlayerId, ActiveMovementIntent>>>
  readonly step: number
}): Readonly<Partial<Record<PlayerId, MovementIntentResolution>>> {
  const proposalsByPlayer = new Map<PlayerId, MovementIntentProposal[]>()
  for (const proposal of input.proposals) {
    const proposals = proposalsByPlayer.get(proposal.playerId) ?? []
    proposals.push(proposal)
    proposalsByPlayer.set(proposal.playerId, proposals)
  }
  const resolutions: Partial<Record<PlayerId, MovementIntentResolution>> = {}
  for (const [playerId, proposals] of proposalsByPlayer) {
    resolutions[playerId] = arbitrateMovementIntents({
      proposals,
      current: input.currentByPlayerId[playerId],
      step: input.step,
    })
  }
  return resolutions
}

export function movementIntentMetrics(timeline: readonly (readonly ActiveMovementIntent[])[], largeTargetJumpMeters = LARGE_MOVEMENT_TARGET_JUMP_METERS): {
  readonly intentSwitchesByPlayerId: Readonly<Partial<Record<PlayerId, number>>>
  readonly authoritySwitchesByPlayerId: Readonly<Partial<Record<PlayerId, number>>>
  readonly abaOscillationsByPlayerId: Readonly<Partial<Record<PlayerId, number>>>
  readonly largeTargetJumpsByPlayerId: Readonly<Partial<Record<PlayerId, number>>>
} {
  const intentSwitches: Partial<Record<PlayerId, number>> = {}
  const authoritySwitches: Partial<Record<PlayerId, number>> = {}
  const aba: Partial<Record<PlayerId, number>> = {}
  const jumps: Partial<Record<PlayerId, number>> = {}
  const previousByPlayer = new Map<PlayerId, ActiveMovementIntent[]>()
  for (const frame of timeline) {
    for (const intent of frame) {
      const previous = previousByPlayer.get(intent.playerId) ?? []
      const last = previous.at(-1)
      if (last !== undefined) {
        if (last.key !== intent.key) {
          intentSwitches[intent.playerId] = (intentSwitches[intent.playerId] ?? 0) + 1
          if (last.source !== intent.source) authoritySwitches[intent.playerId] = (authoritySwitches[intent.playerId] ?? 0) + 1
          if (previous.length >= 2 && previous.at(-2)!.key === intent.key) aba[intent.playerId] = (aba[intent.playerId] ?? 0) + 1
        }
        if (Math.hypot(last.target.x - intent.target.x, last.target.y - intent.target.y) >= largeTargetJumpMeters) jumps[intent.playerId] = (jumps[intent.playerId] ?? 0) + 1
      }
      previousByPlayer.set(intent.playerId, [...previous.slice(-1), intent])
    }
  }
  return { intentSwitchesByPlayerId: intentSwitches, authoritySwitchesByPlayerId: authoritySwitches, abaOscillationsByPlayerId: aba, largeTargetJumpsByPlayerId: jumps }
}
