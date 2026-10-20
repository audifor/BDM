import type { GameDate } from '@/domain/date'
import { evaluateTeamGameplayFinancialDecision, gameplayFinancialBlockReason } from '@/domain/finance'
import type { PlayerId, TeamId } from '@/domain/ids'
import { isActiveNegotiation } from '@/domain/market'
import {
  currentClubRound,
  currentPlayerRound,
  isActiveTransfer,
  playerTransferId,
  type PlayerTransferNegotiation,
  type TransferPlayerTerms,
} from '@/domain/transfer'
import type { GameWorld } from '@/domain/world'
import { replaceTransfer, sellerContractInForce } from '@/engine/transfer'
import { ensureTransferPlayerContractSigningDecision, type PlayerContractSigningWorkflowResult } from '@/app/governance/PlayerContractSigningGovernanceService'
import { evaluateTransferFee } from './PlayerTransferFinance'

export type TransferCommandStatus =
  | 'APPLIED'
  | 'ALREADY_APPLIED'
  | 'NOT_FOUND'
  | 'NO_AUTHORITY'
  | 'PLAYER_NOT_CONTRACTED'
  | 'OWN_PLAYER'
  | 'ACTIVE_NEGOTIATION_EXISTS'
  | 'FINANCIAL_BLOCK'
  | 'LIFECYCLE_CONFLICT'
  | 'INVALID_TERMS'
  | 'BLOCKED'

export interface TransferCommandResult {
  readonly status: TransferCommandStatus
  readonly world: GameWorld
  readonly transfer?: PlayerTransferNegotiation
  readonly reason?: string
}

function done(world: GameWorld, transfer: PlayerTransferNegotiation): TransferCommandResult {
  return { status: 'APPLIED', world: replaceTransfer(world, transfer), transfer }
}

function refused(status: TransferCommandStatus, world: GameWorld, reason: string, transfer?: PlayerTransferNegotiation): TransferCommandResult {
  return { status, world, reason, ...(transfer === undefined ? {} : { transfer }) }
}

function userBuyerTeam(world: GameWorld, teamId: TeamId) {
  const team = world.teams[teamId]
  return team !== undefined && team.coachId === world.userCoachId ? team : undefined
}

function validFee(fee: number): boolean {
  return Number.isSafeInteger(fee) && fee >= 1 && fee <= 100_000_000
}

function validTerms(terms: TransferPlayerTerms): boolean {
  return Number.isSafeInteger(terms.salary) && terms.salary >= 1 && terms.salary <= 100_000_000 && Number.isSafeInteger(terms.years) && terms.years >= 1 && terms.years <= 10
}

/** The one transfer in flight for this buyer and player, if any. */
export function activeTransferFor(world: GameWorld, buyerTeamId: TeamId, playerId: PlayerId): PlayerTransferNegotiation | undefined {
  return Object.values(world.playerTransferNegotiationsById).find((item) => item.buyerTeamId === buyerTeamId && item.playerId === playerId && isActiveTransfer(item))
}

function ownTransfer(world: GameWorld, teamId: TeamId, transferId: string): { readonly transfer: PlayerTransferNegotiation } | { readonly failure: TransferCommandResult } {
  const transfer = world.playerTransferNegotiationsById[transferId]
  if (transfer === undefined) return { failure: refused('NOT_FOUND', world, 'TRANSFER_NOT_FOUND') }
  if (userBuyerTeam(world, teamId) === undefined || transfer.buyerTeamId !== teamId) return { failure: refused('NO_AUTHORITY', world, 'ONLY_THE_BUYING_CLUB_MANAGER_CAN_DECIDE', transfer) }
  return { transfer }
}

function salaryBlock(world: GameWorld, teamId: TeamId, salary: number, sourceEntityId: string): string | null {
  const decision = evaluateTeamGameplayFinancialDecision(world, { teamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: salary, effectiveDate: world.currentDate, sourceAuthority: 'PLAYER_TRANSFER', sourceEntityId })
  return decision.allowed ? null : gameplayFinancialBlockReason(decision)
}

/**
 * Step 1 — contact the owner club with a compensation proposal for a contracted player. Never a free-agent signing: a player with a
 * contract is only reachable through the club that holds it. The seller answers from the next day (BDM_TRANSFER_POLICY_V1).
 */
