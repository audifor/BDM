import { parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, ContractId, CoachId, OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { NegotiationRole, NegotiationTermSet } from '@/domain/market'

export type RetentionNegotiationStatus = 'OPEN' | 'CLUB_OFFERED' | 'PLAYER_COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
export type RetentionResponseReasonCode =
  | 'SALARY_BELOW_EXPECTATION'
  | 'SALARY_ACCEPTABLE'
  | 'WANTS_MORE_SECURITY'
  | 'TERM_TOO_LONG'
  | 'ROLE_BELOW_EXPECTATION'
  | 'ROLE_ACCEPTABLE'
  | 'LOW_MORALE'
  | 'POSITIVE_RELATIONSHIP'
  | 'NEGATIVE_RELATIONSHIP'
  | 'AGENT_PUSHING_HIGHER_TERMS'
  | 'PLAYER_OPTION_INCREASES_SECURITY'
  | 'TEAM_OPTION_REDUCES_SECURITY'
  | 'GUARANTEE_INCREASES_SECURITY'
  | 'GUARANTEE_REDUCES_SECURITY'
  | 'INCENTIVE_ADDS_CONTINGENT_VALUE'
  | 'TRADE_CONSENT_ADDS_PLAYER_CONTROL'
  | 'ROLE_IMPROVEMENT'
  | 'MORALE_SUPPORTS_RETENTION'
  | 'POSITIVE_COACH_RELATIONSHIP'
  | 'NEGATIVE_COACH_RELATIONSHIP'

export interface RetentionTermSet extends NegotiationTermSet {
  readonly agentFeePayer?: 'CLUB'
  readonly options?: readonly ContractOptionProposal[]
  readonly guarantees?: readonly ContractGuaranteeProposal[]
  readonly incentives?: readonly ContractIncentiveProposal[]
  readonly clauses?: readonly ContractClauseProposal[]
}

export interface ContractOptionProposal {
  readonly year: number
  readonly type: 'TEAM' | 'PLAYER' | 'MUTUAL'
  readonly decisionAuthority: 'TEAM' | 'PLAYER' | 'BOTH'
}

/** A proposed guaranteed amount in one contract year; omission means unspecified. */
export interface ContractGuaranteeProposal {
  readonly year: number
  readonly guaranteedAmount: number
}

/** A nonbinding games-played bonus definition; evaluation and payment are deferred. */
export interface ContractIncentiveProposal {
  readonly type: 'GAMES_PLAYED'
  readonly competitionId: CompetitionId
  readonly contractYear: number
  readonly minimumGamesPlayed: number
  readonly amount: number
}

/** Proposed player-held consent for any future trade; it grants no current right. */
export interface ContractClauseProposal {
  readonly type: 'TRADE_CONSENT_REQUIRED'
  readonly decisionAuthority: 'PLAYER'
}

export interface RetentionPlayerResponse {
  readonly outcome: 'ACCEPTED' | 'COUNTERED' | 'REJECTED'
  readonly respondedOn: GameDate
  readonly origin: 'PLAYER' | 'AGENT'
  readonly counterTerms?: RetentionTermSet
  readonly reasonCodes: readonly RetentionResponseReasonCode[]
}

export interface RetentionClubAction {
  readonly actionId: string
  readonly kind: 'ACCEPT_COUNTER' | 'REVISE_OFFER' | 'WITHDRAW'
  readonly respondedOn: GameDate
  readonly revisedTerms?: RetentionTermSet
}

export interface RetentionNegotiationRound {
  readonly round: number
  readonly actionId: string
  readonly offer: RetentionTermSet
  readonly submittedOn: GameDate
  readonly playerResponse: RetentionPlayerResponse
  readonly clubAction?: RetentionClubAction
}

/** Nonbinding retention terms and evidence; no contract/finance/governance result is recorded here. */
export interface ContractRetentionNegotiation {
  readonly id: string
  readonly openingActionId: string
  readonly teamId: TeamId
  readonly organizationId: OrganizationId
  readonly playerId: PlayerId
  readonly predecessorContractId: ContractId
  readonly openedOn: GameDate
  readonly openedByCoachId: CoachId
  readonly status: RetentionNegotiationStatus
  readonly currentTerms?: RetentionTermSet
  readonly acceptedTerms?: RetentionTermSet
  readonly execution?: { readonly status: 'SIGNED'; readonly contractId: ContractId; readonly signedOn: GameDate; readonly governanceDecisionId: string }
  readonly rounds: readonly RetentionNegotiationRound[]
  readonly closedOn?: GameDate
  readonly closingActionId?: string
  readonly reopenOn?: GameDate
  readonly terminalReason?: 'PREDECESSOR_EXPIRED' | 'PREDECESSOR_TERMINATED' | 'PREDECESSOR_RELEASED' | 'PREDECESSOR_TEAM_CHANGED' | 'ROSTER_OR_CONTRACT_INTEGRITY_CHANGED' | 'RETENTION_WINDOW_CLOSED' | 'CONTINUOUS_SUCCESSOR_EXISTS'
}

export function retentionLifecycleKey(teamId: TeamId | string, playerId: PlayerId | string, predecessorContractId: ContractId | string): string {
  return [teamId, playerId, predecessorContractId].map(encodeURIComponent).join(':')
}

export function retentionNegotiationIdFor(teamId: TeamId | string, playerId: PlayerId | string, predecessorContractId: ContractId | string, openingActionId: string): string {
  if (openingActionId.trim() === '') throw new TypeError('Retention opening action id is required')
  return `retention:${retentionLifecycleKey(teamId, playerId, predecessorContractId)}:${encodeURIComponent(openingActionId)}`
}

export function createRetentionNegotiation(input: ContractRetentionNegotiation): ContractRetentionNegotiation {
  if (input.id !== retentionNegotiationIdFor(input.teamId, input.playerId, input.predecessorContractId, input.openingActionId)) throw new TypeError('Retention negotiation id is not canonical')
  if (input.openingActionId.trim() === '' || input.openedByCoachId.trim() === '') throw new TypeError('Retention negotiation identity is incomplete')
  const openedOn = parseGameDate(input.openedOn)
  const closedOn = input.closedOn === undefined ? undefined : parseGameDate(input.closedOn)
  if (input.closingActionId !== undefined && input.closingActionId.trim() === '') throw new TypeError('Retention closing action id is invalid')
  const reopenOn = input.reopenOn === undefined ? undefined : parseGameDate(input.reopenOn)
  const execution = input.execution === undefined ? undefined : Object.freeze({ ...input.execution, signedOn: parseGameDate(input.execution.signedOn) })
  if (['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(input.status) !== (closedOn !== undefined)) throw new TypeError('Retention terminal state and close date must agree')
  if (['REJECTED', 'WITHDRAWN'].includes(input.status) !== (reopenOn !== undefined)) throw new TypeError('Only rejected or withdrawn retention negotiations have a cooldown date')
  if ((input.status === 'ACCEPTED') !== (input.acceptedTerms !== undefined)) throw new TypeError('Accepted retention terms must agree with negotiation status')
  if (execution !== undefined && (input.status !== 'ACCEPTED' || input.acceptedTerms === undefined || execution.contractId.trim() === '' || execution.governanceDecisionId.trim() === '')) throw new TypeError('Retention execution evidence must identify a signed accepted agreement')
  if (input.status === 'PLAYER_COUNTERED' && input.currentTerms === undefined) throw new TypeError('Player counter requires current terms')
  const actionIds = [input.openingActionId, ...input.rounds.flatMap((round) => [round.actionId, ...(round.clubAction === undefined ? [] : [round.clubAction.actionId])])]
  if (input.closingActionId !== undefined && !actionIds.includes(input.closingActionId)) actionIds.push(input.closingActionId)
  if (input.rounds.some((round, index) => round.round !== index + 1 || round.actionId.trim() === '' || round.submittedOn < openedOn) || actionIds.some((id) => id.trim() === '') || new Set(actionIds).size !== actionIds.length) throw new TypeError('Retention negotiation rounds or action identities are invalid')
  if (!['OPEN', 'CLUB_OFFERED', 'PLAYER_COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(input.status)) throw new TypeError('Retention negotiation status is invalid')
  const rounds = Object.freeze(input.rounds.map((round) => Object.freeze({
    ...round,
    submittedOn: parseGameDate(round.submittedOn),
    offer: freezeRetentionTerms(round.offer),
    playerResponse: Object.freeze({ ...round.playerResponse, respondedOn: parseGameDate(round.playerResponse.respondedOn), reasonCodes: Object.freeze([...round.playerResponse.reasonCodes]), ...(round.playerResponse.counterTerms === undefined ? {} : { counterTerms: freezeRetentionTerms(round.playerResponse.counterTerms) }) }),
    ...(round.clubAction === undefined ? {} : { clubAction: Object.freeze({ ...round.clubAction, respondedOn: parseGameDate(round.clubAction.respondedOn), ...(round.clubAction.revisedTerms === undefined ? {} : { revisedTerms: freezeRetentionTerms(round.clubAction.revisedTerms) }) }) }),
  })))
  return Object.freeze({ ...input, openedOn, ...(closedOn === undefined ? {} : { closedOn }), ...(reopenOn === undefined ? {} : { reopenOn }), ...(execution === undefined ? {} : { execution }), rounds, ...(input.currentTerms === undefined ? {} : { currentTerms: freezeRetentionTerms(input.currentTerms) }), ...(input.acceptedTerms === undefined ? {} : { acceptedTerms: freezeRetentionTerms(input.acceptedTerms) }) })
}

export function freezeRetentionTerms(terms: RetentionTermSet): RetentionTermSet {
  if (!Number.isSafeInteger(terms.salary) || terms.salary < 1 || terms.salary > 100_000_000) throw new RangeError('Retention annual salary must be from 1 to 100000000')
  if (!Number.isSafeInteger(terms.years) || terms.years < 1 || terms.years > 20) throw new RangeError('Retention years must be from 1 to 20')
  if (terms.agentFee !== undefined && (!Number.isSafeInteger(terms.agentFee) || terms.agentFee < 0 || terms.agentFee > 100_000_000)) throw new RangeError('Retention agent fee is invalid')
  if (terms.agentFeePayer !== undefined && (terms.agentFee === undefined || terms.agentFeePayer !== 'CLUB')) throw new TypeError('Retention agent fee payer must be CLUB when a fee is present')
  if (terms.role !== undefined && !(['STAR', 'STARTER', 'ROTATION', 'DEPTH'] satisfies readonly NegotiationRole[]).includes(terms.role)) throw new TypeError('Retention role is invalid')
  const options = terms.options?.map((option) => {
    if (!Number.isSafeInteger(option.year) || option.year < 1 || option.year > terms.years) throw new RangeError('Retention option year must be within the proposed contract term')
    if (!((option.type === 'TEAM' && option.decisionAuthority === 'TEAM') || (option.type === 'PLAYER' && option.decisionAuthority === 'PLAYER') || (option.type === 'MUTUAL' && option.decisionAuthority === 'BOTH'))) throw new TypeError('Retention option type and decision authority do not agree')
    return Object.freeze({ year: option.year, type: option.type, decisionAuthority: option.decisionAuthority }) as ContractOptionProposal
  }).sort((left, right) => left.year - right.year)
  if (options !== undefined && new Set(options.map((option) => option.year)).size !== options.length) throw new TypeError('A proposed contract year may have only one option')
  const guarantees = terms.guarantees?.map((guarantee) => {
    if (!Number.isSafeInteger(guarantee.year) || guarantee.year < 1 || guarantee.year > terms.years) throw new RangeError('Retention guarantee year must be within the proposed contract term')
    if (!Number.isSafeInteger(guarantee.guaranteedAmount) || guarantee.guaranteedAmount < 0 || guarantee.guaranteedAmount > terms.salary) throw new RangeError('Retention guaranteed amount must be from zero to the proposed annual salary')
    return Object.freeze({ year: guarantee.year, guaranteedAmount: guarantee.guaranteedAmount })
  }).sort((left, right) => left.year - right.year)
  if (guarantees !== undefined && new Set(guarantees.map((guarantee) => guarantee.year)).size !== guarantees.length) throw new TypeError('A proposed contract year may have only one guarantee term')
  const incentives = terms.incentives?.map((incentive) => {
    if (incentive.type !== 'GAMES_PLAYED') throw new TypeError('Retention incentive type is unsupported')
    if (!Number.isSafeInteger(incentive.contractYear) || incentive.contractYear < 1 || incentive.contractYear > terms.years) throw new RangeError('Retention incentive contract year must be within the proposed contract term')
    if (!Number.isSafeInteger(incentive.minimumGamesPlayed) || incentive.minimumGamesPlayed < 1 || incentive.minimumGamesPlayed > 200) throw new RangeError('Games-played incentive threshold must be from 1 to 200')
    if (!Number.isSafeInteger(incentive.amount) || incentive.amount < 1 || incentive.amount > 100_000_000) throw new RangeError('Retention incentive amount must be from 1 to 100000000')
    if (typeof incentive.competitionId !== 'string' || incentive.competitionId.length === 0) throw new TypeError('Retention incentive competition is required')
    return Object.freeze({ type: incentive.type, competitionId: incentive.competitionId, contractYear: incentive.contractYear, minimumGamesPlayed: incentive.minimumGamesPlayed, amount: incentive.amount })
  }).sort((left, right) => left.contractYear - right.contractYear || left.competitionId.localeCompare(right.competitionId) || left.minimumGamesPlayed - right.minimumGamesPlayed)
  if (incentives !== undefined) {
    const keys = incentives.map((item) => `${item.type}:${item.competitionId}:${item.contractYear}:${item.minimumGamesPlayed}`)
    if (new Set(keys).size !== keys.length) throw new TypeError('Duplicate retention incentive trigger')
  }
  const clauses = terms.clauses?.map((clause) => {
    if (clause.type !== 'TRADE_CONSENT_REQUIRED' || clause.decisionAuthority !== 'PLAYER') throw new TypeError('Retention clause type or decision authority is unsupported')
    return Object.freeze({ type: clause.type, decisionAuthority: clause.decisionAuthority }) as ContractClauseProposal
  }).sort((left, right) => left.type.localeCompare(right.type))
  if (clauses !== undefined && new Set(clauses.map((clause) => clause.type)).size !== clauses.length) throw new TypeError('Duplicate retention clause')
  return Object.freeze({ salary: terms.salary, years: terms.years, ...(terms.role === undefined ? {} : { role: terms.role }), ...(terms.agentFee === undefined ? {} : { agentFee: terms.agentFee, agentFeePayer: 'CLUB' as const }), ...(options === undefined ? {} : { options: Object.freeze(options) }), ...(guarantees === undefined ? {} : { guarantees: Object.freeze(guarantees) }), ...(incentives === undefined ? {} : { incentives: Object.freeze(incentives) }), ...(clauses === undefined ? {} : { clauses: Object.freeze(clauses) }) })
}
