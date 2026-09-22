import { parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId } from '@/domain/ids'
import { projectOrganizationOwnershipTransactionOwnership } from '@/domain/ownership/OrganizationOwnershipTransactionExecution'
import { projectOrganizationInvestmentProposalOwnership } from '@/domain/investment/OrganizationInvestmentExecution'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessMultiClubImpactsForOrganization, type MultiClubConflictAssessment } from './MultiClubConflict'

export interface MultiClubImpactPreview {
  readonly organizationId: OrganizationId
  readonly effectiveOn: GameDate
  readonly assessments: readonly MultiClubConflictAssessment[]
  readonly blocked: boolean
}

export function previewOwnershipTransactionMultiClubImpact(world: GameWorld, transactionId: string, effectiveOn: GameDate | string): MultiClubImpactPreview {
  const date = parseGameDate(effectiveOn)
  const transaction = Object.values(world.organizationOwnershipTransactionsById).find((candidate) => candidate.id === transactionId)
  if (transaction === undefined) throw new Error(`Organization ownership transaction does not exist: ${transactionId}`)
  const projectedOwnership = projectOrganizationOwnershipTransactionOwnership(world, transactionId, date)
  return buildPreview(updateGameWorld(world, { organizationOwnership: projectedOwnership }), transaction.organizationId, date)
}

export function previewInvestmentProposalMultiClubImpact(world: GameWorld, proposalId: string, effectiveOn: GameDate | string): MultiClubImpactPreview {
  const date = parseGameDate(effectiveOn)
  const proposal = Object.values(world.organizationInvestmentProposalsById).find((candidate) => candidate.id === proposalId)
  if (proposal === undefined) throw new Error(`Organization investment proposal does not exist: ${proposalId}`)
  const raise = world.organizationCapitalRaisesById[proposal.capitalRaiseId]
  if (raise === undefined) throw new Error(`Organization capital raise does not exist: ${proposal.capitalRaiseId}`)
  const projectedOwnership = projectOrganizationInvestmentProposalOwnership(world, proposalId, date)
  return buildPreview(updateGameWorld(world, { organizationOwnership: projectedOwnership }), raise.organizationId, date)
}

function buildPreview(projectedWorld: GameWorld, organizationId: OrganizationId, effectiveOn: GameDate): MultiClubImpactPreview {
  const assessments = assessMultiClubImpactsForOrganization(projectedWorld, organizationId, effectiveOn)
  return Object.freeze({
    organizationId,
    effectiveOn,
    assessments,
    blocked: assessments.some((assessment) => assessment.enforcement === 'BLOCK' && (assessment.verdict === 'CONFLICT' || assessment.verdict === 'INDETERMINATE')),
  })
}
