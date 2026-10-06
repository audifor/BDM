import { addDays, type GameDate } from '@/domain/date'
import { deriveGovernanceDecisionStatus, deriveGovernanceRequestStatus, resolveGovernanceDecisionRights } from '@/domain/governance'
import type { GameWorld } from '@/domain/world'
import { getPendingMediaOpportunities } from '@/domain/world'
import { getCurrentDraftPick } from '@/engine/draft'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { classifyCompetitionLifecycles } from './CompetitionLifecycleCoordinator'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { getEcosystemForTeam } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import type { ContractNegotiation } from '@/domain/market'
import { tradeNegotiationResponseReadiness } from '@/app/trades'
import { assessContractReviewOutlook, CONTRACT_REVIEW_HORIZON_DAYS } from '@/engine/clubNeeds'
import { derivedRetentionStatus } from '@/engine/contractRetention/ContractRetentionEngine'
import { injuryLifecycleStatus } from '@/domain/injury'
import { PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS } from '@/engine/injury/InjuryApplication'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'

export const SIMULATION_BREAKPOINT_LEVELS = ['BACKGROUND', 'INFO', 'IMPORTANT', 'ACTION_REQUIRED', 'BLOCKING'] as const
export type SimulationBreakpointLevel = typeof SIMULATION_BREAKPOINT_LEVELS[number]

export interface SimulationBreakpoint {
  readonly level: SimulationBreakpointLevel
  readonly reason: string
  readonly sourceKind: string
  readonly sourceId: string
  readonly effectiveDate?: GameDate
  readonly deadline?: GameDate
  readonly ownership: { readonly kind: 'USER_COACH' | 'USER_TEAM' | 'SYSTEM'; readonly coachId?: string; readonly teamId?: string }
  readonly route?: string
  readonly actionTarget?: Readonly<Record<string, string>>
  readonly diagnostic: string
  readonly orderingKey: string
}

export interface SimulationBreakpointInput extends Omit<SimulationBreakpoint, 'orderingKey'> {}

export interface SimulationBreakpointContext {
  /** Additional canonical application diagnostics, such as a command-specific lifecycle failure. */
  readonly additionalCandidates?: readonly SimulationBreakpointInput[]
}

export interface SimulationBreakpointResult {
  readonly mayAdvance: boolean
  readonly level: SimulationBreakpointLevel
  readonly breakpoint?: SimulationBreakpoint
  readonly candidates: readonly SimulationBreakpoint[]
}

const severity: Readonly<Record<SimulationBreakpointLevel, number>> = {
  BLOCKING: 0,
  ACTION_REQUIRED: 1,
  IMPORTANT: 2,
  INFO: 3,
  BACKGROUND: 4,
}

