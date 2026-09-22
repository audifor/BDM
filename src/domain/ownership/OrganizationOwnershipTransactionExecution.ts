import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { assertNoBlockingMultiClubImpact } from '@/domain/multiClub/MultiClubConflict'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  createOrganizationOwnershipTransactionEvent,
  deriveOrganizationOwnershipTransactionStatus,
  isOrganizationOwnershipGovernanceApproved,
  sameOrganizationOwnershipActor,
  validateOrganizationOwnershipTransactionLifecycle,
  type OrganizationOwnershipTransaction,
} from './OrganizationOwnershipTransaction'
import { createOrganizationOwnership, getActiveOrganizationOwnership, type OrganizationOwnership } from './OrganizationOwnership'

/** Projects one approved transfer without appending its execution event. */
export function projectOrganizationOwnershipTransactionOwnership(world: GameWorld, transactionId: string, effectiveOn: GameDate | string): readonly OrganizationOwnership[] {
  const transaction = Object.values(world.organizationOwnershipTransactionsById).find((candidate) => candidate.id === transactionId)
  if (transaction === undefined) throw new Error(`Organization ownership transaction does not exist: ${transactionId}`)
  const executionDate = parseGameDate(effectiveOn)
  const events = Object.values(world.organizationOwnershipTransactionEventsById).filter((event) => event.transactionId === transaction.id)
  validateOrganizationOwnershipTransactionLifecycle(events)
  if (deriveOrganizationOwnershipTransactionStatus(events) !== 'APPROVED') throw new Error(`Organization ownership transaction ${transaction.id} is not approved for execution`)
  if (compareGameDates(executionDate, transaction.agreedOn) < 0) throw new RangeError(`Organization ownership transaction ${transaction.id} executes before its agreed date`)
  if (!isOrganizationOwnershipGovernanceApproved(world, transaction, executionDate)) throw new Error(`Organization ownership transaction ${transaction.id} lacks linked Governance approval`)
  return calculateOwnershipAfterTransfer(world, transaction, executionDate)
}

/** Applies one approved economic transfer and records only its immutable execution event. */
export function executeOrganizationOwnershipTransaction(world: GameWorld, transactionId: string, effectiveOn: GameDate | string): GameWorld {
  const transaction = Object.values(world.organizationOwnershipTransactionsById).find((candidate) => candidate.id === transactionId)
  if (transaction === undefined) throw new Error(`Organization ownership transaction does not exist: ${transactionId}`)
  const executionDate = parseGameDate(effectiveOn)
  const nextOwnership = projectOrganizationOwnershipTransactionOwnership(world, transactionId, executionDate)
  const events = Object.values(world.organizationOwnershipTransactionEventsById).filter((event) => event.transactionId === transaction.id)
  const projectedWorld = updateGameWorld(world, { organizationOwnership: nextOwnership })
  assertNoBlockingMultiClubImpact(projectedWorld, transaction.organizationId, executionDate)
  const executionEvent = createOrganizationOwnershipTransactionEvent({
    id: `ownership-transaction:${transaction.id}:executed`,
    transactionId: transaction.id,
    kind: 'EXECUTED',
    effectiveOn: executionDate,
    ...(transaction.governanceDecisionId === undefined ? {} : { governanceDecisionId: transaction.governanceDecisionId }),
  })
  return updateGameWorld(world, {
    organizationOwnership: nextOwnership,
    organizationOwnershipTransactionEvents: [...events, executionEvent],
  })
}

function calculateOwnershipAfterTransfer(world: GameWorld, transaction: OrganizationOwnershipTransaction, executionDate: GameDate): readonly OrganizationOwnership[] {
  const active = getActiveOrganizationOwnership(world, transaction.organizationId, executionDate)
  const sellerRows = active.filter((row) => sameOrganizationOwnershipActor(row.owner, transaction.seller))
  const buyerRows = active.filter((row) => sameOrganizationOwnershipActor(row.owner, transaction.buyer))
  if (sellerRows.length === 0) throw new Error(`Organization ownership transaction ${transaction.id} seller has no active ownership`)
  if (sellerRows.some((row) => row.ownershipPercentage === null)) throw new Error(`Organization ownership transaction ${transaction.id} seller ownership percentage is unknown`)
  if (buyerRows.some((row) => row.ownershipPercentage === null)) throw new Error(`Organization ownership transaction ${transaction.id} buyer ownership percentage is unknown`)
  if ([...sellerRows, ...buyerRows].some((row) => row.validFrom === executionDate)) throw new Error(`Organization ownership transaction ${transaction.id} conflicts with ownership effective on its execution date`)

  const sellerTotal = sellerRows.reduce((sum, row) => sum + (row.ownershipPercentage ?? 0), 0)
  const buyerTotal = buyerRows.reduce((sum, row) => sum + (row.ownershipPercentage ?? 0), 0)
  if (sellerTotal < transaction.transferredPercentage) throw new Error(`Organization ownership transaction ${transaction.id} seller lacks sufficient ownership`)
  if (buyerTotal + transaction.transferredPercentage > 100) throw new RangeError(`Organization ownership transaction ${transaction.id} would exceed 100 percent for the buyer`)

  const affectedRows = new Set([...sellerRows, ...buyerRows].map((row) => row.id))
  const closeDate = addDays(executionDate, -1)
  const nextOwnership = Object.values(world.organizationOwnershipById).map((row) => affectedRows.has(row.id)
    ? createOrganizationOwnership({ ...row, validTo: closeDate })
    : row)
  const sellerRemaining = sellerTotal - transaction.transferredPercentage
  if (sellerRemaining > 0) nextOwnership.push(createOrganizationOwnership({
    id: `ownership:${transaction.id}:seller`,
    organizationId: transaction.organizationId,
    owner: transaction.seller,
    ownershipPercentage: sellerRemaining,
    validFrom: executionDate,
    validTo: null,
  }))
  nextOwnership.push(createOrganizationOwnership({
    id: `ownership:${transaction.id}:buyer`,
    organizationId: transaction.organizationId,
    owner: transaction.buyer,
    ownershipPercentage: buyerTotal + transaction.transferredPercentage,
    validFrom: executionDate,
    validTo: null,
  }))
  return nextOwnership
}
