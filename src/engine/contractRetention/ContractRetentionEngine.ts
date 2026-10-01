import { addDays, type GameDate } from '@/domain/date'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import { freezeRetentionTerms, retentionNegotiationIdFor, type ContractRetentionNegotiation, type RetentionNegotiationRound, type RetentionNegotiationStatus, type RetentionPlayerResponse, type RetentionResponseReasonCode, type RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import { agentCounter, type ContractNegotiation } from '@/domain/market'
import type { ContractId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { hasContinuousContractSuccessor } from '@/engine/clubNeeds/ContractRosterPlanning'
import { relationshipKey } from '@/domain/relationships'

export const RETENTION_COOLDOWN_DAYS = 3

/** Calibration values are response-balance parameters, not contract rules. */
export const RETENTION_RESPONSE_CALIBRATION = Object.freeze({
  weights: Object.freeze({ salary: 0.45, termSecurity: 0.20, roleOpportunity: 0.15, morale: 0.10, relationship: 0.05, clubContext: 0.05 }),
  acceptedScore: 0.95,
  counterEconomicRatio: 0.80,
  acceptedEconomicRatio: 0.95,
  optionSecurityAdjustment: 0.025,
  guaranteeSecurityAdjustment: 0.025,
  roleFitAdjustment: 0.15,
  moraleAdjustment: 0.12,
  coachRelationshipAdjustment: 0.10,
})

export type RetentionEligibilityReason =
  | 'TEAM_NOT_USER_CONTROLLED' | 'CONTRACT_NOT_FOUND' | 'CONTRACT_NOT_ACTIVE' | 'CONTRACT_NOT_UNIQUE'
  | 'CONTRACT_TEAM_MISMATCH' | 'PLAYER_NOT_ROSTERED' | 'INTEGRITY_INVALID' | 'INTEGRITY_AMBIGUOUS'
  | 'NOT_PROFESSIONAL_ECOSYSTEM' | 'RETENTION_RULES_UNAVAILABLE' | 'RETENTION_WINDOW_CLOSED'
  | 'CONTINUOUS_SUCCESSOR_EXISTS' | 'OPEN_NEGOTIATION_EXISTS' | 'COOLDOWN_ACTIVE' | 'EFFECTIVE_CONTRACT_RULES_UNAVAILABLE'
  | 'CONTRACT_TERM_NOT_LEGAL' | 'STRUCTURAL_INVALIDITY' | 'STALE_NEGOTIATION' | 'ACTION_NOT_AVAILABLE'

export interface RetentionEligibility {
  readonly eligible: boolean
  readonly reasons: readonly RetentionEligibilityReason[]
  readonly predecessorContractId: ContractId
  readonly proposedEffectiveDate?: GameDate
  readonly retentionWindowDays?: number
  readonly daysUntilExpiry?: number
  readonly reopenOn?: GameDate
}

export type RetentionCommandResult =
  | { readonly ok: true; readonly world: GameWorld; readonly negotiation: ContractRetentionNegotiation }
  | { readonly ok: false; readonly world: GameWorld; readonly reason: RetentionEligibilityReason }

export interface RetentionResponseDerivation {
  readonly response: RetentionPlayerResponse
  /** Internal projection only. Never persisted or displayed. */
  readonly compositeScore: number
  readonly factors: Readonly<{ salary: number; termSecurity: number; roleOpportunity: number; morale: number; relationship: number; clubContext: number }>
}

export type RetentionTermValidationResult =
  | { readonly status: 'STRUCTURAL_INVALIDITY'; readonly reason: string }
  | { readonly status: 'RULES_UNAVAILABLE' }
  | { readonly status: 'RULES_ILLEGAL'; readonly reason: 'CONTRACT_TERM_NOT_LEGAL' }
  | { readonly status: 'VALID_NONBINDING_PROPOSAL'; readonly terms: RetentionTermSet }

/** Validates proposal structure and the SalaryRules contract-length authority without executing terms. */
export function validateRetentionTermProposal(world: GameWorld, teamId: TeamId, effectiveDate: GameDate, terms: RetentionTermSet): RetentionTermValidationResult {
  let normalized: RetentionTermSet
  try {
    normalized = freezeRetentionTerms(terms)
  } catch (error) {
    return { status: 'STRUCTURAL_INVALIDITY', reason: error instanceof Error ? error.message : 'Retention terms are structurally invalid' }
  }
  const currentRules = applicableSalaryRules(world, teamId, world.currentDate)
  const effectiveRules = applicableSalaryRules(world, teamId, effectiveDate)
  if (effectiveRules.length === 0) return { status: 'RULES_UNAVAILABLE' }
  if (normalized.incentives?.some((item) => world.competitions[item.competitionId] === undefined || !world.competitions[item.competitionId]!.participantTeamIds.includes(teamId))) return { status: 'STRUCTURAL_INVALIDITY', reason: 'Incentive competition must be a current competition of the negotiating team' }
  for (const rules of [...currentRules, ...effectiveRules]) {
    if (normalized.years < rules.contractLength.minimumYears || normalized.years > rules.contractLength.maximumYears) return { status: 'RULES_ILLEGAL', reason: 'CONTRACT_TERM_NOT_LEGAL' }
  }
  return { status: 'VALID_NONBINDING_PROPOSAL', terms: normalized }
}

export function assessRetentionEligibility(world: GameWorld, teamId: TeamId, contractId: ContractId, terms?: RetentionTermSet): RetentionEligibility {
  return assessRetentionEligibilityForControl(world, teamId, contractId, terms, 'USER')
}

export function assessAiRetentionEligibility(world: GameWorld, teamId: TeamId, contractId: ContractId, terms?: RetentionTermSet): RetentionEligibility {
  return assessRetentionEligibilityForControl(world, teamId, contractId, terms, 'AI')
}

function assessRetentionEligibilityForControl(world: GameWorld, teamId: TeamId, contractId: ContractId, terms: RetentionTermSet | undefined, controller: 'USER' | 'AI'): RetentionEligibility {
  const reasons: RetentionEligibilityReason[] = []
  const team = world.teams[teamId]
  const contract = world.contractsById[contractId]
  if (team?.coachId === undefined || (controller === 'USER' ? team.coachId !== world.userCoachId : team.coachId === world.userCoachId)) reasons.push('TEAM_NOT_USER_CONTROLLED')
  if (contract === undefined) return eligibility(contractId, ['CONTRACT_NOT_FOUND'])
  if (getPlayerContractStatus(contract, world.currentDate) !== 'active') reasons.push('CONTRACT_NOT_ACTIVE')
  const activeForPlayer = Object.values(world.contractsById).filter((item) => item.playerId === contract.playerId && getPlayerContractStatus(item, world.currentDate) === 'active')
  if (activeForPlayer.length !== 1 || activeForPlayer[0]?.id !== contract.id) reasons.push('CONTRACT_NOT_UNIQUE')
  if (contract.teamId !== teamId) reasons.push('CONTRACT_TEAM_MISMATCH')
  if (team === undefined || !team.rosterPlayerIds.includes(contract.playerId)) reasons.push('PLAYER_NOT_ROSTERED')
  const integrity = assessActiveContractRosterIntegrity(world, contract.playerId)
  if (integrity === 'INVALID') reasons.push('INTEGRITY_INVALID')
  if (integrity === 'AMBIGUOUS' || integrity === 'UNKNOWN') reasons.push('INTEGRITY_AMBIGUOUS')
  const professionalCompetitions = Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(teamId) && world.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike')
  if (professionalCompetitions.length === 0) reasons.push('NOT_PROFESSIONAL_ECOSYSTEM')
  const windowValues = [...new Set(professionalCompetitions.map((competition) => competition.rules.retentionWindowDaysBeforeExpiry))]
  const retentionWindowDays = windowValues.length === 1 ? windowValues[0] : undefined
  if (retentionWindowDays === undefined) reasons.push('RETENTION_RULES_UNAVAILABLE')
  const daysUntilExpiry = calendarDayNumber(contract.term.expiresOn) - calendarDayNumber(world.currentDate)
  if (retentionWindowDays !== undefined && (daysUntilExpiry <= 0 || daysUntilExpiry > retentionWindowDays)) reasons.push('RETENTION_WINDOW_CLOSED')
  if (hasContinuousContractSuccessor(world, contract.id)) reasons.push('CONTINUOUS_SUCCESSOR_EXISTS')
  const activeNegotiation = Object.values(world.retentionNegotiationsById).find((item) => item.teamId === teamId && item.playerId === contract.playerId && item.predecessorContractId === contract.id && isOpenStatus(item.status))
  if (activeNegotiation !== undefined) reasons.push('OPEN_NEGOTIATION_EXISTS')
  const cooldown = latestCooldown(world, teamId, contract.playerId, contract.id)
  if (cooldown !== undefined && world.currentDate < cooldown.reopenOn!) {
    reasons.push('COOLDOWN_ACTIVE')
  }
  if (terms !== undefined) {
    const termResult = validateRetentionTermProposal(world, teamId, contract.term.expiresOn, terms)
    if (termResult.status === 'STRUCTURAL_INVALIDITY') reasons.push('STRUCTURAL_INVALIDITY')
    if (termResult.status === 'RULES_UNAVAILABLE') reasons.push('EFFECTIVE_CONTRACT_RULES_UNAVAILABLE')
    if (termResult.status === 'RULES_ILLEGAL') reasons.push(termResult.reason)
  }
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons), predecessorContractId: contract.id, proposedEffectiveDate: contract.term.expiresOn, ...(retentionWindowDays === undefined ? {} : { retentionWindowDays }), daysUntilExpiry, ...(cooldown?.reopenOn === undefined ? {} : { reopenOn: cooldown.reopenOn }) })
}

