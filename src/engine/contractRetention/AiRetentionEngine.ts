import { addDays } from '@/domain/date'
import { getContractYearCompensation } from '@/domain/contract'
import type { ContractReviewIntent } from '@/domain/contract/ContractReviewDecision'
import type { ContractId, TeamId } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, updateGameWorld, type GameWorld } from '@/domain/world'
import { assessClubNeeds } from '@/engine/clubNeeds/ClubNeedsEngine'
import { assessContractReviewOutlook } from '@/engine/clubNeeds/ContractReviewEngine'
import {
  assessAiRetentionEligibility,
  openAiRetentionNegotiation,
  respondToAiRetentionCounter,
  submitAiRetentionOffer,
  validateRetentionTermProposal,
  withdrawAiRetentionNegotiation,
} from './ContractRetentionEngine'

export type AiRetentionAction = 'NO_ACTION' | 'OPEN' | 'ACCEPT_IN_PRINCIPLE' | 'WITHDRAW'

/** Transient decision evidence for logs/inspection; it is never saved into GameWorld. */
export interface AiRetentionDecisionEvidence {
  readonly teamId: TeamId
  readonly playerId: string
  readonly contractId: ContractId
  readonly date: GameWorld['currentDate']
  readonly reviewIntent?: ContractReviewIntent
  readonly strategyMode?: string
  readonly needId?: string
  readonly negotiationId?: string
  readonly eligible: boolean
  readonly action: AiRetentionAction
  readonly reasons: readonly string[]
}

export interface AiRetentionProgressResult {
  readonly world: GameWorld
  readonly decisions: readonly AiRetentionDecisionEvidence[]
}

/** Runs a bounded AI retention pass through the same negotiation records and validation as user retention. */
export function progressAiRetentionNegotiations(world: GameWorld): GameWorld {
  return progressAiRetentionNegotiationsWithEvidence(world).world
}

