import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createOrganizationOwnership, getActiveOrganizationOwnership } from '@/domain/ownership/OrganizationOwnership'
import { actorKey } from './OrganizationInvestorInterest'
import { createOrganizationInvestmentProposalEvent, deriveOrganizationInvestmentProposalStatus, type OrganizationInvestmentProposal } from './OrganizationInvestmentProposal'
import { createOrganizationCapitalRaise, deriveOrganizationCapitalRaiseStatusAt } from './OrganizationCapitalRaise'
import { isLinkedGovernanceDecisionApproved } from './InvestmentGovernance'

export const ORGANIZATION_OWNERSHIP_TOTAL_TOLERANCE = 1e-9
const PERCENTAGE_NORMALIZATION_DECIMALS = 12

/** Executes one accepted primary-equity proposal atomically through canonical ownership history. */
export function executeOrganizationInvestmentProposal(world: GameWorld, proposalId: string, effectiveOn: GameDate | string): GameWorld {
  const proposal = Object.values(world.organizationInvestmentProposalsById).find((candidate) => candidate.id === proposalId)
  if (proposal === undefined) throw new Error(`Organization investment proposal does not exist: ${proposalId}`)
  const executionDate = parseGameDate(effectiveOn)
  const proposalEvents = Object.values(world.organizationInvestmentProposalEventsById).filter((event) => event.proposalId === proposal.id)
  if (deriveOrganizationInvestmentProposalStatus(proposalEvents) !== 'ACCEPTED') throw new Error(`Organization investment proposal ${proposal.id} is not accepted for execution`)
  if (compareGameDates(executionDate, proposal.proposedOn) < 0) throw new RangeError(`Organization investment proposal ${proposal.id} executes before its proposed date`)

  const capitalRaise = world.organizationCapitalRaisesById[proposal.capitalRaiseId]
  if (capitalRaise === undefined) throw new Error(`Organization capital raise does not exist: ${proposal.capitalRaiseId}`)
  const raiseEvents = Object.values(world.organizationCapitalRaiseEventsById).filter((event) => event.capitalRaiseId === capitalRaise.id)
  createOrganizationCapitalRaise(capitalRaise)
  if (deriveOrganizationCapitalRaiseStatusAt(raiseEvents, executionDate) !== 'OPENED' && deriveOrganizationCapitalRaiseStatusAt(raiseEvents, executionDate) !== 'REOPENED') throw new Error(`Organization capital raise ${capitalRaise.id} is not active for execution`)
  if (proposal.currencyCode !== capitalRaise.currencyCode) throw new Error(`Organization investment proposal ${proposal.id} currency does not match its capital raise`)
  if (proposal.amount > capitalRaise.targetAmount || proposal.requestedEquityPercentage > capitalRaise.maximumEquityPercentage) throw new RangeError(`Organization investment proposal ${proposal.id} exceeds its capital raise boundary`)
  if (!isLinkedGovernanceDecisionApproved(world, capitalRaise.governanceDecisionId, executionDate) || !isLinkedGovernanceDecisionApproved(world, proposal.governanceDecisionId, executionDate)) throw new Error(`Organization investment proposal ${proposal.id} lacks linked Governance approval`)

  const priorExecuted = Object.values(world.organizationInvestmentProposalsById)
    .filter((candidate) => candidate.capitalRaiseId === capitalRaise.id && candidate.id !== proposal.id)
    .filter((candidate) => Object.values(world.organizationInvestmentProposalEventsById).some((event) => event.proposalId === candidate.id && event.kind === 'EXECUTED' && compareGameDates(event.effectiveOn, executionDate) <= 0))
  const committedAmount = priorExecuted.reduce((sum, candidate) => sum + candidate.amount, 0)
  const committedEquity = priorExecuted.reduce((sum, candidate) => sum + candidate.requestedEquityPercentage, 0)
  if (committedAmount + proposal.amount > capitalRaise.targetAmount + ORGANIZATION_OWNERSHIP_TOTAL_TOLERANCE || committedEquity + proposal.requestedEquityPercentage > capitalRaise.maximumEquityPercentage + ORGANIZATION_OWNERSHIP_TOTAL_TOLERANCE) throw new RangeError(`Organization capital raise ${capitalRaise.id} would exceed its remaining capacity`)

  const active = getActiveOrganizationOwnership(world, capitalRaise.organizationId, executionDate)
  if (active.length === 0) throw new Error(`Organization ${capitalRaise.organizationId} has no active ownership basis for dilution`)
  if (active.some((row) => row.ownershipPercentage === null)) throw new Error(`Organization ${capitalRaise.organizationId} has unknown ownership percentage and cannot be diluted`)
  if (active.some((row) => row.validFrom === executionDate)) throw new Error(`Organization investment proposal ${proposal.id} conflicts with ownership effective on its execution date`)
  const total = active.reduce((sum, row) => sum + (row.ownershipPercentage ?? 0), 0)
  if (Math.abs(total - 100) > ORGANIZATION_OWNERSHIP_TOTAL_TOLERANCE) throw new Error(`Organization ${capitalRaise.organizationId} ownership basis is incomplete: expected 100 percent, found ${total}`)

  const byActor = new Map<string, { readonly actor: typeof active[number]['owner']; readonly percentage: number }>()
  for (const row of active) {
    const key = actorKey(row.owner)
    const previous = byActor.get(key)
    byActor.set(key, { actor: previous?.actor ?? row.owner, percentage: (previous?.percentage ?? 0) + (row.ownershipPercentage ?? 0) })
  }
  const issuanceFactor = (100 - proposal.requestedEquityPercentage) / 100
  const holders = [...byActor.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({ key, actor: value.actor, percentage: value.percentage * issuanceFactor + (key === actorKey(proposal.investor) ? proposal.requestedEquityPercentage : 0) }))
  const normalized = normalizePercentages(holders)
  const closeDate = addDays(executionDate, -1)
  const nextOwnership = Object.values(world.organizationOwnershipById).map((row) => active.some((current) => current.id === row.id) ? createOrganizationOwnership({ ...row, validTo: closeDate }) : row)
  normalized.forEach((holder, index) => nextOwnership.push(createOrganizationOwnership({
    id: `ownership:${proposal.id}:holder:${String(index + 1).padStart(3, '0')}`,
    organizationId: capitalRaise.organizationId,
    owner: holder.actor,
    ownershipPercentage: holder.percentage,
    validFrom: executionDate,
    validTo: null,
  })))

  const executionEvent = createOrganizationInvestmentProposalEvent({
    id: `investment-proposal:${proposal.id}:executed`,
    proposalId: proposal.id,
    kind: 'EXECUTED',
    effectiveOn: executionDate,
    ...(proposal.governanceDecisionId === undefined ? {} : { governanceDecisionId: proposal.governanceDecisionId }),
  })
  return updateGameWorld(world, { organizationOwnership: nextOwnership, organizationInvestmentProposalEvents: [...proposalEvents, executionEvent] })
}

function normalizePercentages(holders: readonly { readonly key: string; readonly actor: OrganizationInvestmentProposal['investor']; readonly percentage: number }[]): readonly { readonly actor: OrganizationInvestmentProposal['investor']; readonly percentage: number }[] {
  const positive = holders.map((holder) => ({ actor: holder.actor, percentage: roundPercentage(holder.percentage) })).filter((holder) => holder.percentage > ORGANIZATION_OWNERSHIP_TOTAL_TOLERANCE)
  if (positive.length === 0) throw new Error('Organization investment dilution produced no positive ownership')
  const corrected = positive.map((holder) => ({ ...holder }))
  const last = corrected.length - 1
  corrected[last] = { ...corrected[last]!, percentage: roundPercentage(corrected[last]!.percentage + (100 - corrected.reduce((sum, holder) => sum + holder.percentage, 0))) }
  return corrected
}

function roundPercentage(value: number): number {
  const factor = 10 ** PERCENTAGE_NORMALIZATION_DECIMALS
  return Math.round(value * factor) / factor
}