/** Read-only projection of durable subsystem state into one deterministic time-advance decision. */
export function evaluateSimulationBreakpoints(world: GameWorld, context: SimulationBreakpointContext = {}): SimulationBreakpointResult {
  const candidates: SimulationBreakpoint[] = []
  const userTeam = getUserTeam(world)

  for (const game of getGamesToday(world)) {
    if (game.status === 'scheduled' && userTeam !== undefined && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)) {
      candidates.push(candidate({
        level: 'ACTION_REQUIRED', reason: 'userGame', sourceKind: 'USER_GAME', sourceId: game.id,
        effectiveDate: game.date, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
        route: 'match', actionTarget: { gameId: game.id }, diagnostic: `User game ${game.id} is scheduled for today and needs an explicit match action.`,
      }))
    }
  }

  if (userTeam !== undefined) {
    for (const injury of Object.values(world.injuriesById).filter((item) => userTeam.rosterPlayerIds.includes(item.playerId) && injuryLifecycleStatus(item, world.currentDate) === 'RTP_REVIEW_DUE')) candidates.push(candidate({
      level: 'ACTION_REQUIRED', reason: 'returnToPlayReview', sourceKind: 'USER_RTP_REVIEW', sourceId: injury.id,
      effectiveDate: world.currentDate, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
      route: 'medical', actionTarget: { injuryId: injury.id, playerId: injury.playerId },
      diagnostic: `Return-to-Play review for injury ${injury.id} is due; clear the player or continue recovery before advancing.`,
    }))
    // MX0.2 Blocker A (human-team safety): the user's Team keeps an explicit PLAYABLE_MINIMUM_SAFETY decision (the
    // career-loop playable-minimum policy, see engine/injury/InjuryApplication). A structurally valid squad can still
    // be unable to dress five for today's Game; that is never an automatic repair and never a technical failure --
    // the same playable-minimum breakpoint stops the day so the user resolves it (normally through the Market, which
    // adds an available body).
    const userGameToday = userTeam.rosterPlayerIds.length < PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS
      ? undefined
      : getGamesToday(world).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))
    const userAvailableForGame = userGameToday === undefined ? undefined : getAvailablePlayersForCompetition(world, userTeam.id, userGameToday.competitionId, userGameToday.seasonId, userGameToday.date).length
    if (userTeam.rosterPlayerIds.length < PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS || (userAvailableForGame !== undefined && userAvailableForGame < PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS)) {
      const ecosystem = getEcosystemForTeam(world, userTeam.id)
      const marketSupported = ecosystem !== undefined && ecosystem.kind !== 'ncaaLike'
        && assessRoutedFreeAgentOfferIntelligence(world, userTeam.id).some((offer) => offer.outcome === 'FREE_AGENT_OFFER' && offer.contactReadiness === 'READY_TO_CONTACT')
      const marketClause = marketSupported ? ' and an affordable free agent is available' : ' and no supported affordable signing is available'
      candidates.push(candidate({
        level: marketSupported ? 'ACTION_REQUIRED' : 'BLOCKING', reason: 'minimumRoster', sourceKind: 'TEAM_ROSTER_MINIMUM', sourceId: userTeam.id,
        effectiveDate: world.currentDate, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
        ...(marketSupported ? { route: 'market', actionTarget: { teamId: userTeam.id } } : {}),
        diagnostic: userGameToday === undefined
          ? `User team ${userTeam.id} has ${userTeam.rosterPlayerIds.length} rostered players; at least five are required${marketClause}.`
          : `User team ${userTeam.id} has ${userAvailableForGame} available players for its Game on ${userGameToday.date}; at least five are required${marketClause}.`,
      }))
    }
    const contractReviewsDue = assessContractReviewOutlook(world, userTeam.id).reviews.filter((review) => review.status === 'REVIEW_REQUIRED'
      && (review.decision === undefined && review.expiresOn === addDays(world.currentDate, CONTRACT_REVIEW_HORIZON_DAYS)
        || review.decision === 'DEFER' && review.reviewAgainOn === world.currentDate))
    if (contractReviewsDue.length > 0) candidates.push(candidate({
      level: 'IMPORTANT', reason: 'contractReviewHorizon', sourceKind: 'USER_CONTRACT_REVIEW',
      sourceId: `${userTeam.id}:${world.currentDate}`, effectiveDate: world.currentDate,
      deadline: contractReviewsDue.map((review) => review.expiresOn).sort()[0],
      ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id }, route: 'contracts', actionTarget: { teamId: userTeam.id },
      diagnostic: `${contractReviewsDue.length} unresolved contract review${contractReviewsDue.length === 1 ? '' : 's'} entered the existing BS9 review horizon.`,
    }))
    for (const draft of Object.values(world.draftsById).filter((item) => item.status === 'inProgress')) {
      const pick = getCurrentDraftPick(world, draft.id)
      if (pick?.ownerTeamId === userTeam.id) candidates.push(candidate({
        level: 'ACTION_REQUIRED', reason: 'draftPick', sourceKind: 'USER_DRAFT_PICK', sourceId: pick.id,
        effectiveDate: world.currentDate, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
        route: 'draft', actionTarget: { draftId: draft.id, pickId: pick.id }, diagnostic: `Draft ${draft.id} is waiting for the user team to select a prospect.`,
      }))
    }
  }

  for (const media of getPendingMediaOpportunities(world, world.userCoachId)) candidates.push(candidate({
    level: 'ACTION_REQUIRED', reason: 'mediaOpportunity', sourceKind: 'MEDIA_OPPORTUNITY', sourceId: media.id,
    effectiveDate: media.gameDate, ownership: { kind: 'USER_COACH', coachId: world.userCoachId },
    route: 'media', actionTarget: { opportunityId: media.id }, diagnostic: `Media opportunity ${media.id} is still pending and must be answered or skipped.`,
  }))

  for (const offer of Object.values(world.coachJobOffersById).filter((item) => item.status === 'pending' && item.coachId === world.userCoachId)) candidates.push(candidate({
    level: 'ACTION_REQUIRED', reason: 'coachJobOffer', sourceKind: 'COACH_JOB_OFFER', sourceId: offer.id,
    effectiveDate: offer.createdOn, ownership: { kind: 'USER_COACH', coachId: world.userCoachId },
    route: 'coach', actionTarget: { offerId: offer.id }, diagnostic: `Coach job offer ${offer.id} is awaiting the user's response.`,
  }))

  if (userTeam !== undefined) {
    for (const negotiation of Object.values(world.retentionNegotiationsById).filter((item) => item.teamId === userTeam.id && item.execution?.status !== 'SIGNED')) {
      const status = derivedRetentionStatus(world, negotiation).status
      if (status !== 'PLAYER_COUNTERED' && status !== 'ACCEPTED') continue
      candidates.push(candidate({
        level: 'IMPORTANT', reason: status === 'PLAYER_COUNTERED' ? 'retentionCounter' : 'retentionAgreement',
        sourceKind: 'CONTRACT_RETENTION_NEGOTIATION', sourceId: negotiation.id,
        effectiveDate: world.currentDate, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
        route: 'contracts', actionTarget: { negotiationId: negotiation.id },
        diagnostic: status === 'PLAYER_COUNTERED'
          ? `Retention negotiation ${negotiation.id} has a player/agent counter for predecessor ${negotiation.predecessorContractId}; the user's response is available.`
          : `Retention negotiation ${negotiation.id} has agreed nonbinding terms for predecessor ${negotiation.predecessorContractId}; BS11D authorization and execution remain required.`,
      }))
    }
    for (const negotiation of Object.values(world.negotiationsById).filter((item) => item.organizationId === userTeam.organizationId && (item.status === 'CONTACTED' || item.status === 'OPEN' || item.status === 'COUNTERED' || item.status === 'ACCEPTED'))) candidates.push(candidate({
      // Formal counters and agreements are observable, but remain nonblocking until a signing UI exists.
      level: negotiation.status === 'COUNTERED' || negotiation.status === 'ACCEPTED' ? 'IMPORTANT' : 'INFO',
      reason: negotiation.status === 'COUNTERED' || negotiation.status === 'ACCEPTED' ? 'marketNegotiation' : negotiation.contactResponse === undefined ? 'marketNegotiationAwaitingExternalResponse' : 'marketContactResponse',
      sourceKind: 'MARKET_NEGOTIATION', sourceId: negotiation.id,
      ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
      route: 'market', actionTarget: { negotiationId: negotiation.id },
      diagnostic: negotiation.status === 'COUNTERED'
        ? `Market negotiation ${negotiation.id} has countered at ${negotiation.salary} per year for ${negotiation.years} years (round ${negotiation.round}); the user's decision is available.`
        : negotiation.status === 'ACCEPTED'
          ? acceptedSigningDiagnostic(world, negotiation, userTeam.id)
        : negotiation.status === 'CONTACTED'
          ? negotiation.contactResponse === undefined
            ? `Market contact ${negotiation.id} is waiting for a response before any formal offer exists.`
            : `Market contact ${negotiation.id} received ${negotiation.contactResponse.outcome === 'OPEN_TO_TALKS' ? 'a positive response' : 'a refusal'} on ${negotiation.contactResponse.respondedOn}; no formal offer exists.`
          : `Market negotiation ${negotiation.id} has a formal offer open and is waiting on an external player response.`,
    }))
    for (const negotiation of Object.values(world.tradeNegotiationsById).filter((item) => item.participantTeamIds.includes(userTeam.id) && (item.status === 'PROPOSED' || item.status === 'COUNTERED'))) {
      const revision = negotiation.revisions[negotiation.revisions.length - 1]!
      const alreadyDecided = negotiation.actions.some((action) => action.revisionId === revision.id && action.teamId === userTeam.id && (action.kind === 'ACCEPT' || action.kind === 'REJECT'))
      if (revision.proposedByTeamId === userTeam.id || alreadyDecided || tradeNegotiationResponseReadiness(world, negotiation, userTeam.id).status !== 'READY') continue
      candidates.push(candidate({
        level: 'ACTION_REQUIRED', reason: 'tradeNegotiationResponse', sourceKind: 'TRADE_NEGOTIATION', sourceId: negotiation.id,
        effectiveDate: world.currentDate, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
        route: 'trades', actionTarget: { negotiationId: negotiation.id, revisionId: revision.id },
        diagnostic: `Trade negotiation ${negotiation.id} has a current package revision awaiting the user team's accept, reject, or counter decision.`,
      }))
    }
  }

  candidates.push(...governanceCandidates(world))

  const primarySeason = world.seasons[world.currentSeasonId]
  if (primarySeason !== undefined && getNextUserGame(world) === undefined && isSeasonComplete(world, primarySeason.id) && getSeasonHistoryRecord(world, primarySeason.id) !== undefined) {
    candidates.push(candidate({
      level: 'ACTION_REQUIRED', reason: 'seasonComplete', sourceKind: 'SEASON_LIFECYCLE', sourceId: primarySeason.id,
      effectiveDate: primarySeason.endDate, ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam?.id },
      route: 'competition', actionTarget: { seasonId: primarySeason.id }, diagnostic: `Season ${primarySeason.id} is complete; Continue pauses at the season checkpoint.`,
    }))
  }

  for (const capability of classifyCompetitionLifecycles(world)) {
    if (capability.support !== 'UNSUPPORTED_FUTURE_LIFECYCLE' || !isSeasonComplete(world, capability.seasonId) || getSeasonHistoryRecord(world, capability.seasonId) === undefined) continue
    const season = world.seasons[capability.seasonId]!
    candidates.push(candidate({
      level: 'BLOCKING', reason: 'unsupportedCompetitionLifecycle', sourceKind: 'COMPETITION_LIFECYCLE', sourceId: capability.seasonId,
      effectiveDate: season.endDate, ownership: { kind: 'SYSTEM' }, route: 'competition',
      actionTarget: { competitionId: capability.competitionId, seasonId: capability.seasonId },
      diagnostic: `Competition ${capability.competitionId} has no supported future-season lifecycle after ${season.endDate}.`,
    }))
  }

  const pastScheduledGame = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date < world.currentDate).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0]
  if (pastScheduledGame !== undefined) candidates.push(candidate({
    level: 'BLOCKING', reason: 'scheduledGameInPast', sourceKind: 'SCHEDULE_INTEGRITY', sourceId: pastScheduledGame.id,
    effectiveDate: pastScheduledGame.date, ownership: { kind: 'SYSTEM' }, route: 'schedule', actionTarget: { gameId: pastScheduledGame.id },
    diagnostic: `Scheduled game ${pastScheduledGame.id} is already in the past and prevents a safe day transition.`,
  }))

  candidates.push(...(context.additionalCandidates ?? []).map(candidate))
  candidates.sort(compareBreakpoints)
  const breakpoint = candidates[0]
  const mayAdvance = breakpoint === undefined || (breakpoint.level !== 'ACTION_REQUIRED' && breakpoint.level !== 'BLOCKING')
  return { mayAdvance, level: breakpoint?.level ?? 'BACKGROUND', ...(breakpoint === undefined ? {} : { breakpoint }), candidates }
}

