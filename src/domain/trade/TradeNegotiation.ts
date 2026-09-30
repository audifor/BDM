import { parseGameDate, type GameDate } from '@/domain/date'
import type { PlayerContract } from '@/domain/contract'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import type { EcosystemId, SeasonId, StaffPersonId, TeamId } from '@/domain/ids'
import type { TradeExceptionUse, TradeAssetMovement, RetainedSalaryTerm } from './TradeModels'

export type TradeNegotiationStatus = 'PROPOSED' | 'COUNTERED' | 'AGREED' | 'EXECUTED' | 'REJECTED' | 'WITHDRAWN'
export type TradeNegotiationActionKind = 'PROPOSE' | 'COUNTER' | 'ACCEPT' | 'REJECT' | 'WITHDRAW'
export type TradeNegotiationActor = { readonly kind: 'USER' } | { readonly kind: 'STAFF'; readonly staffPersonId: StaffPersonId }

export interface TradeNegotiationRevision {
  readonly id: string
  readonly revisionNumber: number
  readonly packageId: string
  readonly participantTeamIds: readonly TeamId[]
  readonly movements: readonly TradeAssetMovement[]
  readonly retainedSalary?: readonly RetainedSalaryTerm[]
  readonly exceptionUses?: readonly TradeExceptionUse[]
  readonly contractSnapshots: readonly PlayerContract[]
  readonly proposedByTeamId: TeamId
  readonly proposedByActor: TradeNegotiationActor
  readonly proposedOn: GameDate
}

export interface TradeNegotiationAction {
  readonly id: string
  readonly kind: TradeNegotiationActionKind
  readonly negotiationId: string
  readonly revisionId: string
  readonly respondedToRevisionId?: string
  readonly teamId: TeamId
  readonly actor: TradeNegotiationActor
  readonly actedOn: GameDate
}

/** Persisted club-to-club discussion. It is deliberately separate from TradeProposal and TradeRecord. */
export interface TradeNegotiation {
  readonly id: string
  readonly pursuitId: string
  readonly ecosystemId: EcosystemId
  readonly seasonId: SeasonId
  readonly initiatingTeamId: TeamId
  readonly participantTeamIds: readonly TeamId[]
  readonly status: TradeNegotiationStatus
  readonly currentRevisionId: string
  readonly revisions: readonly TradeNegotiationRevision[]
  readonly actions: readonly TradeNegotiationAction[]
  readonly startedOn: GameDate
  readonly completedOn?: GameDate
  readonly tradeRecordId?: string
  readonly governanceDecisionIdsByTeamId?: Readonly<Record<string, string>>
}

