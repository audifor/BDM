import { parseGameDate, type GameDate } from '@/domain/date'
import { deriveGovernanceDecisionStatus, resolveGovernanceDecisionRights, type GovernanceDecisionType } from '@/domain/governance'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getFinancialHealthSnapshot } from './FinancialHealth'
import { getActiveApprovedBudget, getBudgetComparison, type FinancialPlanningPeriod } from './BudgetForecasting'
import { createFinancialSource, createMoney, type FinancialSource, type Money } from './FinancialLedger'

export type FinanceActionType = 'WARN_LIQUIDITY_SHORTFALL' | 'RECOMMEND_RESERVE_CASH' | 'RECOMMEND_DEFER_SPEND' | 'RECOMMEND_FINANCING' | 'RECOMMEND_CAPITAL_REQUEST' | 'RECOMMEND_DEBT_REPAYMENT' | 'RECOMMEND_BUDGET_REVISION' | 'RECOMMEND_COST_REDUCTION' | 'RECOMMEND_REVENUE_GAP' | 'RECOMMEND_INVESTMENT'
export type FinanceProposalStatus = 'RECOMMENDED' | 'APPROVED' | 'REJECTED'
export interface FinanceDecisionProposal {
  readonly id: string
  readonly organizationId: string
  readonly asOfDate: GameDate
  readonly actionType: FinanceActionType
  readonly evidence: readonly { readonly kind: string; readonly currencyCode: string; readonly amountMinorUnits: number; readonly referenceId?: string }[]
  readonly expectedFinancialImpact: Money | null
  readonly risks: readonly string[]
  readonly authorityRequired: GovernanceDecisionType | 'OWNERSHIP' | 'NONE'
  readonly responsibleActor: { readonly kind: 'STAFF' | 'GOVERNANCE_BODY'; readonly id: string } | null
  readonly governanceDecisionId: string | null
  readonly status: FinanceProposalStatus
  readonly provenance: FinancialSource
}

export interface FinanceAiPolicy {
  readonly id: string
  readonly version: string
  readonly recommendFinancingForShortfall: boolean
  readonly recommendCapitalForShortfall: boolean
  readonly recommendDeferringSpendForShortfall: boolean
  readonly recommendBudgetRevisionForAnyProjectedVariance: boolean
}

export function createFinanceDecisionProposal(value: FinanceDecisionProposal): FinanceDecisionProposal {
  if (!value.id?.trim() || !value.organizationId?.trim() || !['RECOMMENDED', 'APPROVED', 'REJECTED'].includes(value.status) || !['WARN_LIQUIDITY_SHORTFALL', 'RECOMMEND_RESERVE_CASH', 'RECOMMEND_DEFER_SPEND', 'RECOMMEND_FINANCING', 'RECOMMEND_CAPITAL_REQUEST', 'RECOMMEND_DEBT_REPAYMENT', 'RECOMMEND_BUDGET_REVISION', 'RECOMMEND_COST_REDUCTION', 'RECOMMEND_REVENUE_GAP', 'RECOMMEND_INVESTMENT'].includes(value.actionType) || !Array.isArray(value.evidence) || value.evidence.some((item) => !item || typeof item.kind !== 'string' || !item.kind.trim() || typeof item.currencyCode !== 'string' || !Number.isSafeInteger(item.amountMinorUnits)) || !Array.isArray(value.risks) || value.risks.some((risk) => typeof risk !== 'string') || !['BUDGET', 'DEBT', 'CAPITAL_EXPENDITURE', 'STRATEGIC_PLAN', 'OWNERSHIP', 'NONE'].includes(value.authorityRequired) || (value.responsibleActor !== null && (!value.responsibleActor || !value.responsibleActor.id?.trim() || !['STAFF', 'GOVERNANCE_BODY'].includes(value.responsibleActor.kind))) || (value.governanceDecisionId !== null && (typeof value.governanceDecisionId !== 'string' || !value.governanceDecisionId.trim()))) throw new TypeError('Invalid finance proposal')
  return Object.freeze({ ...value, asOfDate: parseGameDate(value.asOfDate), evidence: Object.freeze(value.evidence.map((item) => Object.freeze({ ...item }))), expectedFinancialImpact: value.expectedFinancialImpact === null ? null : createMoney(value.expectedFinancialImpact), risks: Object.freeze([...value.risks]), provenance: createFinancialSource(value.provenance) })
}