export function openRetentionNegotiation(world: GameWorld, input: { readonly teamId: TeamId; readonly contractId: ContractId; readonly actionId: string }): RetentionCommandResult {
  return openRetentionNegotiationForControl(world, input, 'USER')
}

export function openAiRetentionNegotiation(world: GameWorld, input: { readonly teamId: TeamId; readonly contractId: ContractId; readonly actionId: string }): RetentionCommandResult {
  return openRetentionNegotiationForControl(world, input, 'AI')
}

function openRetentionNegotiationForControl(world: GameWorld, input: { readonly teamId: TeamId; readonly contractId: ContractId; readonly actionId: string }, controller: 'USER' | 'AI'): RetentionCommandResult {
  if (!isControlledBy(world, input.teamId, controller)) return fail(world, 'TEAM_NOT_USER_CONTROLLED')
  const contract = world.contractsById[input.contractId]
  if (contract === undefined) return fail(world, 'CONTRACT_NOT_FOUND')
  const id = retentionNegotiationIdFor(input.teamId, contract.playerId, contract.id, input.actionId)
  const retry = world.retentionNegotiationsById[id]
  if (retry !== undefined) return { ok: true, world, negotiation: retry }
  const eligibility = assessRetentionEligibilityForControl(world, input.teamId, input.contractId, undefined, controller)
  if (!eligibility.eligible) return fail(world, eligibility.reasons[0]!)
  const team = world.teams[input.teamId]!
  const negotiation = {
    id,
    openingActionId: input.actionId,
    teamId: team.id,
    organizationId: team.organizationId,
    playerId: contract.playerId,
    predecessorContractId: contract.id,
    openedOn: world.currentDate,
    openedByCoachId: team.coachId!,
    status: 'OPEN' as const,
    rounds: Object.freeze([]),
  }
  const next = updateGameWorld(world, { retentionNegotiations: [...Object.values(world.retentionNegotiationsById), negotiation] })
  return { ok: true, world: next, negotiation: next.retentionNegotiationsById[id]! }
}

