import type { GameDate } from '@/domain/date'
import { deriveGovernanceDecisionStatus, deriveGovernanceRequestStatus, resolveGovernanceDecisionRights } from '@/domain/governance'
import type { GameWorld } from '@/domain/world'
import { getPendingMediaOpportunities } from '@/domain/world'
import { getCurrentDraftPick } from '@/engine/draft'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { classifyCompetitionLifecycles } from './CompetitionLifecycleCoordinator'

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
    for (const negotiation of Object.values(world.negotiationsById).filter((item) => item.organizationId === userTeam.organizationId && (item.status === 'OPEN' || item.status === 'COUNTERED'))) candidates.push(candidate({
      level: negotiation.status === 'COUNTERED' ? 'ACTION_REQUIRED' : 'INFO',
      reason: negotiation.status === 'COUNTERED' ? 'marketNegotiation' : 'marketNegotiationAwaitingExternalResponse',
      sourceKind: 'MARKET_NEGOTIATION', sourceId: negotiation.id,
      ownership: { kind: 'USER_TEAM', coachId: world.userCoachId, teamId: userTeam.id },
      route: 'market', actionTarget: { negotiationId: negotiation.id },
      diagnostic: negotiation.status === 'COUNTERED'
        ? `Market negotiation ${negotiation.id} has countered terms awaiting the user's decision.`
        : `Market negotiation ${negotiation.id} is open and waiting on an external player response.`,
    }))
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

function governanceCandidates(world: GameWorld): SimulationBreakpoint[] {
  const results: SimulationBreakpoint[] = []
  const date = world.currentDate
  for (const request of Object.values(world.governanceRequestsById)) {
    if (request.recipient.kind !== 'ACTOR' || request.recipient.actor.kind !== 'COACH' || request.recipient.actor.id !== world.userCoachId) continue
    const events = Object.values(world.governanceRequestEventsById).filter((event) => event.requestId === request.id && event.effectiveOn <= date)
    const status = deriveGovernanceRequestStatus(events)
    if (status !== 'ISSUED' && status !== 'ACKNOWLEDGED' && status !== 'ACCEPTED') continue
    results.push(candidate({
      level: 'ACTION_REQUIRED', reason: 'governanceRequest', sourceKind: 'GOVERNANCE_REQUEST', sourceId: request.id,
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
      level: 'ACTION_REQUIRED', reason: 'governanceApproval', sourceKind: 'GOVERNANCE_DECISION', sourceId: decision.id,
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
