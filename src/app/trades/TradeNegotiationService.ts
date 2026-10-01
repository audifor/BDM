import { getPlayerContractStatus, createPlayerContract, type PlayerContract } from '@/domain/contract'
import type { GameDate } from '@/domain/date'
import { validateResponsibilityAssignment } from '@/domain/responsibility'
import { createTradeNegotiation, type TradeNegotiation, type TradeNegotiationAction, type TradeNegotiationActor, type TradeNegotiationRevision } from '@/domain/trade'
import type { TeamId } from '@/domain/ids'
import type { TradeAssetMovement, TradeProposal } from '@/domain/trade'
import { getStaffAssignment, getStaffPerson, getResponsibility, updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getTradeWindowStatus, validateTrade } from '@/engine/trade'

export type TradeNegotiationCommandStatus = 'PROPOSED' | 'ALREADY_PROPOSED' | 'COUNTERED' | 'ACCEPTED' | 'ALREADY_APPLIED' | 'AGREED' | 'EXECUTED' | 'REJECTED' | 'WITHDRAWN' | 'BLOCKED' | 'NOT_AUTHORIZED' | 'STALE' | 'CONFLICT'
export type TradeNegotiationResponseKind = 'ACCEPT' | 'REJECT' | 'COUNTER' | 'WITHDRAW'

export interface TradeNegotiationCommandResult {
  readonly status: TradeNegotiationCommandStatus
  readonly world: GameWorld
  readonly negotiation?: TradeNegotiation
  readonly reasons?: readonly string[]
}

export interface TradeNegotiationActionRequest {
  readonly negotiationId: string
  readonly expectedRevisionId: string
  readonly teamId: TeamId
  readonly actor: TradeNegotiationActor
  readonly action: TradeNegotiationResponseKind
  readonly counterPackage?: TradeProposal
}

export interface TradeNegotiationReadiness {
  readonly status: 'READY' | 'BLOCKED' | 'MORE_INFORMATION_REQUIRED'
  readonly reasons: readonly string[]
}

/** Starts a nonbinding discussion from a current, live-validated package. */
export function proposeTradeNegotiation(world: GameWorld, proposal: TradeProposal, initiatingTeamId: TeamId, actor: TradeNegotiationActor, pursuitId?: string): TradeNegotiationCommandResult {
  if (!proposal.participantTeamIds.includes(initiatingTeamId)) return blocked(world, 'INITIATING_TEAM_NOT_IN_PACKAGE')
  if (proposal.participantTeamIds.length !== 2) return blocked(world, 'INITIAL_APPLICATION_SUPPORTS_TWO_TEAMS')
  const authority = resolveTradeNegotiationActor(world, initiatingTeamId, actor)
  if (!authority) return { status: 'NOT_AUTHORIZED', world, reasons: ['NEGOTIATE_PLAYER_TRADE_AUTHORITY_REQUIRED'] }
  const reasons = packageBlockers(world, proposal)
  if (reasons.length > 0) return { status: 'BLOCKED', world, reasons }

  const actualPursuitId = pursuitId ?? derivePursuitId(proposal, initiatingTeamId)
  const packageId = packageIdentity(world, proposal)
  const parties = [...proposal.participantTeamIds].sort()
  const previous = Object.values(world.tradeNegotiationsById).filter((item) => item.pursuitId === actualPursuitId && sameIds(item.participantTeamIds, parties))
  const exact = previous.find((item) => item.initiatingTeamId === initiatingTeamId && item.revisions[0]?.packageId === packageId)
  if (exact !== undefined) return { status: 'ALREADY_PROPOSED', world, negotiation: exact }
  if (previous.some((item) => item.status === 'PROPOSED' || item.status === 'COUNTERED')) return { status: 'CONFLICT', world, negotiation: previous.find((item) => item.status === 'PROPOSED' || item.status === 'COUNTERED'), reasons: ['PURSUIT_ALREADY_HAS_AN_ACTIVE_NEGOTIATION'] }

  const id = `trade-negotiation:${encodeURIComponent(actualPursuitId)}:${parties.map(encodeURIComponent).join(':')}:${initiatingTeamId}:${previous.length}`
  const revision = createRevision(world, proposal, id, 0, packageId, initiatingTeamId, actor)
  const action = createAction(id, 'PROPOSE', revision.id, undefined, initiatingTeamId, actor, world.currentDate)
  const negotiation = createTradeNegotiation({ id, pursuitId: actualPursuitId, ecosystemId: proposal.ecosystemId, seasonId: proposal.seasonId, initiatingTeamId, participantTeamIds: parties, status: 'PROPOSED', currentRevisionId: revision.id, revisions: [revision], actions: [action], startedOn: world.currentDate })
  const next = updateGameWorld(world, { tradeNegotiations: [...Object.values(world.tradeNegotiationsById), negotiation] })
  return { status: 'PROPOSED', world: next, negotiation }
}