export function submitRetentionOffer(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly terms: RetentionTermSet }): RetentionCommandResult {
  return submitRetentionOfferForControl(world, input, 'USER')
}

export function submitAiRetentionOffer(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly terms: RetentionTermSet }): RetentionCommandResult {
  return submitRetentionOfferForControl(world, input, 'AI')
}

function submitRetentionOfferForControl(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly terms: RetentionTermSet }, controller: 'USER' | 'AI'): RetentionCommandResult {
  const existing = world.retentionNegotiationsById[input.negotiationId]
  if (existing === undefined || existing.teamId !== input.teamId) return fail(world, 'STALE_NEGOTIATION')
  if (!isControlledBy(world, input.teamId, controller)) return fail(world, 'TEAM_NOT_USER_CONTROLLED')
  let normalized: RetentionTermSet
  try {
    normalized = freezeRetentionTerms(input.terms)
  } catch {
    return fail(world, 'STRUCTURAL_INVALIDITY')
  }
  if (existing.rounds.some((round) => round.actionId === input.actionId && sameTerms(round.offer, normalized))) return { ok: true, world, negotiation: existing }
  if (existing.rounds.some((round) => round.actionId === input.actionId) || existing.rounds.some((round) => round.clubAction?.actionId === input.actionId)) return fail(world, 'ACTION_NOT_AVAILABLE')
  const context = validateOpenContext(world, existing)
  if (context !== undefined) return expireAndFail(world, existing, context)
  if (!isOpenStatus(existing.status) || existing.rounds.length !== input.expectedRound) return fail(world, 'ACTION_NOT_AVAILABLE')
  const eligibility = assessRetentionEligibilityForControl(world, input.teamId, existing.predecessorContractId, normalized, controller)
  const blockers = eligibility.reasons.filter((reason) => reason !== 'OPEN_NEGOTIATION_EXISTS')
  if (blockers.length > 0) return fail(world, blockers[0]!)

  const roundIndex = existing.rounds.length + 1
  let rounds = [...existing.rounds]
  if (existing.status === 'PLAYER_COUNTERED') {
    const lastIndex = rounds.length - 1
    const last = rounds[lastIndex]!
    if (last.clubAction !== undefined) return fail(world, 'ACTION_NOT_AVAILABLE')
    rounds[lastIndex] = Object.freeze({ ...last, clubAction: Object.freeze({ actionId: `${input.actionId}:revise:${last.round}`, kind: 'REVISE_OFFER', respondedOn: world.currentDate, revisedTerms: normalized }) })
  }
  const derivation = deriveRetentionPlayerResponse(world, existing, normalized)
  const round: RetentionNegotiationRound = Object.freeze({ round: roundIndex, actionId: input.actionId, offer: normalized, submittedOn: world.currentDate, playerResponse: derivation.response })
  rounds.push(round)
  const status: RetentionNegotiationStatus = derivation.response.outcome === 'ACCEPTED' ? 'ACCEPTED' : derivation.response.outcome === 'COUNTERED' ? 'PLAYER_COUNTERED' : 'REJECTED'
  const updated: ContractRetentionNegotiation = {
    ...existing,
    status,
    currentTerms: derivation.response.counterTerms ?? normalized,
    ...(status === 'ACCEPTED' ? { acceptedTerms: normalized } : {}),
    rounds: Object.freeze(rounds),
    ...(status === 'REJECTED' ? { closedOn: world.currentDate, reopenOn: addDays(world.currentDate, RETENTION_COOLDOWN_DAYS) } : {}),
  }
  const next = updateGameWorld(world, { retentionNegotiations: [...Object.values(world.retentionNegotiationsById).filter((item) => item.id !== existing.id), updated] })
  return { ok: true, world: next, negotiation: next.retentionNegotiationsById[existing.id]! }
}

