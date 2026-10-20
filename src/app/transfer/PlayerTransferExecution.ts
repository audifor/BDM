import { addYears } from '@/domain/date'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import {
  bindTeamContractCapacity,
  contractOwnsCapacityAuthority,
  createAuthorizedEconomicEvent,
  gameplayFinancialBlockReason,
  getOrganizationFinanceAccounts,
  legacyMajorUnitsToMoney,
  processOperatingCostEconomicEvent,
  processRevenueEconomicEvent,
  settlePayable,
  settleReceivable,
} from '@/domain/finance'
import { createGovernanceDecisionEvent } from '@/domain/governance'
import { contractIdFromString, playerTransactionIdFromString, type TeamId } from '@/domain/ids'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { createPlayerTransferNegotiation, type PlayerTransferNegotiation } from '@/domain/transfer'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'
import { resolvePlayerContractSigningGovernance } from '@/app/marketIntelligence/FreeAgentSigningService'
import { resolveSigningExecutionAuthority } from '@/engine/market'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { BDM_TRANSFER_POLICY_V1, sellerContractInForce } from '@/engine/transfer'
import { evaluateTransferFee } from './PlayerTransferFinance'

export type PlayerTransferExecutionStatus =
  | 'EXECUTED'
  | 'ALREADY_EXECUTED'
  | 'NOT_FOUND'
  | 'NOT_AGREED'
  | 'NO_AUTHORITY'
  | 'GOVERNANCE_REQUIRED'
  | 'GOVERNANCE_DENIED'
  | 'CONTRACT_CHANGED'
  | 'INTEGRITY_INVALID'
  | 'ROSTER_MINIMUM'
  | 'FINANCE_REJECTED'
  | 'BLOCKED'

export interface PlayerTransferExecutionResult {
  readonly status: PlayerTransferExecutionStatus
  readonly world: GameWorld
  readonly transfer?: PlayerTransferNegotiation
  readonly reason?: string
}

function refuse(status: PlayerTransferExecutionStatus, world: GameWorld, transfer: PlayerTransferNegotiation | undefined, reason: string): PlayerTransferExecutionResult {
  // A refusal never changes contracts, rosters or money. It is only written down on the negotiation (which stays revisable) when the
  // refusal belongs to the negotiation itself, so the manager can see why nothing moved.
  return { status, world, ...(transfer === undefined ? {} : { transfer }), reason }
}

/**
 * The single, atomic and idempotent executor of a negotiated transfer. Everything is computed on a local copy of the world and the
 * result is returned only if EVERY step held; any refusal returns the untouched input world, so a player can never end up with no
 * club or two contracts, and money can never move in only one of the two clubs.
 *
 * Preconditions (all re-checked at this moment, never trusted from the earlier agreements):
 *   - both agreements stand (selling club + player) and the seller still holds the same contract in force;
 *   - the buyer's Governance authorized the signing and the manager is the signing executor;
 *   - canonical Finance allows the new salary (PLAYER_SALARY) AND the compensation (TRANSFER_FEE, authorization + liquidity);
 *   - the seller keeps its minimum squad.
 *
 * Effects, in one transition: seller contract terminated (`transferred`: its future guaranteed years are no longer the seller's),
 * new buyer contract (the terms agreed with the player, starting today), roster/lineup movement, a `transferred` PlayerTransaction in
 * both clubs' history, an optional RolePromise, the buyer's expense and its payment, the seller's revenue and its collection, and the
 * Governance EXECUTED event. The compensation is one payment from the buyer to the seller: no money is created or destroyed.
 */