/** Applies one explicitly authorized club action to the exact current revision; it never executes assets. */
export function respondToTradeNegotiation(world: GameWorld, request: TradeNegotiationActionRequest): TradeNegotiationCommandResult {
  const negotiation = world.tradeNegotiationsById[request.negotiationId]
  if (negotiation === undefined || !negotiation.participantTeamIds.includes(request.teamId)) return { status: 'CONFLICT', world, reasons: ['NEGOTIATION_OR_PARTICIPANT_NOT_FOUND'] }
  if (!resolveTradeNegotiationActor(world, request.teamId, request.actor)) return { status: 'NOT_AUTHORIZED', world, negotiation, reasons: ['ACTOR_IS_NOT_AUTHORIZED_FOR_THIS_TEAM'] }
  const identity = actionIdentity(negotiation.id, request.expectedRevisionId, request.teamId, request.action)
  const prior = negotiation.actions.find((action) => action.id === identity)
  if (prior !== undefined) {
    const priorRevision = negotiation.revisions.find((revision) => revision.id === prior.revisionId)
    const sameActor = sameNegotiationActor(prior.actor, request.actor)
    const sameCounter = request.action !== 'COUNTER' || request.counterPackage !== undefined && priorRevision !== undefined && samePackageContents(negotiation, priorRevision, request.counterPackage)
    return sameActor && sameCounter ? { status: 'ALREADY_APPLIED', world, negotiation } : { status: 'CONFLICT', world, negotiation, reasons: ['RETRY_CONTENT_DIFFERS_FROM_RECORDED_ACTION'] }
  }
  if (negotiation.currentRevisionId !== request.expectedRevisionId) return { status: 'STALE', world, negotiation, reasons: ['EXPECTED_REVISION_IS_NOT_CURRENT'] }
  if (['AGREED', 'EXECUTED', 'REJECTED', 'WITHDRAWN'].includes(negotiation.status)) return { status: 'CONFLICT', world, negotiation, reasons: ['NEGOTIATION_IS_TERMINAL'] }
  const revision = negotiation.revisions[negotiation.revisions.length - 1]!
  if (request.action === 'WITHDRAW') {
    if (revision.proposedByTeamId !== request.teamId) return { status: 'NOT_AUTHORIZED', world, negotiation, reasons: ['ONLY_THE_CURRENT_PROPOSER_MAY_WITHDRAW'] }
    return appendAction(world, negotiation, createAction(negotiation.id, 'WITHDRAW', revision.id, undefined, request.teamId, request.actor, world.currentDate), 'WITHDRAWN')
  }
  const readiness = validateStoredRevision(world, negotiation, revision)
  if (readiness.length > 0) return { status: 'BLOCKED', world, negotiation, reasons: readiness }
  const priorDecision = negotiation.actions.find((action) => action.revisionId === revision.id && action.teamId === request.teamId && ['ACCEPT', 'REJECT'].includes(action.kind))
  if (priorDecision !== undefined) return { status: 'CONFLICT', world, negotiation, reasons: ['TEAM_ALREADY_RESPONDED_TO_CURRENT_REVISION'] }

  if (request.action === 'COUNTER') {
    if (request.counterPackage === undefined) return { status: 'BLOCKED', world, negotiation, reasons: ['COUNTER_PACKAGE_REQUIRED'] }
    if (revision.proposedByTeamId === request.teamId) return { status: 'NOT_AUTHORIZED', world, negotiation, reasons: ['ONLY_THE_COUNTERPARTY_MAY_COUNTER_CURRENT_REVISION'] }
    if (!sameIds(request.counterPackage.participantTeamIds, negotiation.participantTeamIds)) return { status: 'BLOCKED', world, negotiation, reasons: ['COUNTER_PARTICIPANTS_MUST_MATCH'] }
    const counterReasons = packageBlockers(world, request.counterPackage)
    if (counterReasons.length > 0) return { status: 'BLOCKED', world, negotiation, reasons: counterReasons }
    const packageId = packageIdentity(world, request.counterPackage)
    const counter = createRevision(world, request.counterPackage, negotiation.id, revision.revisionNumber + 1, packageId, request.teamId, request.actor)
    const action = createAction(negotiation.id, 'COUNTER', counter.id, revision.id, request.teamId, request.actor, world.currentDate)
    const nextNegotiation = createTradeNegotiation({ ...negotiation, status: 'COUNTERED', currentRevisionId: counter.id, revisions: [...negotiation.revisions, counter], actions: [...negotiation.actions, action] })
    const next = updateGameWorld(world, { tradeNegotiations: [...Object.values(world.tradeNegotiationsById).filter((item) => item.id !== negotiation.id), nextNegotiation] })
    return { status: 'COUNTERED', world: next, negotiation: nextNegotiation }
  }

  if (request.action === 'REJECT') {
    if (revision.proposedByTeamId === request.teamId) return { status: 'NOT_AUTHORIZED', world, negotiation, reasons: ['PROPOSER_MAY_WITHDRAW_INSTEAD_OF_REJECTING_OWN_PACKAGE'] }
    return appendAction(world, negotiation, createAction(negotiation.id, 'REJECT', revision.id, undefined, request.teamId, request.actor, world.currentDate), 'REJECTED')
  }
  const action = createAction(negotiation.id, 'ACCEPT', revision.id, undefined, request.teamId, request.actor, world.currentDate)
  const acceptedTeams = new Set([...negotiation.actions.filter((item) => item.revisionId === revision.id && item.kind === 'ACCEPT').map((item) => item.teamId), request.teamId])
  const agreed = [...negotiation.participantTeamIds].every((teamId) => acceptedTeams.has(teamId))
  return appendAction(world, negotiation, action, agreed ? 'AGREED' : negotiation.status, agreed ? 'AGREED' : 'ACCEPTED')
}