export function respondToRetentionCounter(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly action: 'ACCEPT_COUNTER' }): RetentionCommandResult {
  return respondToRetentionCounterForControl(world, input, 'USER')
}

export function respondToAiRetentionCounter(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly action: 'ACCEPT_COUNTER' }): RetentionCommandResult {
  return respondToRetentionCounterForControl(world, input, 'AI')
}

function respondToRetentionCounterForControl(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly action: 'ACCEPT_COUNTER' }, controller: 'USER' | 'AI'): RetentionCommandResult {
  const existing = world.retentionNegotiationsById[input.negotiationId]
  if (existing === undefined || existing.teamId !== input.teamId) return fail(world, 'STALE_NEGOTIATION')
  if (!isControlledBy(world, input.teamId, controller)) return fail(world, 'TEAM_NOT_USER_CONTROLLED')
  if (existing.rounds.some((round) => round.clubAction?.actionId === input.actionId && round.clubAction.kind === input.action)) return { ok: true, world, negotiation: existing }
  const context = validateOpenContext(world, existing)
  if (context !== undefined) return expireAndFail(world, existing, context)
  if (existing.status !== 'PLAYER_COUNTERED' || existing.rounds.length !== input.expectedRound || existing.currentTerms === undefined) return fail(world, 'ACTION_NOT_AVAILABLE')
  const rounds = [...existing.rounds]
  const lastIndex = rounds.length - 1
  const last = rounds[lastIndex]!
  if (last.clubAction !== undefined) return fail(world, 'ACTION_NOT_AVAILABLE')
  rounds[lastIndex] = Object.freeze({ ...last, clubAction: Object.freeze({ actionId: input.actionId, kind: 'ACCEPT_COUNTER', respondedOn: world.currentDate }) })
  const updated: ContractRetentionNegotiation = { ...existing, status: 'ACCEPTED', acceptedTerms: existing.currentTerms, rounds: Object.freeze(rounds) }
  const next = updateGameWorld(world, { retentionNegotiations: [...Object.values(world.retentionNegotiationsById).filter((item) => item.id !== existing.id), updated] })
  return { ok: true, world: next, negotiation: next.retentionNegotiationsById[existing.id]! }
}

export function withdrawRetentionNegotiation(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly actionId: string }): RetentionCommandResult {
  return withdrawRetentionNegotiationForControl(world, input, 'USER')
}

export function withdrawAiRetentionNegotiation(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly actionId: string }): RetentionCommandResult {
  return withdrawRetentionNegotiationForControl(world, input, 'AI')
}

