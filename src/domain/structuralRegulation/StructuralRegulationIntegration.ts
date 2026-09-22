import { parseGameDate, type GameDate } from '@/domain/date'
import { createOrganizationOwnershipTransaction, type OrganizationOwnershipTransaction } from '@/domain/ownership/OrganizationOwnershipTransaction'
import type { OrganizationOwnershipActor } from '@/domain/ownership/OrganizationOwnership'
import { executeOrganizationOwnershipTransaction } from '@/domain/ownership/OrganizationOwnershipTransactionExecution'
import { assessMultiClubImpactsForOrganization, type MultiClubConflictAssessment } from '@/domain/multiClub/MultiClubConflict'
import { previewOwnershipTransactionMultiClubImpact, type MultiClubImpactPreview } from '@/domain/multiClub/MultiClubPreview'
import { createRegulatoryOrder, transitionRegulatoryOrder, type RegulatoryOrder } from './RegulatoryOrder'
import { transitionRegulatoryRemediationPlan, type RegulatoryRemediationPlan } from './RegulatoryRemediationPlan'
import { updateGameWorld, type GameWorld } from '@/domain/world'

export interface RegulatoryDivestmentProposal {
  readonly transaction: OrganizationOwnershipTransaction
  readonly hypotheticalAssessments: readonly MultiClubConflictAssessment[]
  readonly blocked: boolean
}

/** Runs the canonical BG8B preview, whose projected state is assessed by BG8D. */
export function previewRegulatoryDivestment(world: GameWorld, transactionId: string, effectiveOn: GameDate | string): MultiClubImpactPreview {
  const transaction = Object.values(world.organizationOwnershipTransactionsById).find((candidate) => candidate.id === transactionId)
  if (transaction === undefined) throw new Error(`Ownership transaction ${transactionId} does not exist`)
  return previewOwnershipTransactionMultiClubImpact(world, transaction.id, effectiveOn)
}

export function proposeRegulatoryDivestment(world: GameWorld, input: { readonly orderId: string; readonly transactionId: string; readonly seller: OrganizationOwnershipActor; readonly buyer: OrganizationOwnershipActor; readonly transferredPercentage: number; readonly agreedOn: GameDate | string; readonly consideration?: OrganizationOwnershipTransaction['consideration'] }): RegulatoryDivestmentProposal {
  const order = Object.values(world.regulatoryOrdersById).find((candidate) => candidate.id === input.orderId)
  if (order === undefined) throw new Error(`Regulatory order does not exist: ${input.orderId}`)
  if (order.orderType !== 'DIVESTMENT_REQUIRED') throw new Error(`Regulatory order ${order.id} does not require divestment`)
  if (order.status !== 'ACTIVE') throw new Error(`Regulatory order ${order.id} is not active`)
  const transaction = createOrganizationOwnershipTransaction({ id: input.transactionId, organizationId: order.targetOrganizationId, seller: input.seller, buyer: input.buyer, transferredPercentage: input.transferredPercentage, agreedOn: input.agreedOn, consideration: input.consideration })
  const events = Object.values(world.organizationOwnershipTransactionEventsById).filter((event) => event.transactionId === transaction.id)
  const hypothetical = events.length === 0 ? [] : assessMultiClubImpactsForOrganization(world, order.targetOrganizationId, parseGameDate(input.agreedOn))
  return Object.freeze({ transaction, hypotheticalAssessments: Object.freeze(hypothetical), blocked: hypothetical.some((assessment) => assessment.enforcement === 'BLOCK' && assessment.verdict !== 'CLEAR') })
}

export function executeRegulatoryDivestment(world: GameWorld, orderId: string, transactionId: string, effectiveOn: GameDate | string): GameWorld {
  const order = Object.values(world.regulatoryOrdersById).find((candidate) => candidate.id === orderId)
  if (order === undefined) throw new Error(`Regulatory order does not exist: ${orderId}`)
  if (order.orderType !== 'DIVESTMENT_REQUIRED' || order.status !== 'ACTIVE') throw new Error(`Regulatory order ${order.id} is not executable`)
  const transaction = Object.values(world.organizationOwnershipTransactionsById).find((candidate) => candidate.id === transactionId)
  if (transaction === undefined || transaction.organizationId !== order.targetOrganizationId) throw new Error(`Ownership transaction ${transactionId} does not satisfy regulatory order ${order.id}`)
  return executeOrganizationOwnershipTransaction(world, transactionId, effectiveOn)
}

export function assessRegulatoryOrderSatisfaction(world: GameWorld, orderId: string, onDate: GameDate | string): readonly MultiClubConflictAssessment[] {
  const order = Object.values(world.regulatoryOrdersById).find((candidate) => candidate.id === orderId)
  if (order === undefined) throw new Error(`Regulatory order does not exist: ${orderId}`)
  return assessMultiClubImpactsForOrganization(world, order.targetOrganizationId, parseGameDate(onDate))
}

export function satisfyRegulatoryOrder(world: GameWorld, orderId: string, onDate: GameDate | string): GameWorld {
  const order = Object.values(world.regulatoryOrdersById).find((candidate) => candidate.id === orderId)
  if (order === undefined) throw new Error(`Regulatory order does not exist: ${orderId}`)
  const date = parseGameDate(onDate)
  if (order.deadline !== null && date > order.deadline) throw new Error(`Regulatory order ${order.id} is past its deadline`)
  const assessments = assessRegulatoryOrderSatisfaction(world, orderId, date)
  if (order.orderType === 'DIVESTMENT_REQUIRED' && assessments.some((assessment) => assessment.verdict !== 'CLEAR')) throw new Error(`Regulatory order ${order.id} cannot be satisfied while BG8D is not CLEAR`)
  const next = transitionRegulatoryOrder(order, 'SATISFIED', onDate)
  return updateWorldOrders(world, next)
}

export function completeRegulatoryRemediationPlan(world: GameWorld, planId: string, completedAt: GameDate | string): GameWorld {
  const plan = Object.values(world.regulatoryRemediationPlansById).find((candidate) => candidate.id === planId)
  if (plan === undefined) throw new Error(`Regulatory remediation plan does not exist: ${planId}`)
  const order = world.regulatoryOrdersById[plan.regulatoryOrderId]
  if (order === undefined) throw new Error(`Regulatory order does not exist: ${plan.regulatoryOrderId}`)
  const nextPlan = transitionRegulatoryRemediationPlan(plan, 'COMPLETED', completedAt)
  return updateWorldPlan(world, nextPlan)
}

export function activateRegulatoryOrder(order: RegulatoryOrder, onDate: GameDate | string = order.effectiveDate): RegulatoryOrder { return transitionRegulatoryOrder(order, 'ACTIVE', onDate) }

function updateWorldOrders(world: GameWorld, order: RegulatoryOrder): GameWorld {
  return updateGameWorld(world, { regulatoryOrders: [...Object.values(world.regulatoryOrdersById).filter((candidate) => candidate.id !== order.id), order] })
}

function updateWorldPlan(world: GameWorld, plan: RegulatoryRemediationPlan): GameWorld {
  return updateGameWorld(world, { regulatoryRemediationPlans: [...Object.values(world.regulatoryRemediationPlansById).filter((candidate) => candidate.id !== plan.id), plan] })
}
