import type { GameDate } from '@/domain/date'
import type { ContractId, OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { NegotiationRole } from '@/domain/market'

/**
 * A negotiated club-to-club transfer of a CONTRACTED player. It is not an NBA trade (nothing is exchanged) and it is never a free-agent
 * signing: the player has a contract with another club, so three independent agreements are needed before anything moves:
 *
 *   1. the SELLING CLUB agrees a compensation (`fee`, whole major units of the buyer's currency);
 *   2. the PLAYER agrees new terms with the buying club (`salary`, `years`, `role`) — his old salary is not the price and the price is
 *      not his new salary;
 *   3. the buying club's Governance authorizes the signing, and canonical Finance authorizes the salary and the compensation.
 *
 * Offer ≠ payment: only `execution` (written by the single atomic executor) means money and players moved. Money is whole major
 * units here exactly like contract salaries; it crosses into canonical minor-unit Money once, in the executor.
 */
export type TransferClubStatus = 'AWAITING_CLUB_RESPONSE' | 'CLUB_COUNTERED' | 'CLUB_AGREED' | 'CLUB_REJECTED' | 'WITHDRAWN'
export type TransferPlayerStatus = 'NOT_STARTED' | 'AWAITING_PLAYER_RESPONSE' | 'PLAYER_COUNTERED' | 'PLAYER_AGREED' | 'PLAYER_REJECTED'
export type PlayerTransferStatus = 'IN_PROGRESS' | 'EXECUTED' | 'CLOSED'
export type TransferCloseReason =
  | 'CLUB_REJECTED'
  | 'WITHDRAWN_BY_BUYER'
  | 'PLAYER_REJECTED'
  | 'PLAYER_UNAVAILABLE'
  | 'GOVERNANCE_REJECTED'

export type TransferRefusalReason =
  | 'NOT_FOR_SALE_ROSTER_MINIMUM'
  | 'BELOW_ACCEPTABLE_FRACTION'
  | 'CONTRACT_NO_LONGER_HELD'

export interface TransferClubRound {
  readonly round: number
  /** Compensation proposed by the buyer for this round. */
  readonly fee: number
  readonly proposedOn: GameDate
  readonly response?: {
    readonly outcome: 'ACCEPTED' | 'COUNTERED' | 'REJECTED'
    readonly respondedOn: GameDate
    /** Present only when the seller countered: the compensation it is willing to accept. */
    readonly counterFee?: number
    readonly reason?: TransferRefusalReason
  }
  readonly buyerAction?: { readonly kind: 'ACCEPTED_COUNTER' | 'REVISED' | 'DECLINED'; readonly on: GameDate }
}

export interface TransferPlayerTerms {
  readonly salary: number
  readonly years: number
  readonly role?: NegotiationRole
}

export interface TransferPlayerRound {
  readonly round: number
  readonly terms: TransferPlayerTerms
  readonly offeredOn: GameDate
  readonly response?: {
    readonly outcome: 'ACCEPTED' | 'COUNTERED' | 'REJECTED'
    readonly respondedOn: GameDate
    readonly counterTerms?: TransferPlayerTerms
  }
  readonly buyerAction?: { readonly kind: 'ACCEPTED_COUNTER' | 'REVISED' | 'DECLINED'; readonly on: GameDate }
}

export interface PlayerTransferExecution {
  readonly executedOn: GameDate
  readonly sellerContractId: ContractId
  readonly buyerContractId: ContractId
  readonly transactionId: string
  readonly governanceDecisionId: string
  readonly currencyCode: string
  readonly feeMinorUnits: number
  /** Ids of the canonical Finance facts that moved the compensation (buyer expense + payment, seller revenue + collection). */
  readonly financeFactIds: readonly string[]
}

export interface PlayerTransferNegotiation {
  readonly id: string
  readonly playerId: PlayerId
  readonly sellerTeamId: TeamId
  readonly sellerOrganizationId: OrganizationId
  readonly buyerTeamId: TeamId
  readonly buyerOrganizationId: OrganizationId
  /** The seller's contract at the moment the approach started; execution revalidates that it is still the one in force. */
  readonly sellerContractId: ContractId
  readonly openedOn: GameDate
  readonly status: PlayerTransferStatus
  readonly clubStatus: TransferClubStatus
  readonly clubRounds: readonly TransferClubRound[]
  /** Compensation both clubs agreed (the accepted proposal or the accepted counter). */
  readonly agreedFee?: number
  readonly playerStatus: TransferPlayerStatus
  readonly playerRounds: readonly TransferPlayerRound[]
  readonly agreedTerms?: TransferPlayerTerms
  readonly governanceDecisionId?: string
  readonly closedOn?: GameDate
  readonly closeReason?: TransferCloseReason
  readonly execution?: PlayerTransferExecution
}

export function playerTransferId(buyerTeamId: TeamId | string, playerId: PlayerId | string, generation: number): string {
  return `transfer:${encodeURIComponent(String(buyerTeamId))}:${encodeURIComponent(String(playerId))}:${generation}`
}

export function isActiveTransfer(transfer: PlayerTransferNegotiation): boolean {
  return transfer.status === 'IN_PROGRESS'
}

export function currentClubRound(transfer: PlayerTransferNegotiation): TransferClubRound | undefined {
  return transfer.clubRounds[transfer.clubRounds.length - 1]
}

export function currentPlayerRound(transfer: PlayerTransferNegotiation): TransferPlayerRound | undefined {
  return transfer.playerRounds[transfer.playerRounds.length - 1]
}

function positiveInteger(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`)
}

function validateTerms(terms: TransferPlayerTerms, name: string): void {
  positiveInteger(terms.salary, `${name} salary`)
  positiveInteger(terms.years, `${name} years`)
  if (terms.salary > 100_000_000 || terms.years > 10) throw new RangeError(`${name} is out of range`)
}

/** Structural validation of a persisted/new transfer; it owns no rule, it only rejects shapes that could not be explained. */
export function createPlayerTransferNegotiation(input: PlayerTransferNegotiation): PlayerTransferNegotiation {
  if (input.id.trim() === '' || input.sellerTeamId === input.buyerTeamId) throw new TypeError('A transfer needs an identity and two different clubs')
  const clubStatuses: readonly TransferClubStatus[] = ['AWAITING_CLUB_RESPONSE', 'CLUB_COUNTERED', 'CLUB_AGREED', 'CLUB_REJECTED', 'WITHDRAWN']
  const playerStatuses: readonly TransferPlayerStatus[] = ['NOT_STARTED', 'AWAITING_PLAYER_RESPONSE', 'PLAYER_COUNTERED', 'PLAYER_AGREED', 'PLAYER_REJECTED']
  if (!clubStatuses.includes(input.clubStatus) || !playerStatuses.includes(input.playerStatus)) throw new TypeError('Transfer stage status is invalid')
  if (!['IN_PROGRESS', 'EXECUTED', 'CLOSED'].includes(input.status)) throw new TypeError('Transfer status is invalid')
  if (input.clubRounds.length === 0) throw new RangeError('A transfer starts with a compensation proposal')
  input.clubRounds.forEach((round, index) => {
    positiveInteger(round.fee, 'Transfer compensation')
    if (round.round !== index + 1) throw new RangeError('Transfer club rounds must be consecutive')
    if (round.response?.counterFee !== undefined) positiveInteger(round.response.counterFee, 'Transfer counter compensation')
  })
  input.playerRounds.forEach((round, index) => {
    validateTerms(round.terms, 'Transfer player terms')
    if (round.round !== index + 1) throw new RangeError('Transfer player rounds must be consecutive')
    if (round.response?.counterTerms !== undefined) validateTerms(round.response.counterTerms, 'Transfer player counter terms')
  })
  if (input.agreedFee !== undefined) positiveInteger(input.agreedFee, 'Agreed compensation')
  if (input.agreedTerms !== undefined) validateTerms(input.agreedTerms, 'Agreed terms')
  if (input.clubStatus === 'CLUB_AGREED' && input.agreedFee === undefined) throw new TypeError('An agreement between clubs carries its compensation')
  if (input.playerStatus === 'PLAYER_AGREED' && input.agreedTerms === undefined) throw new TypeError('An agreement with the player carries its terms')
  if (input.status === 'EXECUTED' && (input.execution === undefined || input.agreedFee === undefined || input.agreedTerms === undefined)) throw new TypeError('An executed transfer carries its agreements and its execution')
  if (input.status !== 'EXECUTED' && input.execution !== undefined) throw new TypeError('Only an executed transfer carries an execution')
  if (input.status === 'CLOSED' && (input.closeReason === undefined || input.closedOn === undefined)) throw new TypeError('A closed transfer says when and why')
  return Object.freeze(input)
}