function withdrawRetentionNegotiationForControl(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly actionId: string }, controller: 'USER' | 'AI'): RetentionCommandResult {
  const existing = world.retentionNegotiationsById[input.negotiationId]
  if (existing === undefined || existing.teamId !== input.teamId) return fail(world, 'STALE_NEGOTIATION')
  if (!isControlledBy(world, input.teamId, controller)) return fail(world, 'TEAM_NOT_USER_CONTROLLED')
  if (existing.status === 'WITHDRAWN' && existing.closingActionId === input.actionId) return { ok: true, world, negotiation: existing }
  const context = validateOpenContext(world, existing)
  if (context !== undefined) return expireAndFail(world, existing, context)
  if (!isOpenStatus(existing.status)) return fail(world, 'ACTION_NOT_AVAILABLE')
  const rounds = [...existing.rounds]
  if (existing.status === 'PLAYER_COUNTERED' && rounds.length > 0) {
    const lastIndex = rounds.length - 1
    const last = rounds[lastIndex]!
    if (last.clubAction !== undefined) return fail(world, 'ACTION_NOT_AVAILABLE')
    rounds[lastIndex] = Object.freeze({ ...last, clubAction: Object.freeze({ actionId: input.actionId, kind: 'WITHDRAW', respondedOn: world.currentDate }) })
  }
  const updated: ContractRetentionNegotiation = { ...existing, status: 'WITHDRAWN', closedOn: world.currentDate, closingActionId: input.actionId, reopenOn: addDays(world.currentDate, RETENTION_COOLDOWN_DAYS), rounds: Object.freeze(rounds) }
  const next = updateGameWorld(world, { retentionNegotiations: [...Object.values(world.retentionNegotiationsById).filter((item) => item.id !== existing.id), updated] })
  return { ok: true, world: next, negotiation: next.retentionNegotiationsById[existing.id]! }
}

export function deriveRetentionPlayerResponse(world: GameWorld, negotiation: Pick<ContractRetentionNegotiation, 'teamId' | 'playerId' | 'predecessorContractId'>, offer: RetentionTermSet): RetentionResponseDerivation {
  const predecessor = world.contractsById[negotiation.predecessorContractId]!
  const salaryReference = getContractYearCompensation(predecessor, world.currentDate).cashSalary || predecessor.compensation.annualSalary
  const targetSalary = Number.isSafeInteger(salaryReference) && salaryReference > 0 ? salaryReference : 1
  const securityAdjustment = retentionSecurityAdjustment(offer)
  const preferences = derivePlayerPreferenceFactors(world, negotiation.teamId, negotiation.playerId, offer.role)
  const factors = Object.freeze({
    salary: offer.salary / targetSalary,
    termSecurity: 1 + securityAdjustment + retentionIncentiveValueAdjustment(offer) + (offer.clauses?.some((clause) => clause.type === 'TRADE_CONSENT_REQUIRED') ? 0.02 : 0),
    roleOpportunity: preferences.roleOpportunity,
    morale: preferences.morale,
    relationship: preferences.relationship,
    clubContext: 1,
  })
  const weights = RETENTION_RESPONSE_CALIBRATION.weights
  const compositeScore = Object.keys(weights).reduce((total, key) => total + weights[key as keyof typeof weights] * factors[key as keyof typeof factors], 0)
  const salaryRatio = factors.salary + securityAdjustment
  const reasons: RetentionResponseReasonCode[] = factors.salary < RETENTION_RESPONSE_CALIBRATION.acceptedEconomicRatio ? ['SALARY_BELOW_EXPECTATION'] : ['SALARY_ACCEPTABLE']
  if (offer.options?.some((option) => option.type === 'PLAYER')) reasons.push('PLAYER_OPTION_INCREASES_SECURITY')
  if (offer.options?.some((option) => option.type === 'TEAM')) reasons.push('TEAM_OPTION_REDUCES_SECURITY')
  const specifiedGuaranteeRatio = offer.guarantees === undefined || offer.guarantees.length === 0
    ? undefined
    : offer.guarantees.reduce((sum, item) => sum + item.guaranteedAmount / offer.salary, 0) / offer.guarantees.length
  if (specifiedGuaranteeRatio !== undefined && specifiedGuaranteeRatio > 0.5) reasons.push('GUARANTEE_INCREASES_SECURITY')
  if (specifiedGuaranteeRatio !== undefined && specifiedGuaranteeRatio < 0.5) reasons.push('GUARANTEE_REDUCES_SECURITY')
  if ((offer.incentives?.length ?? 0) > 0) reasons.push('INCENTIVE_ADDS_CONTINGENT_VALUE')
  if (offer.clauses?.some((clause) => clause.type === 'TRADE_CONSENT_REQUIRED')) reasons.push('TRADE_CONSENT_ADDS_PLAYER_CONTROL')
  reasons.push(...preferences.reasonCodes)
  const origin = world.playerRepresentations.some((item) => item.playerId === negotiation.playerId) ? 'AGENT' : 'PLAYER'
  if (salaryRatio >= RETENTION_RESPONSE_CALIBRATION.acceptedEconomicRatio && compositeScore >= RETENTION_RESPONSE_CALIBRATION.acceptedScore) {
    return Object.freeze({ response: Object.freeze({ outcome: 'ACCEPTED', respondedOn: world.currentDate, origin, reasonCodes: Object.freeze(reasons) }), compositeScore, factors })
  }
  if (salaryRatio >= RETENTION_RESPONSE_CALIBRATION.counterEconomicRatio && salaryRatio < RETENTION_RESPONSE_CALIBRATION.acceptedEconomicRatio) {
    const counterTerms = createRetentionCounter(world, negotiation, offer, targetSalary)
    if (counterTerms !== undefined) {
      const representation = world.playerRepresentations.find((item) => item.playerId === negotiation.playerId)
      if (origin === 'AGENT' && representation !== undefined && world.agentsById[representation.agentId] !== undefined) reasons.push('AGENT_PUSHING_HIGHER_TERMS')
      return Object.freeze({ response: Object.freeze({ outcome: 'COUNTERED', respondedOn: world.currentDate, origin, counterTerms, reasonCodes: Object.freeze(reasons) }), compositeScore, factors })
    }
  }
  return Object.freeze({ response: Object.freeze({ outcome: 'REJECTED', respondedOn: world.currentDate, origin, reasonCodes: Object.freeze(reasons) }), compositeScore, factors })
}