export function createTradeNegotiation(input: TradeNegotiation): TradeNegotiation {
  if (!input.id.trim() || !input.pursuitId.trim() || !input.ecosystemId.trim() || !input.seasonId.trim()
    || input.participantTeamIds.length < 2 || new Set(input.participantTeamIds).size !== input.participantTeamIds.length
    || !input.participantTeamIds.includes(input.initiatingTeamId) || input.revisions.length === 0) {
    throw new RangeError('Trade negotiation identity is invalid')
  }
  const participants = new Set(input.participantTeamIds)
  const revisions = input.revisions.map((revision, index) => {
    if (revision.revisionNumber !== index || !revision.id.trim() || !revision.packageId.trim()
      || revision.participantTeamIds.length !== participants.size
      || revision.participantTeamIds.some((teamId) => !participants.has(teamId))
      || new Set(revision.participantTeamIds).size !== participants.size
      || !participants.has(revision.proposedByTeamId) || revision.movements.length === 0
      || new Set(revision.movements.map((movement) => movement.asset.kind === 'player' ? `player:${movement.asset.playerId}` : movement.asset.kind === 'draftPick' ? `pick:${movement.asset.draftPickId}` : movement.asset.kind === 'futureDraftPick' ? `future:${movement.asset.futureDraftPickRightId}` : movement.asset.kind === 'playerRights' ? `rights:${movement.asset.playerRightsId}` : movement.asset.kind === 'draftPickSwapRight' ? `swap:${movement.asset.draftPickSwapRightId}` : `cash:${movement.fromTeamId}:${movement.toTeamId}:${movement.asset.amount}`)).size !== revision.movements.length
      || revision.movements.some((movement) => !participants.has(movement.fromTeamId) || !participants.has(movement.toTeamId))) {
      throw new RangeError('Trade negotiation revision is invalid')
    }
    const snapshots = revision.contractSnapshots.map(createPlayerContract)
    const playerMovements = revision.movements.flatMap((movement) => movement.asset.kind === 'player' ? [{ movement, playerId: movement.asset.playerId }] : [])
    if (new Set(snapshots.map((contract) => contract.playerId)).size !== snapshots.length
      || playerMovements.length !== snapshots.length || playerMovements.some((movement) =>
        !snapshots.some((contract) => contract.playerId === movement.playerId && contract.teamId === movement.movement.fromTeamId && getPlayerContractStatus(contract, revision.proposedOn) === 'active'))) {
      throw new RangeError('Trade negotiation contract snapshots do not match its player assets')
    }
    return Object.freeze({
      ...revision,
      proposedOn: parseGameDate(revision.proposedOn),
      participantTeamIds: Object.freeze([...revision.participantTeamIds]),
      movements: Object.freeze(revision.movements.map((movement) => Object.freeze({ ...movement, asset: Object.freeze({ ...movement.asset }) }))),
      ...(revision.retainedSalary === undefined ? {} : { retainedSalary: Object.freeze(revision.retainedSalary.map((term) => Object.freeze({ ...term }))) }),
      ...(revision.exceptionUses === undefined ? {} : { exceptionUses: Object.freeze(revision.exceptionUses.map((use) => Object.freeze({ ...use }))) }),
      contractSnapshots: Object.freeze(snapshots),
      proposedByActor: freezeActor(revision.proposedByActor),
    })
  })
  if (revisions[revisions.length - 1]!.id !== input.currentRevisionId) throw new RangeError('Trade negotiation current revision is invalid')
  const actions = input.actions.map((action) => {
    if (!action.id.trim() || action.negotiationId !== input.id || !participants.has(action.teamId)
      || !revisions.some((revision) => revision.id === action.revisionId)
      || (action.respondedToRevisionId !== undefined && !revisions.some((revision) => revision.id === action.respondedToRevisionId))) {
      throw new RangeError('Trade negotiation action is invalid')
    }
    return Object.freeze({ ...action, actedOn: parseGameDate(action.actedOn), actor: freezeActor(action.actor) })
  })
  if (new Set(revisions.map((revision) => revision.id)).size !== revisions.length || new Set(actions.map((action) => action.id)).size !== actions.length) {
    throw new RangeError('Trade negotiation history contains duplicate identities')
  }
  const initialProposalAction = actions.find((action) => action.kind === 'PROPOSE')
  if (initialProposalAction === undefined || initialProposalAction.revisionId !== revisions[0]!.id || initialProposalAction.teamId !== input.initiatingTeamId
    || revisions[0]!.proposedByTeamId !== input.initiatingTeamId || !sameActor(initialProposalAction.actor, revisions[0]!.proposedByActor)) {
    throw new RangeError('Trade negotiation must retain its initial proposal action')
  }
  if (actions.filter((action) => action.kind === 'PROPOSE').length !== 1
    || revisions.some((revision, index) => index > 0 && (revision.proposedByTeamId === revisions[index - 1]!.proposedByTeamId || actions.filter((action) => action.kind === 'COUNTER'
      && action.revisionId === revision.id && action.respondedToRevisionId === revisions[index - 1]!.id
      && action.teamId === revision.proposedByTeamId && sameActor(action.actor, revision.proposedByActor)).length !== 1))) {
    throw new RangeError('Trade negotiation revisions must retain their proposal or counter actions')
  }
  if (actions.some((action) => action.kind === 'COUNTER' && !revisions.some((revision, index) => index > 0
    && revision.id === action.revisionId && revisions[index - 1]!.id === action.respondedToRevisionId))) {
    throw new RangeError('Trade negotiation counter action does not match a package revision')
  }
  const decisions = actions.filter((action) => action.kind === 'ACCEPT' || action.kind === 'REJECT')
  if (new Set(decisions.map((action) => `${action.revisionId}:${action.teamId}`)).size !== decisions.length) {
    throw new RangeError('A team may make only one decision on a package revision')
  }
  const currentActions = actions.filter((action) => action.revisionId === input.currentRevisionId)
  const currentAcceptedTeams = new Set(currentActions.filter((action) => action.kind === 'ACCEPT').map((action) => action.teamId))
  const everyParticipantAccepted = [...participants].every((teamId) => currentAcceptedTeams.has(teamId))
  const currentRejections = currentActions.filter((action) => action.kind === 'REJECT')
  const currentWithdrawals = currentActions.filter((action) => action.kind === 'WITHDRAW')
  if (input.status === 'AGREED' && !everyParticipantAccepted) throw new RangeError('An agreed trade negotiation requires every participant to accept the current revision')
  if (input.status === 'EXECUTED' && (!everyParticipantAccepted || input.completedOn === undefined || input.tradeRecordId === undefined
    || input.governanceDecisionIdsByTeamId === undefined || participants.size !== Object.keys(input.governanceDecisionIdsByTeamId).length
    || [...participants].some((teamId) => !input.governanceDecisionIdsByTeamId![teamId]))) throw new RangeError('An executed trade negotiation requires complete execution provenance')
  if (input.status !== 'EXECUTED' && (input.completedOn !== undefined || input.tradeRecordId !== undefined || input.governanceDecisionIdsByTeamId !== undefined)) throw new RangeError('Only an executed negotiation may contain completion provenance')
  if (everyParticipantAccepted && input.status !== 'AGREED' && input.status !== 'EXECUTED') throw new RangeError('A fully accepted current revision must be agreed')
  if (input.status === 'REJECTED' && (currentRejections.length !== 1 || currentRejections[0]!.teamId === revisions[revisions.length - 1]!.proposedByTeamId)) throw new RangeError('A rejected trade negotiation requires a current counterparty rejection action')
  if (input.status !== 'REJECTED' && currentRejections.length > 0) throw new RangeError('A current rejection must end the negotiation')
  if (input.status === 'WITHDRAWN' && (currentWithdrawals.length !== 1 || currentWithdrawals[0]!.teamId !== revisions[revisions.length - 1]!.proposedByTeamId)) throw new RangeError('A withdrawn trade negotiation requires a current proposer withdrawal action')
  if (input.status !== 'WITHDRAWN' && currentWithdrawals.length > 0) throw new RangeError('A current withdrawal must end the negotiation')
  if (input.status === 'PROPOSED' && revisions.length !== 1
    || input.status === 'COUNTERED' && (revisions.length < 2 || actions.some((action) => action.revisionId === input.currentRevisionId && (action.kind === 'REJECT' || action.kind === 'WITHDRAW')))) {
    throw new RangeError('Trade negotiation status does not match its current revision history')
  }
  return Object.freeze({ ...input, startedOn: parseGameDate(input.startedOn), ...(input.completedOn === undefined ? {} : { completedOn: parseGameDate(input.completedOn) }), ...(input.governanceDecisionIdsByTeamId === undefined ? {} : { governanceDecisionIdsByTeamId: Object.freeze({ ...input.governanceDecisionIdsByTeamId }) }), participantTeamIds: Object.freeze([...input.participantTeamIds]), revisions: Object.freeze(revisions), actions: Object.freeze(actions) })
}

function freezeActor(actor: TradeNegotiationActor): TradeNegotiationActor {
  if (actor.kind === 'USER') return Object.freeze({ kind: 'USER' })
  if (actor.kind === 'STAFF' && actor.staffPersonId.trim()) return Object.freeze({ ...actor })
  throw new RangeError('Trade negotiation actor is invalid')
}

function sameActor(left: TradeNegotiationActor, right: TradeNegotiationActor): boolean {
  return left.kind === right.kind && (left.kind === 'USER' || right.kind === 'STAFF' && left.staffPersonId === right.staffPersonId)
}