export function progressAiRetentionNegotiationsWithEvidence(world: GameWorld): AiRetentionProgressResult {
  const workTeamIds = retentionWorkTeamIds(world)
  const aiTeams = Object.values(world.teams)
    .filter((team) => team.coachId !== undefined && team.coachId !== world.userCoachId)
    .filter((team) => workTeamIds.has(team.id))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (aiTeams.length === 0) return Object.freeze({ world, decisions: Object.freeze([]) })

  let current = world
  const decisions: AiRetentionDecisionEvidence[] = []
  for (const initialTeam of aiTeams) {
    const team = current.teams[initialTeam.id]
    if (team === undefined || team.coachId === undefined || team.coachId === current.userCoachId) continue
    const reviews = assessContractReviewOutlook(current, team.id).reviews
    const needs = assessClubNeeds(current, team.id).needs
    const reviewByContractId = new Map(reviews.map((review) => [review.contractId, review]))
    const intentFor = (contractId: ContractId) => {
      const review = reviewByContractId.get(contractId)
      const need = review === undefined ? undefined : needs.find((item) => item.id === review.needId)
      return { review, need, ...deriveAiReviewIntent(current, team.id, review, need) }
    }

    const handled = new Set<ContractId>()
    const teamNegotiations = Object.values(current.retentionNegotiationsById).filter((item) => item.teamId === team.id)
    const priorAttemptContractIds = new Set(teamNegotiations.map((item) => item.predecessorContractId))
    const openNegotiations = teamNegotiations
      .filter((item) => isOpen(item.status))
      .sort((left, right) => left.predecessorContractId.localeCompare(right.predecessorContractId))
    for (const negotiation of openNegotiations) {
      handled.add(negotiation.predecessorContractId)
      const context = intentFor(negotiation.predecessorContractId)
      const reasons = [...context.reasons]
      if (context.intent !== 'PURSUE_EXTENSION') {
        const withdrawn = withdrawAiRetentionNegotiation(current, {
          teamId: team.id,
          negotiationId: negotiation.id,
          actionId: aiActionId('withdraw', negotiation.id, current.currentDate),
        })
        if (withdrawn.ok) current = withdrawn.world
        decisions.push(evidence(current, team.id, negotiation.playerId, negotiation.predecessorContractId, context.intent, context.review?.needId, negotiation.id, false, withdrawn.ok ? 'WITHDRAW' : 'NO_ACTION', [...reasons, withdrawn.ok ? 'REVIEW_INTENT_NO_LONGER_PURSUED' : withdrawn.reason]))
        continue
      }

      if (negotiation.status !== 'PLAYER_COUNTERED' || negotiation.currentTerms === undefined) {
        decisions.push(evidence(current, team.id, negotiation.playerId, negotiation.predecessorContractId, context.intent, context.review?.needId, negotiation.id, true, 'NO_ACTION', [...reasons, 'WAITING_FOR_PLAYER_OR_AGENT_RESPONSE']))
        continue
      }

      const contract = current.contractsById[negotiation.predecessorContractId]
      const terms = negotiation.currentTerms
      const validTerms = contract !== undefined && validateRetentionTermProposal(current, team.id, contract.term.expiresOn, terms).status === 'VALID_NONBINDING_PROPOSAL'
      const affordable = contract !== undefined && canAffordRetentionSalary(current, team.id, contract.id, terms.salary)
      const lastOfferSalary = negotiation.rounds.at(-1)?.offer.salary
      const counterDelta = lastOfferSalary === undefined ? 0 : terms.salary - lastOfferSalary
      if (validTerms && affordable) {
        const accepted = respondToAiRetentionCounter(current, {
          teamId: team.id,
          negotiationId: negotiation.id,
          expectedRound: negotiation.rounds.length,
          actionId: aiActionId('accept', negotiation.id, current.currentDate),
          action: 'ACCEPT_COUNTER',
        })
        if (accepted.ok) current = accepted.world
        decisions.push(evidence(current, team.id, negotiation.playerId, negotiation.predecessorContractId, context.intent, context.review?.needId, negotiation.id, true, accepted.ok ? 'ACCEPT_IN_PRINCIPLE' : 'NO_ACTION', [...reasons, counterDelta <= 0 ? 'COUNTER_DOES_NOT_INCREASE_SALARY' : 'COUNTER_DELTA_WITHIN_KNOWN_BUDGET', ...(accepted.ok ? [] : [accepted.reason])]))
      } else {
        const withdrawn = withdrawAiRetentionNegotiation(current, {
          teamId: team.id,
          negotiationId: negotiation.id,
          actionId: aiActionId('withdraw-counter', negotiation.id, current.currentDate),
        })
        if (withdrawn.ok) current = withdrawn.world
        decisions.push(evidence(current, team.id, negotiation.playerId, negotiation.predecessorContractId, context.intent, context.review?.needId, negotiation.id, false, withdrawn.ok ? 'WITHDRAW' : 'NO_ACTION', [...reasons, !validTerms ? 'COUNTER_TERMS_NOT_VALID' : 'COUNTER_EXCEEDS_KNOWN_BUDGET', ...(withdrawn.ok ? [] : [withdrawn.reason])]))
      }
    }

    for (const review of reviews) {
      if (handled.has(review.contractId) || !isActionableReview(review.status)) continue
      const need = needs.find((item) => item.id === review.needId)
      const context = deriveAiReviewIntent(current, team.id, review, need)
      const contract = current.contractsById[review.contractId]
      if (context.intent !== 'PURSUE_EXTENSION') {
        decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, undefined, false, 'NO_ACTION', context.reasons))
        continue
      }
      if (contract === undefined) {
        decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, undefined, false, 'NO_ACTION', [...context.reasons, 'PREDECESSOR_UNAVAILABLE']))
        continue
      }

      // Existing contract compensation is known club information; MarketReality and response scores are never read.
      const salary = getContractYearCompensation(contract, current.currentDate).cashSalary || contract.compensation.annualSalary
      const terms = { salary, years: 1 }
      const eligibility = assessAiRetentionEligibility(current, team.id, contract.id, terms)
      if (!eligibility.eligible) {
        decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, undefined, false, 'NO_ACTION', [...context.reasons, ...eligibility.reasons]))
        continue
      }
      if (!canAffordRetentionSalary(current, team.id, contract.id, salary)) {
        decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, undefined, true, 'NO_ACTION', [...context.reasons, 'OPENING_TERMS_EXCEED_KNOWN_BUDGET']))
        continue
      }

      // One AI attempt per predecessor keeps daily processing idempotent and prevents negotiation loops.
      if (priorAttemptContractIds.has(contract.id)) {
        decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, undefined, true, 'NO_ACTION', [...context.reasons, 'PRIOR_AI_ATTEMPT_EXISTS']))
        continue
      }
      const opening = openAiRetentionNegotiation(current, {
        teamId: team.id,
        contractId: contract.id,
        actionId: aiActionId('open', contract.id, current.currentDate),
      })
      if (!opening.ok) {
        decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, undefined, false, 'NO_ACTION', [...context.reasons, opening.reason]))
        continue
      }
      current = opening.world
      priorAttemptContractIds.add(contract.id)
      const submitted = submitAiRetentionOffer(current, {
        teamId: team.id,
        negotiationId: opening.negotiation.id,
        expectedRound: 0,
        actionId: aiActionId('offer', opening.negotiation.id, current.currentDate),
        terms,
      })
      if (submitted.ok) current = submitted.world
      decisions.push(evidence(current, team.id, review.playerId, review.contractId, context.intent, review.needId, opening.negotiation.id, true, submitted.ok ? 'OPEN' : 'NO_ACTION', [...context.reasons, submitted.ok ? 'CURRENT_SALARY_OPENING_OFFER' : submitted.reason]))
    }
  }
  return Object.freeze({ world: current, decisions: Object.freeze(decisions) })
}