interface RetentionPlayerPreferenceFactors {
  readonly roleOpportunity: number
  readonly morale: number
  readonly relationship: number
  readonly reasonCodes: readonly RetentionResponseReasonCode[]
}

/** Uses only recorded player morale, an existing active role promise, and a direct player-to-head-coach relationship. */
function derivePlayerPreferenceFactors(world: GameWorld, teamId: TeamId, playerId: ContractRetentionNegotiation['playerId'], offeredRole: RetentionTermSet['role']): RetentionPlayerPreferenceFactors {
  const team = world.teams[teamId]
  const player = world.players[playerId]
  const rolePromise = Object.values(world.rolePromisesById)
    .filter((item) => item.playerId === playerId && item.teamOrganizationId === team?.organizationId && item.status === 'ACTIVE')
    .sort((left, right) => right.acceptedOn.localeCompare(left.acceptedOn) || left.id.localeCompare(right.id))[0]
  let roleOpportunity = 1
  const reasonCodes: RetentionResponseReasonCode[] = []
  if (offeredRole !== undefined && rolePromise !== undefined) {
    const offeredRank = retentionRoleRank(offeredRole)
    const expectedRank = retentionRoleRank(rolePromise.role)
    if (offeredRank > expectedRank) {
      roleOpportunity += RETENTION_RESPONSE_CALIBRATION.roleFitAdjustment
      reasonCodes.push('ROLE_IMPROVEMENT')
    } else if (offeredRank < expectedRank) {
      roleOpportunity -= RETENTION_RESPONSE_CALIBRATION.roleFitAdjustment
      reasonCodes.push('ROLE_BELOW_EXPECTATION')
    } else {
      reasonCodes.push('ROLE_ACCEPTABLE')
    }
  }

  const moraleValue = world.moraleByPersonId[playerId]?.value
  const morale = moraleValue === undefined
    ? 1
    : 1 + ((moraleValue - 50) / 50) * RETENTION_RESPONSE_CALIBRATION.moraleAdjustment
  if (moraleValue !== undefined && moraleValue < 40) reasonCodes.push('LOW_MORALE')
  else if (moraleValue !== undefined && moraleValue > 60) reasonCodes.push('MORALE_SUPPORTS_RETENTION')

  const coach = team?.coachId === undefined ? undefined : world.coaches[team.coachId]
  const sourceId = player?.personId ?? playerId
  const relationshipValue = coach === undefined ? undefined : world.relationshipsByKey[relationshipKey(sourceId, coach.personId)]?.value
  const relationship = relationshipValue === undefined
    ? 1
    : 1 + (relationshipValue / 100) * RETENTION_RESPONSE_CALIBRATION.coachRelationshipAdjustment
  if (relationshipValue !== undefined && relationshipValue > 20) reasonCodes.push('POSITIVE_COACH_RELATIONSHIP')
  if (relationshipValue !== undefined && relationshipValue < -20) reasonCodes.push('NEGATIVE_COACH_RELATIONSHIP')

  return Object.freeze({ roleOpportunity, morale, relationship, reasonCodes: Object.freeze(reasonCodes) })
}

function retentionRoleRank(role: NonNullable<RetentionTermSet['role']>): number {
  return role === 'DEPTH' ? 0 : role === 'ROTATION' ? 1 : role === 'STARTER' ? 2 : 3
}

/** Daily date/status invalidation. It never repairs rosters or transfers an agreement. */
export function expireStaleRetentionNegotiations(world: GameWorld): GameWorld {
  let changed = false
  const negotiations = Object.values(world.retentionNegotiationsById).map((item) => {
    if (!isOpenStatus(item.status)) return item
    const reason = validateOpenContext(world, item)
    if (reason === undefined) return item
    changed = true
    return Object.freeze({ ...item, status: 'EXPIRED' as const, closedOn: world.currentDate, terminalReason: reason })
  })
  return changed ? updateGameWorld(world, { retentionNegotiations: negotiations }) : world
}