function acceptedSigningDiagnostic(world: GameWorld, negotiation: Extract<ContractNegotiation, { readonly salary: number }>, teamId: TeamId): string {
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  const institution = institutions.length === 1 ? institutions[0] : undefined
  if (institution === undefined) return `Market negotiation ${negotiation.id} agreed ${negotiation.salary} per year for ${negotiation.years} years, but its signing Governance institution is ${institutions.length === 0 ? 'unavailable' : 'ambiguous'}; the player is not yet signed.`
  const decision = institution === undefined ? undefined : Object.values(world.governanceDecisionsById).find((item) => item.institutionId === institution.id
    && item.decisionType === 'PLAYER_CONTRACT_SIGNING' && item.subject.kind === 'GENERIC' && item.subject.referenceId === negotiation.id)
  if (decision === undefined) return `Market negotiation ${negotiation.id} agreed ${negotiation.salary} per year for ${negotiation.years} years; no exact PLAYER_CONTRACT_SIGNING decision has been proposed, and the player is not yet signed.`
  const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id && event.effectiveOn <= world.currentDate)
  const status = deriveGovernanceDecisionStatus(events)
  if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN') return `Market negotiation ${negotiation.id} remains ACCEPTED but signing decision ${decision.id} is ${status}; the player is not signed.`
  const rights = resolveGovernanceDecisionRights({ decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: decision.proposedOn, bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) })
  if (rights.approverBodyIds.length === 0) return `Market negotiation ${negotiation.id} is not signed because decision ${decision.id} has no mapped PLAYER_CONTRACT_SIGNING approver authority.`
  const approved = new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  const missing = rights.approverBodyIds.filter((bodyId) => !approved.has(bodyId))
  if (missing.length === 0) return `Market negotiation ${negotiation.id} is approved by signing decision ${decision.id}; the user must still explicitly confirm signing and the player is not yet signed.`
  const requiredBodies = missing.length === 1 ? `body ${missing[0]}` : `bodies ${missing.join(', ')}`
  return `Market negotiation ${negotiation.id} is awaiting PLAYER_CONTRACT_SIGNING approval in decision ${decision.id} from required ${requiredBodies}; the player is not yet signed.`
}