export function proposeTransferCompensation(world: GameWorld, input: { readonly buyerTeamId: TeamId; readonly playerId: PlayerId; readonly fee: number }): TransferCommandResult {
  const buyer = userBuyerTeam(world, input.buyerTeamId)
  if (buyer === undefined) return refused('NO_AUTHORITY', world, 'ONLY_THE_MANAGERS_CLUB_CAN_BUY')
  if (world.players[input.playerId] === undefined) return refused('NOT_FOUND', world, 'PLAYER_NOT_FOUND')
  const contract = Object.values(world.contractsById).find((item) => item.playerId === input.playerId && world.teams[item.teamId]?.rosterPlayerIds.includes(input.playerId) === true
    && sellerContractInForce(world, item.teamId, input.playerId)?.id === item.id)
  if (contract === undefined) return refused('PLAYER_NOT_CONTRACTED', world, 'PLAYER_HAS_NO_CONTRACT_WITH_A_CLUB')
  if (contract.teamId === buyer.id) return refused('OWN_PLAYER', world, 'PLAYER_ALREADY_BELONGS_TO_YOUR_CLUB')
  const seller = world.teams[contract.teamId]!
  const existing = activeTransferFor(world, buyer.id, input.playerId)
  if (existing !== undefined) return refused('ACTIVE_NEGOTIATION_EXISTS', world, 'A_TRANSFER_NEGOTIATION_IS_ALREADY_OPEN', existing)
  const activeNegotiation = Object.values(world.negotiationsById).some((item) => item.teamId === buyer.id && item.playerId === input.playerId && isActiveNegotiation(item))
  if (activeNegotiation) return refused('ACTIVE_NEGOTIATION_EXISTS', world, 'A_CONTRACT_NEGOTIATION_IS_ALREADY_OPEN')
  if (!validFee(input.fee)) return refused('INVALID_TERMS', world, 'COMPENSATION_MUST_BE_A_POSITIVE_WHOLE_AMOUNT')
  if (String(world.organizationFinancialProfilesById[buyer.organizationId]?.baseCurrencyCode) !== String(world.organizationFinancialProfilesById[seller.organizationId]?.baseCurrencyCode)
    || world.organizationFinancialProfilesById[buyer.organizationId] === undefined) return refused('BLOCKED', world, 'CLUBS_DO_NOT_SHARE_A_FINANCIAL_CURRENCY')
  const generation = Object.values(world.playerTransferNegotiationsById).filter((item) => item.buyerTeamId === buyer.id && item.playerId === input.playerId).length
  const id = playerTransferId(buyer.id, input.playerId, generation)
  const feeBlock = evaluateTransferFee(world, buyer.id, input.fee, id)
  if (!feeBlock.allowed) return refused('FINANCIAL_BLOCK', world, feeBlock.reason ?? 'TRANSFER_FEE_NOT_AFFORDABLE')
  const transfer: PlayerTransferNegotiation = {
    id, playerId: input.playerId, sellerTeamId: seller.id, sellerOrganizationId: seller.organizationId, buyerTeamId: buyer.id, buyerOrganizationId: buyer.organizationId,
    sellerContractId: contract.id, openedOn: world.currentDate, status: 'IN_PROGRESS',
    clubStatus: 'AWAITING_CLUB_RESPONSE', clubRounds: [{ round: 1, fee: input.fee, proposedOn: world.currentDate }],
    playerStatus: 'NOT_STARTED', playerRounds: [],
  }
  return done(world, transfer)
}

export type TransferClubCounterAction =
  | { readonly kind: 'ACCEPT_COUNTER' }
  | { readonly kind: 'REVISE'; readonly fee: number }
  | { readonly kind: 'DECLINE' }