export function derivedRetentionStatus(world: GameWorld, negotiation: ContractRetentionNegotiation): { readonly status: RetentionNegotiationStatus; readonly terminalReason?: ContractRetentionNegotiation['terminalReason'] } {
  if (!isOpenStatus(negotiation.status)) return { status: negotiation.status, ...(negotiation.terminalReason === undefined ? {} : { terminalReason: negotiation.terminalReason }) }
  const reason = validateOpenContext(world, negotiation)
  return reason === undefined ? { status: negotiation.status } : { status: 'EXPIRED', terminalReason: reason }
}

function createRetentionCounter(world: GameWorld, negotiation: Pick<ContractRetentionNegotiation, 'teamId' | 'playerId' | 'predecessorContractId'>, offer: RetentionTermSet, targetSalary: number): RetentionTermSet | undefined {
  const agentId = world.playerRepresentations.find((item) => item.playerId === negotiation.playerId)?.agentId
  const agent = agentId === undefined ? undefined : world.agentsById[agentId]
  const baseSalary = Math.max(offer.salary, targetSalary)
  let salary = baseSalary
  let agentFee = offer.agentFee
  if (agent !== undefined) {
    const base = { id: 'retention-counter', organizationId: world.teams[negotiation.teamId]!.organizationId, teamId: negotiation.teamId, playerId: negotiation.playerId, status: 'OPEN' as const, salary: baseSalary, years: offer.years, ...(offer.role === undefined ? {} : { role: offer.role }), ...(offer.agentFee === undefined ? {} : { agentFee: offer.agentFee }), round: 1 }
    const counter = agentCounter(base as ContractNegotiation, agent)
    if ('salary' in counter && counter.salary !== undefined) salary = counter.salary
    agentFee = ('agentFee' in counter ? counter.agentFee : undefined) ?? offer.agentFee
  }
  if (salary > 100_000_000 || (agentFee !== undefined && agentFee > 100_000_000)) return undefined
  const options = offer.options?.map((option) => ({ ...option }))
  const guarantees = offer.guarantees?.map((guarantee) => ({ ...guarantee }))
  const incentives = offer.incentives?.map((incentive) => ({ ...incentive }))
  let clauses = offer.clauses?.map((clause) => ({ ...clause }))
  const teamOption = options?.findIndex((option) => option.type === 'TEAM') ?? -1
  if (teamOption >= 0) options![teamOption] = { year: options![teamOption]!.year, type: 'PLAYER', decisionAuthority: 'PLAYER' }
  else {
    const partialGuarantee = guarantees?.findIndex((guarantee) => guarantee.guaranteedAmount < offer.salary) ?? -1
    if (partialGuarantee >= 0) guarantees![partialGuarantee] = { ...guarantees![partialGuarantee]!, guaranteedAmount: salary }
    else {
      const incentiveIndex = incentives?.findIndex((incentive) => incentive.amount < 100_000_000) ?? -1
      if (incentiveIndex >= 0) incentives![incentiveIndex] = { ...incentives![incentiveIndex]!, amount: Math.min(100_000_000, incentives![incentiveIndex]!.amount + Math.max(1, Math.floor(incentives![incentiveIndex]!.amount * 0.1))) }
      else if (clauses === undefined || clauses.length === 0) clauses = [{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }]
    }
  }
  return freezeRetentionTerms({ salary, years: offer.years, ...(offer.role === undefined ? {} : { role: offer.role }), ...(agentFee === undefined ? {} : { agentFee, agentFeePayer: 'CLUB' }), ...(options === undefined ? {} : { options }), ...(guarantees === undefined ? {} : { guarantees }), ...(incentives === undefined ? {} : { incentives }), ...(clauses === undefined ? {} : { clauses }) })
}

function retentionIncentiveValueAdjustment(terms: RetentionTermSet): number {
  const amountRatio = (terms.incentives ?? []).reduce((sum, incentive) => sum + incentive.amount / terms.salary, 0) / terms.years
  return Math.min(0.02, amountRatio * 0.01)
}

function retentionSecurityAdjustment(terms: RetentionTermSet): number {
  const optionAdjustment = (terms.options ?? []).reduce((sum, option) => sum + (option.type === 'PLAYER' ? RETENTION_RESPONSE_CALIBRATION.optionSecurityAdjustment : option.type === 'TEAM' ? -RETENTION_RESPONSE_CALIBRATION.optionSecurityAdjustment : 0), 0) / terms.years
  const guaranteeAdjustment = (terms.guarantees ?? []).reduce((sum, guarantee) => sum + ((guarantee.guaranteedAmount / terms.salary) - 0.5) * RETENTION_RESPONSE_CALIBRATION.guaranteeSecurityAdjustment, 0) / terms.years
  const maximum = RETENTION_RESPONSE_CALIBRATION.optionSecurityAdjustment + RETENTION_RESPONSE_CALIBRATION.guaranteeSecurityAdjustment
  return Math.max(-maximum, Math.min(maximum, optionAdjustment + guaranteeAdjustment))
}