/** AI club responses remain pending until an approved, knowledge-bounded policy exists. */
export function tradeNegotiationResponseReadiness(world: GameWorld, negotiation: TradeNegotiation, teamId: TeamId): TradeNegotiationReadiness {
  if (!negotiation.participantTeamIds.includes(teamId)) return { status: 'BLOCKED', reasons: ['TEAM_IS_NOT_A_PARTICIPANT'] }
  if (getUserTeam(world)?.id !== teamId) return { status: 'MORE_INFORMATION_REQUIRED', reasons: ['NO_DEFENSIBLE_AUTONOMOUS_TRADE_RESPONSE_POLICY'] }
  const revision = negotiation.revisions[negotiation.revisions.length - 1]!
  const reasons = validateStoredRevision(world, negotiation, revision)
  return { status: reasons.length === 0 ? 'READY' : 'BLOCKED', reasons }
}

export function resolveTradeNegotiationActor(world: GameWorld, teamId: TeamId, actor: TradeNegotiationActor): boolean {
  if (actor.kind === 'USER') return getUserTeam(world)?.id === teamId
  const responsibility = getResponsibility(world, teamId, 'negotiatePlayerTrade')
  if (responsibility?.mode !== 'delegated' || responsibility.holderStaffId !== actor.staffPersonId) return false
  const staff = getStaffPerson(world, actor.staffPersonId)
  const assignment = getStaffAssignment(world, actor.staffPersonId)
  if (staff === undefined || assignment === undefined || assignment.teamId !== teamId || assignment.assignedOn > world.currentDate) return false
  return validateResponsibilityAssignment('negotiatePlayerTrade', 'delegated', assignment.role, staff).ok
}