export function executePlayerTransfer(world: GameWorld, transferId: string): PlayerTransferExecutionResult {
  const transfer = world.playerTransferNegotiationsById[transferId]
  if (transfer === undefined) return refuse('NOT_FOUND', world, undefined, 'TRANSFER_NOT_FOUND')
  if (transfer.status === 'EXECUTED') return { status: 'ALREADY_EXECUTED', world, transfer }
  if (transfer.status !== 'IN_PROGRESS' || transfer.clubStatus !== 'CLUB_AGREED' || transfer.playerStatus !== 'PLAYER_AGREED'
    || transfer.agreedFee === undefined || transfer.agreedTerms === undefined) return refuse('NOT_AGREED', world, transfer, 'BOTH_THE_CLUBS_AND_THE_PLAYER_MUST_AGREE')

  const buyer = world.teams[transfer.buyerTeamId]
  const seller = world.teams[transfer.sellerTeamId]
  const player = world.players[transfer.playerId]
  if (buyer === undefined || seller === undefined || player === undefined || buyer.organizationId !== transfer.buyerOrganizationId || seller.organizationId !== transfer.sellerOrganizationId) {
    return refuse('INTEGRITY_INVALID', world, transfer, 'CLUBS_OR_PLAYER_NO_LONGER_MATCH_THE_NEGOTIATION')
  }
  const owner = resolveSigningExecutionAuthority(world, buyer.id)
  if (owner.status !== 'AUTHORIZED' || owner.owner.kind !== 'USER' || buyer.coachId !== world.userCoachId) return refuse('NO_AUTHORITY', world, transfer, owner.status === 'BLOCKED' ? owner.reason : 'ONLY_THE_MANAGER_COMPLETES_THE_TRANSFER_OF_HIS_CLUB')

  const sellerContract = sellerContractInForce(world, seller.id, player.id)
  if (sellerContract === undefined || sellerContract.id !== transfer.sellerContractId || getPlayerContractStatus(sellerContract, world.currentDate) !== 'active') {
    return refuse('CONTRACT_CHANGED', world, transfer, 'THE_SELLING_CLUBS_CONTRACT_IS_NO_LONGER_THE_ONE_NEGOTIATED')
  }
  if (assessActiveContractRosterIntegrity(world, player.id) !== 'VALID'
    || Object.values(world.contractsById).filter((item) => item.playerId === player.id && getPlayerContractStatus(item, world.currentDate) === 'active').length !== 1
    || Object.values(world.teams).filter((team) => team.rosterPlayerIds.includes(player.id)).length !== 1) {
    return refuse('INTEGRITY_INVALID', world, transfer, 'ROSTER_AND_CONTRACT_STATE_OF_THE_PLAYER_IS_NOT_UNIQUELY_CONSISTENT')
  }
  if (Object.values(world.contractsById).some((item) => item.predecessorContractId === sellerContract.id || item.id === sellerContract.predecessorContractId && getPlayerContractStatus(item, world.currentDate) === 'scheduled')
    || Object.values(world.contractsById).some((item) => item.playerId === player.id && item.id !== sellerContract.id && getPlayerContractStatus(item, world.currentDate) === 'scheduled')) {
    return refuse('INTEGRITY_INVALID', world, transfer, 'THE_SELLING_CLUB_HAS_A_BINDING_SUCCESSOR_CONTRACT_FOR_THIS_PLAYER')
  }
  if (seller.rosterPlayerIds.length - 1 < BDM_TRANSFER_POLICY_V1.sellerMinimumRosterAfterSale) return refuse('ROSTER_MINIMUM', world, transfer, 'THE_SELLING_CLUB_WOULD_BE_LEFT_BELOW_ITS_MINIMUM_SQUAD')

  const buyerProfile = world.organizationFinancialProfilesById[buyer.organizationId]
  const sellerProfile = world.organizationFinancialProfilesById[seller.organizationId]
  if (buyerProfile === undefined || sellerProfile === undefined || buyerProfile.baseCurrencyCode !== sellerProfile.baseCurrencyCode) return refuse('FINANCE_REJECTED', world, transfer, 'CLUBS_DO_NOT_SHARE_A_FINANCIAL_CURRENCY')
  const currencyCode = buyerProfile.baseCurrencyCode

  const governance = resolvePlayerContractSigningGovernance(world, buyer.id, transfer.id)
  if (governance.status === 'REQUIRES_APPROVAL') return refuse('GOVERNANCE_REQUIRED', world, transfer, governance.reason)
  if (governance.status !== 'AUTHORIZED') return refuse('GOVERNANCE_DENIED', world, transfer, governance.reason)
  const decision = governance.decision

  const buyerContractId = contractIdFromString(`contract:transfer:${transfer.id}`)
  const transactionId = playerTransactionIdFromString(`transaction:transfer:${transfer.id}`)
  const rolePromiseId = `role-promise:signed-transfer:${transfer.id}`
  if (world.contractsById[buyerContractId] !== undefined || world.playerTransactionsById[transactionId] !== undefined || world.rolePromisesById[rolePromiseId] !== undefined) {
    return refuse('INTEGRITY_INVALID', world, transfer, 'TRANSFER_EFFECTS_EXIST_WITHOUT_AN_EXECUTED_NEGOTIATION')
  }

  // Finance — two independent permissions, both re-evaluated now against the current world.
  const terms = transfer.agreedTerms
  const capacity = bindTeamContractCapacity(world, { teamId: buyer.id, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: terms.salary, contractId: String(buyerContractId), effectiveDate: world.currentDate })
  if (!capacity.allowed) return refuse('FINANCE_REJECTED', world, transfer, `SALARY:${gameplayFinancialBlockReason(capacity.decision)}`)
  const fee = evaluateTransferFee(world, buyer.id, transfer.agreedFee, transfer.id)
  if (!fee.allowed) return refuse('FINANCE_REJECTED', world, transfer, `COMPENSATION:${fee.reason ?? 'NOT_AFFORDABLE'}`)

  try {
    let expiresOn
    try { expiresOn = addYears(world.currentDate, terms.years) } catch { return refuse('BLOCKED', world, transfer, 'AGREED_TERM_CANNOT_FORM_VALID_CONTRACT_DATES') }
    const buyerContract = createPlayerContract({
      id: buyerContractId, playerId: player.id, teamId: buyer.id, kind: 'standard',
      term: { startsOn: world.currentDate, expiresOn }, compensation: { annualSalary: terms.salary },
    })
    const closedSellerContract = createPlayerContract({ ...sellerContract, termination: { terminatedOn: world.currentDate, reason: 'transferred' } })
    const transaction = {
      id: transactionId, playerId: player.id, kind: 'transferred' as const, occurredOn: world.currentDate,
      fromTeamId: seller.id, toTeamId: buyer.id, contractId: buyerContractId, sourceTransferId: transfer.id,
    }
    const rolePromise = terms.role === undefined ? undefined : {
      id: rolePromiseId, playerId: player.id, teamOrganizationId: buyer.organizationId, role: terms.role, acceptedOn: world.currentDate, status: 'ACTIVE' as const,
    }
    const lineupsByTeamId = Object.fromEntries(Object.entries(world.lineupsByTeamId).map(([id, lineup]) => [id, clearPlayerFromLineup(lineup, player.id)]))

    // Movement of people and contracts.
    const moved = updateGameWorld(world, {
      contracts: [...Object.values(world.contractsById).map((item) => item.id === sellerContract.id ? closedSellerContract : item), buyerContract],
      teams: Object.values(world.teams).map((team) => team.id === seller.id
        ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== player.id) }
        : team.id === buyer.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, player.id] } : team),
      lineupsByTeamId,
      playerTransactions: [...Object.values(world.playerTransactionsById), transaction],
      ...(rolePromise === undefined ? {} : { rolePromises: [...Object.values(world.rolePromisesById), rolePromise] }),
      financialReservations: [...capacity.reservations],
    })
    if (!contractOwnsCapacityAuthority(moved, { contractId: String(buyerContractId), organizationId: buyer.organizationId })) {
      return refuse('FINANCE_REJECTED', world, transfer, 'CONTRACT_CAPACITY_AUTHORITY_UNAVAILABLE')
    }

    // Money — the same compensation recognised and settled in BOTH ledgers, in the same transition.
    const paid = moveCompensation(moved, transfer, buyer.id, seller.id, currencyCode, transfer.agreedFee)
    if ('failure' in paid) return refuse('FINANCE_REJECTED', world, transfer, paid.failure)

    const executed = createGovernanceDecisionEvent({
      id: `governance-decision-executed:${decision.id}:zzzz:${transfer.id}`, decisionId: decision.id, kind: 'EXECUTED',
      bodyId: governance.executorBodyId, effectiveOn: world.currentDate, authorityGrantIds: governance.executorGrantIds,
    })
    const record: PlayerTransferNegotiation = {
      ...transfer, status: 'EXECUTED', governanceDecisionId: decision.id,
      execution: {
        executedOn: world.currentDate, sellerContractId: sellerContract.id, buyerContractId, transactionId: String(transactionId), governanceDecisionId: decision.id,
        currencyCode: String(currencyCode), feeMinorUnits: paid.feeMinorUnits, financeFactIds: paid.factIds,
      },
    }
    // The EXECUTED event and the executed record are published together: Governance validates that an executed decision has its effect.
    const withRecord = updateGameWorld(paid.world, {
      governanceDecisionEvents: [...Object.values(paid.world.governanceDecisionEventsById), executed],
      playerTransferNegotiations: [...Object.values(paid.world.playerTransferNegotiationsById).filter((item) => item.id !== record.id), createPlayerTransferNegotiation(record)],
    })
    const planned = reviewClubManagementPlanning(reviewClubManagementPlanning(withRecord, buyer.id, 'MATERIAL_ROSTER_CHANGE').world, seller.id, 'MATERIAL_ROSTER_CHANGE').world
    return { status: 'EXECUTED', world: planned, transfer: planned.playerTransferNegotiationsById[transfer.id]! }
  } catch (error) {
    // Any validation failure of the assembled world means the transfer cannot exist as a whole: nothing is published.
    return refuse('BLOCKED', world, transfer, error instanceof Error ? error.message : 'TRANSFER_EXECUTION_REJECTED')
  }
}