function deriveAiReviewIntent(world: GameWorld, teamId: TeamId, review: ReturnType<typeof assessContractReviewOutlook>['reviews'][number] | undefined, need: ReturnType<typeof assessClubNeeds>['needs'][number] | undefined): { readonly intent?: ContractReviewIntent; readonly reasons: readonly string[] } {
  if (review === undefined) return { reasons: ['NO_CURRENT_BS11B_REVIEW'] }
  if (review.decision === 'PURSUE_EXTENSION') return { intent: 'PURSUE_EXTENSION', reasons: ['BS11B_PURSUE_EXTENSION'] }
  if (review.decision === 'ALLOW_EXPIRY') return { intent: 'ALLOW_EXPIRY', reasons: ['BS11B_ALLOW_EXPIRY'] }
  if (review.decision === 'REVIEW_RELEASE') return { intent: 'REVIEW_RELEASE', reasons: ['BS11B_REVIEW_RELEASE'] }
  if (review.decision === 'DEFER' && review.reviewAgainOn !== undefined && review.reviewAgainOn > world.currentDate) return { intent: 'DEFER', reasons: ['BS11B_DEFER_NOT_DUE'] }
  if (!['REVIEW_REQUIRED', 'DEFERRED'].includes(review.status)) return { reasons: [`BS11B_STATUS_${review.status}`] }

  const strategy = world.clubStrategicStatesByTeamId[teamId]
  if (strategy === undefined) return { reasons: ['CLUB_STRATEGY_UNAVAILABLE'] }
  if (strategy.retentionPosture === 'OPEN') return { intent: 'ALLOW_EXPIRY', reasons: ['STRATEGY_RETENTION_POSTURE_OPEN'] }
  if (strategy.retentionPosture === 'PROTECT_CORE') return { intent: 'PURSUE_EXTENSION', reasons: ['STRATEGY_PROTECT_CORE', `STRATEGY_${strategy.mode}`] }
  const strongNeed = need !== undefined && (need.severity === 'HIGH' || need.severity === 'CRITICAL') && need.strategicFit === 'HIGH'
  if (strongNeed && strategy.financialPosture !== 'STRESSED') return { intent: 'PURSUE_EXTENSION', reasons: ['STRATEGY_SELECTIVE', 'HIGH_PRIORITY_STRATEGIC_CONTRACT_NEED'] }
  return { intent: 'ALLOW_EXPIRY', reasons: ['STRATEGY_SELECTIVE_NEED_NOT_HIGH_PRIORITY'] }
}

function retentionWorkTeamIds(world: GameWorld): ReadonlySet<TeamId> {
  const cutoff = addDays(world.currentDate, 365)
  const work = new Set<TeamId>()
  for (const contract of Object.values(world.contractsById)) {
    const team = world.teams[contract.teamId]
    if (contract.term.expiresOn > world.currentDate && contract.term.expiresOn <= cutoff && team?.rosterPlayerIds.includes(contract.playerId)) work.add(contract.teamId)
  }
  for (const negotiation of Object.values(world.retentionNegotiationsById)) if (isOpen(negotiation.status)) work.add(negotiation.teamId)
  return work
}

function canAffordRetentionSalary(world: GameWorld, teamId: TeamId, contractId: ContractId, proposedSalary: number): boolean {
  const contract = world.contractsById[contractId]
  if (contract === undefined) return false
  const currentSalary = getContractYearCompensation(contract, world.currentDate).cashSalary || contract.compensation.annualSalary
  const increase = Math.max(0, proposedSalary - currentSalary)
  try {
    return canTeamAffordAdditionalSalary(world, teamId, increase, world.currentDate)
  } catch {
    return false
  }
}

function isActionableReview(status: string): boolean {
  return status === 'REVIEW_REQUIRED' || status === 'DEFERRED' || status === 'PURSUE_EXTENSION' || status === 'ALLOW_EXPIRY' || status === 'REVIEW_RELEASE'
}

function isOpen(status: string): boolean {
  return status === 'OPEN' || status === 'CLUB_OFFERED' || status === 'PLAYER_COUNTERED'
}

function aiActionId(action: string, identity: string, date: string): string {
  return `ai-retention:${action}:${encodeURIComponent(identity)}:${date}`
}

function evidence(world: GameWorld, teamId: TeamId, playerId: string, contractId: ContractId, reviewIntent: ContractReviewIntent | undefined, needId: string | undefined, negotiationId: string | undefined, eligible: boolean, action: AiRetentionAction, reasons: readonly string[]): AiRetentionDecisionEvidence {
  const strategyMode = world.clubStrategicStatesByTeamId[teamId]?.mode
  return Object.freeze({ teamId, playerId, contractId, date: world.currentDate, ...(reviewIntent === undefined ? {} : { reviewIntent }), ...(strategyMode === undefined ? {} : { strategyMode }), ...(needId === undefined ? {} : { needId }), ...(negotiationId === undefined ? {} : { negotiationId }), eligible, action, reasons: Object.freeze([...reasons]) })
}