function governanceCandidates(world: GameWorld): SimulationBreakpoint[] {
  const results: SimulationBreakpoint[] = []
  const date = world.currentDate
  for (const request of Object.values(world.governanceRequestsById)) {
    if (request.recipient.kind !== 'ACTOR' || request.recipient.actor.kind !== 'COACH' || request.recipient.actor.id !== world.userCoachId) continue
    const events = Object.values(world.governanceRequestEventsById).filter((event) => event.requestId === request.id && event.effectiveOn <= date)
    const status = deriveGovernanceRequestStatus(events)
    if (status !== 'ISSUED' && status !== 'ACKNOWLEDGED' && status !== 'ACCEPTED') continue
    results.push(candidate({
      // Governance has no current user workspace/action path for this breakpoint.
      level: 'IMPORTANT', reason: 'governanceRequest', sourceKind: 'GOVERNANCE_REQUEST', sourceId: request.id,
      effectiveDate: events.find((event) => event.kind === 'ISSUED')?.effectiveOn ?? date, ...(request.dueOn === undefined ? {} : { deadline: request.dueOn }),
      ownership: { kind: 'USER_COACH', coachId: world.userCoachId }, actionTarget: { requestId: request.id },
      diagnostic: `Governance request ${request.id} is addressed to the user coach${request.dueOn === undefined ? '' : ` and is due ${request.dueOn}`}.`,
    }))
  }

  for (const decision of Object.values(world.governanceDecisionsById)) {
    const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id && event.effectiveOn <= date)
    const status = deriveGovernanceDecisionStatus(events)
    if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN' || status === 'EXECUTED') continue
    const rights = resolveGovernanceDecisionRights({ decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: date, bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) })
    const activeUserBodies = new Set(Object.values(world.governanceAppointmentsById)
      .filter((appointment) => appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId && appointment.startedOn <= date && (appointment.endedOn === undefined || appointment.endedOn >= date))
      .map((appointment) => appointment.bodyId))
    const missingUserApprovals = rights.approverBodyIds.filter((bodyId) => activeUserBodies.has(bodyId) && !events.some((event) => event.kind === 'APPROVED' && event.bodyId === bodyId))
    if (missingUserApprovals.length === 0) continue
    results.push(candidate({
      // Preserve the attributable approval as a candidate; no current Governance resolver exists.
      level: 'IMPORTANT', reason: 'governanceApproval', sourceKind: 'GOVERNANCE_DECISION', sourceId: decision.id,
      effectiveDate: decision.proposedOn, ownership: { kind: 'USER_COACH', coachId: world.userCoachId }, actionTarget: { decisionId: decision.id, bodyId: missingUserApprovals[0]! },
      diagnostic: `Governance decision ${decision.id} is waiting for the user's approval as an appointed member of body ${missingUserApprovals.join(', ')}.`,
    }))
  }

  return results
}

function candidate(input: SimulationBreakpointInput): SimulationBreakpoint {
  const rank = severity[input.level]
  const dateKey = input.effectiveDate ?? input.deadline ?? '9999-12-31'
  const deadlineKey = input.deadline ?? '9999-12-31'
  return { ...input, orderingKey: `${rank}|${dateKey}|${deadlineKey}|${input.sourceKind}|${input.sourceId}` }
}

function compareBreakpoints(a: SimulationBreakpoint, b: SimulationBreakpoint): number {
  return severity[a.level] - severity[b.level]
    || (a.effectiveDate ?? a.deadline ?? '9999-12-31').localeCompare(b.effectiveDate ?? b.deadline ?? '9999-12-31')
    || (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31')
    || a.sourceKind.localeCompare(b.sourceKind)
    || a.sourceId.localeCompare(b.sourceId)
}