/** Deterministic advice. Recording and approval are separate operations. */
export function recommendFinanceActions(world: GameWorld, input: { readonly organizationId: string; readonly asOfDate: GameDate | string; readonly periodStartsOn: GameDate | string; readonly policy: FinanceAiPolicy; readonly budgetPeriod?: FinancialPlanningPeriod; readonly responsibleActor?: FinanceDecisionProposal['responsibleActor'] }): readonly FinanceDecisionProposal[] {
  const { policy } = input
  if (!policy.id.trim() || !policy.version.trim()) throw new TypeError('Finance AI policy needs an id and version')
  const snapshot = getFinancialHealthSnapshot(world, input.organizationId, input.asOfDate, input.periodStartsOn)
  const proposals: FinanceDecisionProposal[] = []
  const add = (actionType: FinanceActionType, currencyCode: string, amountMinorUnits: number, kind: string, authorityRequired: FinanceDecisionProposal['authorityRequired'], referenceId?: string) => proposals.push(createFinanceDecisionProposal({ id: `finance-ai:${policy.id}:${policy.version}:${input.organizationId}:${snapshot.asOfDate}:${actionType}:${currencyCode}:${referenceId ?? 'none'}`, organizationId: input.organizationId, asOfDate: snapshot.asOfDate, actionType, evidence: [{ kind, currencyCode, amountMinorUnits, ...(referenceId ? { referenceId } : {}) }], expectedFinancialImpact: null, risks: [], authorityRequired, responsibleActor: input.responsibleActor ?? null, governanceDecisionId: null, status: 'RECOMMENDED', provenance: { kind: 'FINANCE_AI_POLICY', id: `${policy.id}:${policy.version}` } }))
  for (const row of snapshot.byCurrency) {
    if (row.liquidityShortfallMinorUnits > 0) {
      add('WARN_LIQUIDITY_SHORTFALL', row.currencyCode, row.liquidityShortfallMinorUnits, 'LIQUIDITY_SHORTFALL', 'NONE')
      if (policy.recommendDeferringSpendForShortfall) add('RECOMMEND_DEFER_SPEND', row.currencyCode, row.liquidityShortfallMinorUnits, 'LIQUIDITY_SHORTFALL', 'BUDGET')
      if (policy.recommendFinancingForShortfall) add('RECOMMEND_FINANCING', row.currencyCode, row.liquidityShortfallMinorUnits, 'LIQUIDITY_SHORTFALL', 'DEBT')
      if (policy.recommendCapitalForShortfall) add('RECOMMEND_CAPITAL_REQUEST', row.currencyCode, row.liquidityShortfallMinorUnits, 'LIQUIDITY_SHORTFALL', 'OWNERSHIP')
    }
  }
  if (policy.recommendBudgetRevisionForAnyProjectedVariance && input.budgetPeriod) {
    const budget = getActiveApprovedBudget(world, input.organizationId, input.budgetPeriod, snapshot.asOfDate)
    if (budget) for (const row of getBudgetComparison(world, budget.id, snapshot.asOfDate).filter((item) => item.projectedOverBudget)) add('RECOMMEND_BUDGET_REVISION', budget.currencyCode, Math.abs(row.projectedVarianceMinorUnits), 'PROJECTED_BUDGET_VARIANCE', 'BUDGET', row.lineId)
  }
  return Object.freeze(proposals.sort((a, b) => a.id.localeCompare(b.id)))
}

export function recordFinanceProposal(world: GameWorld, proposalInput: FinanceDecisionProposal): GameWorld {
  const proposal = createFinanceDecisionProposal(proposalInput)
  if (!world.organizationsById[proposal.organizationId as keyof typeof world.organizationsById] || proposal.status !== 'RECOMMENDED') throw new RangeError('Proposal needs a known Organization and recommended status')
  const existing = world.financeDecisionProposalsById[proposal.id]
  if (existing) { if (JSON.stringify(existing) !== JSON.stringify(proposal)) throw new RangeError('Finance proposal ID conflict'); return world }
  return updateGameWorld(world, { financeDecisionProposals: [...Object.values(world.financeDecisionProposalsById), proposal] })
}

export function resolveFinanceProposal(world: GameWorld, proposalId: string, status: 'APPROVED' | 'REJECTED', governanceDecisionId: string | null = null): GameWorld {
  const proposal = world.financeDecisionProposalsById[proposalId]
  if (!proposal || proposal.status !== 'RECOMMENDED') throw new RangeError('Finance proposal is not open')
  if (status === 'APPROVED' && proposal.authorityRequired !== 'NONE') {
    if (proposal.authorityRequired === 'OWNERSHIP') throw new RangeError('Ownership approval must be recorded by Ownership authority')
    if (!isFinanceProposalGovernanceApproved(world, proposal, governanceDecisionId)) throw new RangeError('Governance has not approved the action')
  }
  const updated = createFinanceDecisionProposal({ ...proposal, status, governanceDecisionId })
  return updateGameWorld(world, { financeDecisionProposals: Object.values(world.financeDecisionProposalsById).map((item) => item.id === proposalId ? updated : item) })
}

export function isFinanceProposalGovernanceApproved(world: GameWorld, proposal: FinanceDecisionProposal, governanceDecisionId: string | null): boolean {
  if (governanceDecisionId === null || proposal.authorityRequired === 'NONE' || proposal.authorityRequired === 'OWNERSHIP') return false
  const decision = world.governanceDecisionsById[governanceDecisionId]
  if (!decision || decision.decisionType !== proposal.authorityRequired || decision.proposedOn < proposal.asOfDate || !('referenceId' in decision.subject) || decision.subject.referenceId !== proposal.id) return false
  const rights = resolveGovernanceDecisionRights({ decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: world.currentDate, bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) })
  const events = Object.values(world.governanceDecisionEventsById).filter((item) => item.decisionId === decision.id && item.effectiveOn <= world.currentDate)
  return ['APPROVED', 'EXECUTED'].includes(deriveGovernanceDecisionStatus(events, rights.approverBodyIds) ?? '')
}

export function getFinanceProposals(world: GameWorld, organizationId: string, status?: FinanceProposalStatus): readonly FinanceDecisionProposal[] {
  return Object.freeze(Object.values(world.financeDecisionProposalsById).filter((item) => item.organizationId === organizationId && (status === undefined || item.status === status)).sort((a, b) => a.asOfDate.localeCompare(b.asOfDate) || a.id.localeCompare(b.id)))
}