/** Step 2 — answer the seller's counter: accept its asking compensation, revise the proposal, or walk away. */
export function respondToTransferClubCounter(world: GameWorld, input: { readonly teamId: TeamId; readonly transferId: string; readonly action: TransferClubCounterAction }): TransferCommandResult {
  const owned = ownTransfer(world, input.teamId, input.transferId)
  if ('failure' in owned) return owned.failure
  const { transfer } = owned
  const round = currentClubRound(transfer)
  if (transfer.status !== 'IN_PROGRESS' || transfer.clubStatus !== 'CLUB_COUNTERED' || round?.response?.counterFee === undefined) {
    if (input.action.kind === 'ACCEPT_COUNTER' && transfer.clubStatus === 'CLUB_AGREED' && transfer.agreedFee === round?.response?.counterFee) return { status: 'ALREADY_APPLIED', world, transfer }
    return refused('LIFECYCLE_CONFLICT', world, 'THERE_IS_NO_OPEN_COUNTER_FROM_THE_SELLING_CLUB', transfer)
  }
  const stamp = { on: world.currentDate }
  if (input.action.kind === 'DECLINE') {
    const rounds = [...transfer.clubRounds.slice(0, -1), { ...round, buyerAction: { kind: 'DECLINED' as const, ...stamp } }]
    return done(world, { ...transfer, clubRounds: rounds, clubStatus: 'WITHDRAWN', status: 'CLOSED', closedOn: world.currentDate, closeReason: 'WITHDRAWN_BY_BUYER' })
  }
  if (input.action.kind === 'ACCEPT_COUNTER') {
    const fee = round.response.counterFee
    const feeBlock = evaluateTransferFee(world, transfer.buyerTeamId, fee, transfer.id)
    if (!feeBlock.allowed) return refused('FINANCIAL_BLOCK', world, feeBlock.reason ?? 'TRANSFER_FEE_NOT_AFFORDABLE', transfer)
    const rounds = [...transfer.clubRounds.slice(0, -1), { ...round, buyerAction: { kind: 'ACCEPTED_COUNTER' as const, ...stamp } }]
    return done(world, { ...transfer, clubRounds: rounds, clubStatus: 'CLUB_AGREED', agreedFee: fee })
  }
  if (!validFee(input.action.fee)) return refused('INVALID_TERMS', world, 'COMPENSATION_MUST_BE_A_POSITIVE_WHOLE_AMOUNT', transfer)
  const feeBlock = evaluateTransferFee(world, transfer.buyerTeamId, input.action.fee, transfer.id)
  if (!feeBlock.allowed) return refused('FINANCIAL_BLOCK', world, feeBlock.reason ?? 'TRANSFER_FEE_NOT_AFFORDABLE', transfer)
  const rounds = [...transfer.clubRounds.slice(0, -1), { ...round, buyerAction: { kind: 'REVISED' as const, ...stamp } }, { round: round.round + 1, fee: input.action.fee, proposedOn: world.currentDate }]
  return done(world, { ...transfer, clubRounds: rounds, clubStatus: 'AWAITING_CLUB_RESPONSE' })
}

/** The buyer may walk away at any point before execution: nothing was moved, nothing is charged. */
export function withdrawPlayerTransfer(world: GameWorld, input: { readonly teamId: TeamId; readonly transferId: string }): TransferCommandResult {
  const owned = ownTransfer(world, input.teamId, input.transferId)
  if ('failure' in owned) return owned.failure
  const { transfer } = owned
  if (transfer.status === 'CLOSED' && transfer.closeReason === 'WITHDRAWN_BY_BUYER') return { status: 'ALREADY_APPLIED', world, transfer }
  if (transfer.status !== 'IN_PROGRESS') return refused('LIFECYCLE_CONFLICT', world, `TRANSFER_IS_${transfer.status}`, transfer)
  return done(world, { ...transfer, clubStatus: transfer.clubStatus === 'CLUB_AGREED' ? transfer.clubStatus : 'WITHDRAWN', status: 'CLOSED', closedOn: world.currentDate, closeReason: 'WITHDRAWN_BY_BUYER' })
}

/**
 * Step 3 — once the clubs agree, negotiate with the player himself. The terms are the manager's own (salary, years, role); the answer
 * comes from the player's real market truth and his agent (the same engine as a free agent's), never from this function.
 */
export function proposeTransferPlayerTerms(world: GameWorld, input: { readonly teamId: TeamId; readonly transferId: string; readonly terms: TransferPlayerTerms }): TransferCommandResult {
  const owned = ownTransfer(world, input.teamId, input.transferId)
  if ('failure' in owned) return owned.failure
  const { transfer } = owned
  if (transfer.status !== 'IN_PROGRESS' || transfer.clubStatus !== 'CLUB_AGREED') return refused('LIFECYCLE_CONFLICT', world, 'THE_CLUBS_HAVE_NOT_AGREED_YET', transfer)
  if (!validTerms(input.terms)) return refused('INVALID_TERMS', world, 'SALARY_AND_YEARS_MUST_BE_POSITIVE_WHOLE_NUMBERS', transfer)
  const previous = currentPlayerRound(transfer)
  if (transfer.playerStatus === 'AWAITING_PLAYER_RESPONSE' || transfer.playerStatus === 'PLAYER_AGREED') {
    const same = previous?.terms.salary === input.terms.salary && previous.terms.years === input.terms.years && previous.terms.role === input.terms.role
    return same ? { status: 'ALREADY_APPLIED', world, transfer } : refused('LIFECYCLE_CONFLICT', world, 'THE_PLAYER_ALREADY_HAS_AN_OFFER_IN_PROGRESS', transfer)
  }
  if (transfer.playerStatus === 'PLAYER_REJECTED') return refused('LIFECYCLE_CONFLICT', world, 'THE_PLAYER_REJECTED_THE_TRANSFER', transfer)
  const block = salaryBlock(world, transfer.buyerTeamId, input.terms.salary, transfer.id)
  if (block !== null) return refused('FINANCIAL_BLOCK', world, block, transfer)
  const terms: TransferPlayerTerms = { salary: input.terms.salary, years: input.terms.years, ...(input.terms.role === undefined ? {} : { role: input.terms.role }) }
  const rounds = previous === undefined ? [] : [...transfer.playerRounds.slice(0, -1), { ...previous, buyerAction: { kind: 'REVISED' as const, on: world.currentDate } }]
  return done(world, { ...transfer, playerStatus: 'AWAITING_PLAYER_RESPONSE', playerRounds: [...rounds, { round: transfer.playerRounds.length + 1, terms, offeredOn: world.currentDate }] })
}