function packageBlockers(world: GameWorld, proposal: TradeProposal): string[] {
  if (proposal.movements.some((movement) => movement.asset.kind === 'cash')) return ['CASH_SETTLEMENT_UNAVAILABLE']
  const season = world.seasons[proposal.seasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const rules = world.tradeRulesBySeasonId[proposal.seasonId]
  if (season === undefined || competition === undefined || world.currentSeasonId !== season.id
    || proposal.ecosystemId !== competition.ecosystemId || rules?.ecosystemId !== proposal.ecosystemId) return ['TRADE_SEASON_OR_ECOSYSTEM_UNAVAILABLE']
  const eligibleTeams = new Set(season.participantTeamIds?.length ? season.participantTeamIds : competition.participantTeamIds)
  if (proposal.participantTeamIds.some((teamId) => !eligibleTeams.has(teamId))) return ['TRADE_PARTICIPANT_OUTSIDE_SEASON']
  const window = getTradeWindowStatus(world, proposal)
  if (window === 'NOT_CONFIGURED') return ['TRADE_WINDOW_NOT_CONFIGURED']
  if (window === 'CLOSED') return ['TRADE_WINDOW_CLOSED']
  const validation = validateTrade(world, proposal)
  return validation.allowed ? [] : [...validation.globalReasons, ...validation.teamResults.flatMap((result) => result.reasons)]
}

function validateStoredRevision(world: GameWorld, negotiation: TradeNegotiation, revision: TradeNegotiationRevision): string[] {
  const reasons = packageBlockers(world, { id: revision.id, ecosystemId: negotiation.ecosystemId as TradeProposal['ecosystemId'], seasonId: negotiation.seasonId as TradeProposal['seasonId'], participantTeamIds: revision.participantTeamIds, movements: revision.movements, ...(revision.retainedSalary === undefined ? {} : { retainedSalary: revision.retainedSalary }), ...(revision.exceptionUses === undefined ? {} : { exceptionUses: revision.exceptionUses }) })
  if (reasons.length > 0) return reasons
  for (const snapshot of revision.contractSnapshots) {
    const current = world.contractsById[snapshot.id]
    if (current === undefined || getPlayerContractStatus(current, world.currentDate) !== 'active' || stableJson(createPlayerContract(current)) !== stableJson(snapshot)) return ['PLAYER_CONTRACT_CHANGED']
  }
  return []
}

function createRevision(world: GameWorld, proposal: TradeProposal, negotiationId: string, revisionNumber: number, packageId: string, proposedByTeamId: TeamId, actor: TradeNegotiationActor): TradeNegotiationRevision {
  const snapshots = proposal.movements.flatMap((movement) => {
    if (movement.asset.kind !== 'player') return []
    const playerId = movement.asset.playerId
    return Object.values(world.contractsById).filter((contract) => contract.playerId === playerId && contract.teamId === movement.fromTeamId && getPlayerContractStatus(contract, world.currentDate) === 'active').map(createPlayerContract)
  })
  return Object.freeze({ id: `trade-revision:${encodeURIComponent(negotiationId)}:${revisionNumber}`, revisionNumber, packageId, participantTeamIds: Object.freeze([...proposal.participantTeamIds]), movements: Object.freeze(proposal.movements.map((movement) => Object.freeze({ ...movement, asset: Object.freeze({ ...movement.asset }) }))), ...(proposal.retainedSalary === undefined ? {} : { retainedSalary: Object.freeze(proposal.retainedSalary.map((term) => Object.freeze({ ...term }))) }), ...(proposal.exceptionUses === undefined ? {} : { exceptionUses: Object.freeze(proposal.exceptionUses.map((use) => Object.freeze({ ...use }))) }), contractSnapshots: Object.freeze(snapshots), proposedByTeamId, proposedByActor: actor, proposedOn: world.currentDate })
}

function createAction(negotiationId: string, kind: TradeNegotiationAction['kind'], revisionId: string, respondedToRevisionId: string | undefined, teamId: TeamId, actor: TradeNegotiationActor, actedOn: GameDate): TradeNegotiationAction {
  return Object.freeze({ id: actionIdentity(negotiationId, respondedToRevisionId ?? revisionId, teamId, kind), negotiationId, kind, revisionId, ...(respondedToRevisionId === undefined ? {} : { respondedToRevisionId }), teamId, actor, actedOn })
}

function actionIdentity(negotiationId: string, revisionId: string, teamId: TeamId, action: TradeNegotiationResponseKind | TradeNegotiationAction['kind']): string {
  return `trade-action:${encodeURIComponent(negotiationId)}:${encodeURIComponent(revisionId)}:${teamId}:${action}`
}

function appendAction(world: GameWorld, negotiation: TradeNegotiation, action: TradeNegotiationAction, status: TradeNegotiation['status'], resultStatus: TradeNegotiationCommandStatus = status): TradeNegotiationCommandResult {
  const updated = createTradeNegotiation({ ...negotiation, status, actions: [...negotiation.actions, action] })
  const next = updateGameWorld(world, { tradeNegotiations: [...Object.values(world.tradeNegotiationsById).filter((item) => item.id !== negotiation.id), updated] })
  return { status: resultStatus, world: next, negotiation: updated }
}

function packageIdentity(world: GameWorld, proposal: TradeProposal): string {
  const movements = [...proposal.movements].sort((a, b) => movementKey(a).localeCompare(movementKey(b)))
  const contractSnapshots = movements.flatMap((movement) => {
    if (movement.asset.kind !== 'player') return []
    const playerId = movement.asset.playerId
    return Object.values(world.contractsById).filter((contract) => contract.playerId === playerId && contract.teamId === movement.fromTeamId && getPlayerContractStatus(contract, world.currentDate) === 'active').sort((a, b) => a.id.localeCompare(b.id)).map(createPlayerContract)
  })
  const facts = { ecosystemId: proposal.ecosystemId, seasonId: proposal.seasonId, participantTeamIds: [...proposal.participantTeamIds].sort(), movements, retainedSalary: [...(proposal.retainedSalary ?? [])].sort((a, b) => `${a.playerId}:${a.retainingTeamId}:${a.receivingTeamId}`.localeCompare(`${b.playerId}:${b.retainingTeamId}:${b.receivingTeamId}`)), exceptionUses: [...(proposal.exceptionUses ?? [])].sort((a, b) => `${a.teamId}:${a.exceptionId}`.localeCompare(`${b.teamId}:${b.exceptionId}`)), contractSnapshots }
  return `trade-package:${encodeURIComponent(stableJson(facts))}`
}

function derivePursuitId(proposal: TradeProposal, initiatingTeamId: TeamId): string {
  const counterparties = proposal.participantTeamIds.filter((teamId) => teamId !== initiatingTeamId).sort()
  const incoming = proposal.movements.filter((movement) => movement.toTeamId === initiatingTeamId && movement.asset.kind === 'player').map((movement) => movement.asset.kind === 'player' ? movement.asset.playerId : '').sort()[0]
  const target = incoming ?? `package:${packageIdWithoutWorld(proposal)}`
  return `trade-pursuit:${initiatingTeamId}:${counterparties.join(',')}:${target}`
}

function packageIdWithoutWorld(proposal: TradeProposal): string { return encodeURIComponent(stableJson({ ecosystemId: proposal.ecosystemId, seasonId: proposal.seasonId, participantTeamIds: [...proposal.participantTeamIds].sort(), movements: [...proposal.movements].sort((a, b) => movementKey(a).localeCompare(movementKey(b))), retainedSalary: proposal.retainedSalary ?? [], exceptionUses: proposal.exceptionUses ?? [] })) }
function movementKey(movement: TradeAssetMovement): string { return `${movement.fromTeamId}:${movement.toTeamId}:${movement.asset.kind}:${'playerId' in movement.asset ? movement.asset.playerId : 'draftPickId' in movement.asset ? movement.asset.draftPickId : 'futureDraftPickRightId' in movement.asset ? movement.asset.futureDraftPickRightId : 'playerRightsId' in movement.asset ? movement.asset.playerRightsId : 'draftPickSwapRightId' in movement.asset ? movement.asset.draftPickSwapRightId : 'amount' in movement.asset ? movement.asset.amount : ''}` }
function samePackageContents(negotiation: TradeNegotiation, revision: TradeNegotiationRevision, proposal: TradeProposal): boolean {
  return stableJson({ ecosystemId: negotiation.ecosystemId, seasonId: negotiation.seasonId, participantTeamIds: [...revision.participantTeamIds].sort(), movements: [...revision.movements].sort((a, b) => movementKey(a).localeCompare(movementKey(b))), retainedSalary: revision.retainedSalary ?? [], exceptionUses: revision.exceptionUses ?? [] })
    === stableJson({ ecosystemId: proposal.ecosystemId, seasonId: proposal.seasonId, participantTeamIds: [...proposal.participantTeamIds].sort(), movements: [...proposal.movements].sort((a, b) => movementKey(a).localeCompare(movementKey(b))), retainedSalary: proposal.retainedSalary ?? [], exceptionUses: proposal.exceptionUses ?? [] })
}
function sameNegotiationActor(left: TradeNegotiationActor, right: TradeNegotiationActor): boolean { return left.kind === right.kind && (left.kind === 'USER' || right.kind === 'STAFF' && left.staffPersonId === right.staffPersonId) }
function sameIds(a: readonly string[], b: readonly string[]): boolean { const sortedA = [...a].sort(); const sortedB = [...b].sort(); return sortedA.length === sortedB.length && sortedA.every((value, index) => value === sortedB[index]) }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value) }
function blocked(world: GameWorld, ...reasons: string[]): TradeNegotiationCommandResult { return { status: 'BLOCKED', world, reasons } }