function moveCompensation(world: GameWorld, transfer: PlayerTransferNegotiation, buyerTeamId: TeamId, sellerTeamId: TeamId, currencyCode: string, feeMajorUnits: number):
  | { readonly world: GameWorld; readonly feeMinorUnits: number; readonly factIds: readonly string[] }
  | { readonly failure: string } {
  const buyer = world.teams[buyerTeamId]!
  const seller = world.teams[sellerTeamId]!
  const amount = legacyMajorUnitsToMoney(feeMajorUnits, currencyCode)
  const today = world.currentDate
  const buyerAccounts = getOrganizationFinanceAccounts(world, buyer.organizationId, currencyCode)
  const sellerAccounts = getOrganizationFinanceAccounts(world, seller.organizationId, currencyCode)

  const expenseEvent = createAuthorizedEconomicEvent({
    id: `transfer-fee-event:${transfer.id}:buyer`, eventType: 'OPERATING_COST_RECOGNITION', sourceAuthority: 'FUTURE_COST_ENGINE', sourceEntityId: transfer.id,
    organizationId: buyer.organizationId, effectiveOn: today, dueOn: today, amount, provenance: { kind: 'PLAYER_TRANSFER', id: transfer.id },
    idempotencyKey: `transfer-fee:${transfer.id}:buyer`, counterparty: { kind: 'ORGANIZATION', id: String(seller.organizationId), label: seller.name },
    dimensions: { reference: { kind: 'PLAYER_TRANSFER', id: transfer.id } }, teamId: buyer.id, expenseCategory: 'TRANSFER_FEE',
  })
  const expense = processOperatingCostEconomicEvent(world, expenseEvent, { recognize: true, materializeSubledger: true, ledger: { offsetAccountId: buyerAccounts.payableControl.id, resultAccountId: buyerAccounts.expenseOperating.id } })
  if (expense.status !== 'accepted' || expense.recognition === undefined || expense.payable === undefined) return { failure: `COMPENSATION_EXPENSE_REJECTED:${expense.error ?? expense.status}` }
  const payment = settlePayable(expense.world, expense.payable.id, {
    settlementId: `settlement:transfer-fee:${transfer.id}:buyer`, transactionId: `financial:transfer-fee:${transfer.id}:buyer:payment`, amount, settledOn: today,
    cashAccountId: buyerAccounts.cashOperating.id, offsetAccountId: buyerAccounts.payableControl.id,
  })

  const revenueEvent = createAuthorizedEconomicEvent({
    id: `transfer-fee-event:${transfer.id}:seller`, eventType: 'REVENUE_SOURCE_RECOGNITION', sourceAuthority: 'FUTURE_REVENUE_ENGINE', sourceEntityId: transfer.id,
    organizationId: seller.organizationId, effectiveOn: today, dueOn: today, amount, provenance: { kind: 'PLAYER_TRANSFER', id: transfer.id },
    idempotencyKey: `transfer-fee:${transfer.id}:seller`, counterparty: { kind: 'ORGANIZATION', id: String(buyer.organizationId), label: buyer.name },
    dimensions: { reference: { kind: 'PLAYER_TRANSFER', id: transfer.id } }, teamId: seller.id, revenueCategory: 'TRANSFER_BUYOUT',
  })
  const withPayment = updateGameWorld(expense.world, {
    financialTransactions: [...Object.values(expense.world.financialTransactionsById), payment.transaction],
    treasuryApplications: [...Object.values(expense.world.treasuryApplicationsById), payment.settlement],
  })
  const revenue = processRevenueEconomicEvent(withPayment, revenueEvent, { recognize: true, materializeSubledger: true, ledger: { offsetAccountId: sellerAccounts.receivableControl.id, resultAccountId: sellerAccounts.revenueOperating.id } })
  if (revenue.status !== 'accepted' || revenue.recognition === undefined || revenue.receivable === undefined) return { failure: `COMPENSATION_REVENUE_REJECTED:${revenue.error ?? revenue.status}` }
  const collection = settleReceivable(revenue.world, revenue.receivable.id, {
    settlementId: `settlement:transfer-fee:${transfer.id}:seller`, transactionId: `financial:transfer-fee:${transfer.id}:seller:collection`, amount, settledOn: today,
    cashAccountId: sellerAccounts.cashOperating.id, offsetAccountId: sellerAccounts.receivableControl.id,
  })
  const settled = updateGameWorld(revenue.world, {
    financialTransactions: [...Object.values(revenue.world.financialTransactionsById), collection.transaction],
    treasuryApplications: [...Object.values(revenue.world.treasuryApplicationsById), collection.settlement],
  })
  return {
    world: settled,
    feeMinorUnits: amount.minorUnits,
    factIds: [String(expense.recognition.id), String(payment.settlement.id), String(payment.transaction.id), String(revenue.recognition.id), String(collection.settlement.id), String(collection.transaction.id)],
  }
}