function applicableSalaryRules(world: GameWorld, teamId: TeamId, date: GameDate) {
  return Object.values(world.seasons).filter((season) => season.startDate <= date && date <= season.endDate
    && (season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(teamId))
    .map((season) => world.salaryRulesBySeasonId[season.id]).filter((rules): rules is NonNullable<typeof rules> => rules !== undefined)
}

function validateOpenContext(world: GameWorld, negotiation: ContractRetentionNegotiation): ContractRetentionNegotiation['terminalReason'] | undefined {
  const contract = world.contractsById[negotiation.predecessorContractId]
  if (contract === undefined) return 'PREDECESSOR_TEAM_CHANGED'
  if (contract.teamId !== negotiation.teamId) return 'PREDECESSOR_TEAM_CHANGED'
  if (contract.termination?.reason === 'released') return 'PREDECESSOR_RELEASED'
  if (getPlayerContractStatus(contract, world.currentDate) === 'terminated') return 'PREDECESSOR_TERMINATED'
  if (getPlayerContractStatus(contract, world.currentDate) === 'expired') return 'PREDECESSOR_EXPIRED'
  const window = [...new Set(Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(negotiation.teamId) && world.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike').map((competition) => competition.rules.retentionWindowDaysBeforeExpiry))]
  if (window.length !== 1 || addDays(world.currentDate, window[0]!) < contract.term.expiresOn) return 'RETENTION_WINDOW_CLOSED'
  if (!world.teams[negotiation.teamId]?.rosterPlayerIds.includes(negotiation.playerId)
    || assessActiveContractRosterIntegrity(world, negotiation.playerId) !== 'VALID') return 'ROSTER_OR_CONTRACT_INTEGRITY_CHANGED'
  if (hasContinuousContractSuccessor(world, contract.id)) return 'CONTINUOUS_SUCCESSOR_EXISTS'
  return undefined
}

function latestCooldown(world: GameWorld, teamId: TeamId, playerId: ContractRetentionNegotiation['playerId'], contractId: ContractId): ContractRetentionNegotiation | undefined {
  return Object.values(world.retentionNegotiationsById).filter((item) => item.teamId === teamId && item.playerId === playerId && item.predecessorContractId === contractId && (item.status === 'REJECTED' || item.status === 'WITHDRAWN'))
    .sort((a, b) => (b.closedOn ?? '').localeCompare(a.closedOn ?? '') || b.id.localeCompare(a.id))[0]
}

function sameTerms(left: RetentionTermSet, right: RetentionTermSet): boolean {
  return left.salary === right.salary && left.years === right.years && left.role === right.role && left.agentFee === right.agentFee && left.agentFeePayer === right.agentFeePayer && JSON.stringify(left.options ?? []) === JSON.stringify(right.options ?? []) && JSON.stringify(left.guarantees ?? []) === JSON.stringify(right.guarantees ?? []) && JSON.stringify(left.incentives ?? []) === JSON.stringify(right.incentives ?? []) && JSON.stringify(left.clauses ?? []) === JSON.stringify(right.clauses ?? [])
}
function isOpenStatus(status: RetentionNegotiationStatus): boolean { return status === 'OPEN' || status === 'CLUB_OFFERED' || status === 'PLAYER_COUNTERED' }
function eligibility(contractId: ContractId, reasons: readonly RetentionEligibilityReason[]): RetentionEligibility { return Object.freeze({ eligible: false, reasons: Object.freeze([...reasons]), predecessorContractId: contractId }) }
function fail(world: GameWorld, reason: RetentionEligibilityReason): RetentionCommandResult { return { ok: false, world, reason } }
function expireAndFail(world: GameWorld, item: ContractRetentionNegotiation, reason: NonNullable<ContractRetentionNegotiation['terminalReason']>): RetentionCommandResult {
  const expired = { ...item, status: 'EXPIRED' as const, closedOn: world.currentDate, terminalReason: reason }
  const next = updateGameWorld(world, { retentionNegotiations: [...Object.values(world.retentionNegotiationsById).filter((candidate) => candidate.id !== item.id), expired] })
  return { ok: false, world: next, reason: 'STALE_NEGOTIATION' }
}

function calendarDayNumber(value: GameDate): number {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year!, month! - 1, day!)
  date.setUTCHours(0, 0, 0, 0)
  return Math.floor(date.getTime() / 86_400_000)
}

function isControlledBy(world: GameWorld, teamId: TeamId, controller: 'USER' | 'AI'): boolean {
  const coachId = world.teams[teamId]?.coachId
  return coachId !== undefined && (controller === 'USER' ? coachId === world.userCoachId : coachId !== world.userCoachId)
}