export type TransferPlayerCounterAction =
  | { readonly kind: 'ACCEPT_COUNTER' }
  | { readonly kind: 'REVISE'; readonly terms: TransferPlayerTerms }
  | { readonly kind: 'DECLINE' }

export function respondToTransferPlayerCounter(world: GameWorld, input: { readonly teamId: TeamId; readonly transferId: string; readonly action: TransferPlayerCounterAction }): TransferCommandResult {
  const owned = ownTransfer(world, input.teamId, input.transferId)
  if ('failure' in owned) return owned.failure
  const { transfer } = owned
  const round = currentPlayerRound(transfer)
  if (transfer.status !== 'IN_PROGRESS' || transfer.playerStatus !== 'PLAYER_COUNTERED' || round?.response?.counterTerms === undefined) {
    return refused('LIFECYCLE_CONFLICT', world, 'THERE_IS_NO_OPEN_COUNTER_FROM_THE_PLAYER', transfer)
  }
  if (input.action.kind === 'DECLINE') {
    const rounds = [...transfer.playerRounds.slice(0, -1), { ...round, buyerAction: { kind: 'DECLINED' as const, on: world.currentDate } }]
    return done(world, { ...transfer, playerRounds: rounds, status: 'CLOSED', closedOn: world.currentDate, closeReason: 'WITHDRAWN_BY_BUYER' })
  }
  if (input.action.kind === 'ACCEPT_COUNTER') {
    const terms = round.response.counterTerms
    const block = salaryBlock(world, transfer.buyerTeamId, terms.salary, transfer.id)
    if (block !== null) return refused('FINANCIAL_BLOCK', world, block, transfer)
    const rounds = [...transfer.playerRounds.slice(0, -1), { ...round, buyerAction: { kind: 'ACCEPTED_COUNTER' as const, on: world.currentDate } }]
    return done(world, { ...transfer, playerRounds: rounds, playerStatus: 'PLAYER_AGREED', agreedTerms: terms })
  }
  if (!validTerms(input.action.terms)) return refused('INVALID_TERMS', world, 'SALARY_AND_YEARS_MUST_BE_POSITIVE_WHOLE_NUMBERS', transfer)
  const block = salaryBlock(world, transfer.buyerTeamId, input.action.terms.salary, transfer.id)
  if (block !== null) return refused('FINANCIAL_BLOCK', world, block, transfer)
  const terms: TransferPlayerTerms = { salary: input.action.terms.salary, years: input.action.terms.years, ...(input.action.terms.role === undefined ? {} : { role: input.action.terms.role }) }
  const rounds = [...transfer.playerRounds.slice(0, -1), { ...round, buyerAction: { kind: 'REVISED' as const, on: world.currentDate } }, { round: round.round + 1, terms, offeredOn: world.currentDate }]
  return done(world, { ...transfer, playerStatus: 'AWAITING_PLAYER_RESPONSE', playerRounds: rounds })
}

/** Step 4 — ask the club's Governance to authorize the signing. Requires both agreements; it authorizes nothing by itself. */
export function startTransferGovernance(world: GameWorld, input: { readonly teamId: TeamId; readonly transferId: string; readonly proposerBodyId?: string }): PlayerContractSigningWorkflowResult {
  return ensureTransferPlayerContractSigningDecision(world, { teamId: input.teamId, transferId: input.transferId, initiator: { kind: 'COACH', id: world.userCoachId }, ...(input.proposerBodyId === undefined ? {} : { proposerBodyId: input.proposerBodyId }) })
}

export function transferDate(transfer: PlayerTransferNegotiation): GameDate {
  return transfer.execution?.executedOn ?? transfer.closedOn ?? transfer.openedOn
}
