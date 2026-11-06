import { declineCoachJobOffer } from '@/app/coachCareer/CoachCareerService'
import { instantResult } from '@/app/game/matchResolution'
import { evaluateSimulationBreakpoints, type SimulationBreakpoint, type SimulationBreakpointContext } from '@/app/game/SimulationBreakpoints'
import { validateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { skipMediaOpportunity } from '@/engine/media/MediaEngine'
import { digest, ROOT_SEED, seedFor } from './M0Support'

type Breakpoint = SimulationBreakpoint
// Inventory of production reason names; the source/inventory regression detects drift.
export const KNOWN_BREAKPOINT_REASONS = [
  'userGame', 'returnToPlayReview', 'minimumRoster', 'draftPick', 'mediaOpportunity', 'coachJobOffer',
  'tradeNegotiationResponse', 'seasonComplete', 'unsupportedCompetitionLifecycle', 'scheduledGameInPast',
  'contractReviewHorizon', 'retentionCounter', 'retentionAgreement', 'marketNegotiation', 'governanceRequest', 'governanceApproval',
  'marketNegotiationAwaitingExternalResponse', 'marketContactResponse',
] as const
export const isMandatory = (item: Breakpoint) => item.level === 'ACTION_REQUIRED' || item.level === 'BLOCKING'
const identity = (item: Breakpoint) => JSON.stringify([item.reason, item.sourceKind, item.sourceId])

export interface ScriptedResolver {
  readonly sourceKind: string
  readonly ownership: 'USER_TEAM' | 'USER_COACH'
  readonly operation: string
  readonly precondition: (world: GameWorld, item: Breakpoint) => boolean
  readonly apply: (world: GameWorld, item: Breakpoint, rootSeed: number) => GameWorld
  readonly resolved: (before: GameWorld, after: GameWorld, item: Breakpoint) => boolean
}
export type ResolverRegistry = Readonly<Record<string, ScriptedResolver | undefined>>

export const M0_RESOLVERS: ResolverRegistry = {
  userGame: {
    sourceKind: 'USER_GAME', ownership: 'USER_TEAM', operation: 'instantResult',
    precondition: (world, item) => {
      const game = world.games[item.sourceId as keyof GameWorld['games']]
      const team = getUserTeam(world)
      return game?.status === 'scheduled' && game.date === world.currentDate && team !== undefined
        && [game.homeTeamId, game.awayTeamId].includes(team.id) && item.actionTarget?.gameId === game.id
    },
    apply: (world, item, rootSeed) => instantResult(world, undefined, seedFor(world.games[item.sourceId as keyof GameWorld['games']]!, rootSeed)),
    resolved: (_before, after, item) => after.games[item.sourceId as keyof GameWorld['games']]?.status === 'completed'
      && after.matchStatLogsByGameId[item.sourceId as keyof GameWorld['games']] !== undefined,
  },
  mediaOpportunity: {
    sourceKind: 'MEDIA_OPPORTUNITY', ownership: 'USER_COACH', operation: 'skipMediaOpportunity',
    precondition: (world, item) => world.mediaOpportunitiesById[item.sourceId]?.status === 'pending'
      && world.mediaOpportunitiesById[item.sourceId]?.coachId === world.userCoachId && item.actionTarget?.opportunityId === item.sourceId,
    apply: (world, item) => skipMediaOpportunity(world, item.sourceId),
    resolved: (_before, after, item) => after.mediaOpportunitiesById[item.sourceId]?.status === 'skipped',
  },
  coachJobOffer: {
    sourceKind: 'COACH_JOB_OFFER', ownership: 'USER_COACH', operation: 'declineCoachJobOffer',
    precondition: (world, item) => {
      const offer = world.coachJobOffersById[item.sourceId as keyof GameWorld['coachJobOffersById']]
      return offer?.status === 'pending' && offer.coachId === world.userCoachId && item.actionTarget?.offerId === offer.id
        && Object.values(world.coachJobCandidaciesById).some(candidate => candidate.jobOpeningId === offer.jobOpeningId
          && candidate.coachId === offer.coachId && candidate.status === 'offered')
    },
    apply: (world, item) => declineCoachJobOffer(world, item.sourceId),
    resolved: (before, after, item) => {
      const offer = after.coachJobOffersById[item.sourceId as keyof GameWorld['coachJobOffersById']]
      return offer?.status === 'declined' && Object.values(after.coachJobCandidaciesById).some(candidate => candidate.jobOpeningId === offer.jobOpeningId
        && candidate.coachId === offer.coachId && candidate.status === 'rejected')
        && digest(before.coachEmploymentByCoachId) === digest(after.coachEmploymentByCoachId)
        && digest(before.teams) === digest(after.teams) && digest(before.teamStaffAssignmentsById) === digest(after.teamStaffAssignmentsById)
    },
  },
}

export interface ResolutionLimits {
  readonly maxActionsPerDay: number
  readonly maxAttemptsPerIdentity: number
  readonly maxActions: number
}
export const DEFAULT_RESOLUTION_LIMITS: ResolutionLimits = { maxActionsPerDay: 16, maxAttemptsPerIdentity: 2, maxActions: 64 }
export interface BlockedDecision {
  readonly level: Breakpoint['level']
  readonly reason: string
  readonly sourceKind: string
  readonly sourceId: string
  readonly date: GameWorld['currentDate']
  readonly diagnostic: string
  readonly cause: string
  readonly classification: 'KNOWN_REASON' | 'UNKNOWN_EXTENSION'
  readonly evidence: { readonly worldHash: string; readonly userCoachId: string; readonly userTeamId?: string; readonly source: unknown }
}
export interface ResolutionAction {
  readonly breakpoint: Breakpoint
  readonly operation: string
  readonly status: 'RESOLVED' | 'BLOCKED'
  readonly beforeHash: string
  readonly afterHash: string
  readonly generatedMandatory: readonly Breakpoint[]
}
export interface ResolutionStep {
  readonly status: 'READY' | 'RESOLVED' | 'BLOCKED'
  readonly mayAdvance: boolean
  readonly world: GameWorld
  readonly before: readonly Breakpoint[]
  readonly after: readonly Breakpoint[]
  readonly blockers: readonly BlockedDecision[]
  readonly action?: ResolutionAction
}

function sourceEvidence(world: GameWorld, item: Breakpoint): unknown {
  switch (item.sourceKind) {
    case 'USER_GAME': case 'SCHEDULE_INTEGRITY': return world.games[item.sourceId as keyof GameWorld['games']]
    case 'MEDIA_OPPORTUNITY': return world.mediaOpportunitiesById[item.sourceId]
    case 'COACH_JOB_OFFER': return world.coachJobOffersById[item.sourceId as keyof GameWorld['coachJobOffersById']]
    case 'USER_RTP_REVIEW': return world.injuriesById[item.sourceId as keyof GameWorld['injuriesById']]
    case 'TEAM_ROSTER_MINIMUM': return world.teams[item.sourceId as keyof GameWorld['teams']]
    case 'USER_DRAFT_PICK': return world.draftPicksById[item.sourceId]
    case 'TRADE_NEGOTIATION': return world.tradeNegotiationsById[item.sourceId]
    case 'SEASON_LIFECYCLE': case 'COMPETITION_LIFECYCLE': return world.seasons[item.sourceId as keyof GameWorld['seasons']]
    default: return null // Full canonical world is also returned, even for open extension diagnostics.
  }
}

/** Certification-only policy. Never advances the calendar and never writes canonical collections. */
export class ScriptedResolutionSession {
  private readonly limits: ResolutionLimits
  private readonly actionsPerDay = new Map<string, number>()
  private readonly attempts = new Map<string, number>()
  private actions = 0

  constructor(private readonly options: { readonly rootSeed?: number; readonly registry?: ResolverRegistry; readonly limits?: Partial<ResolutionLimits> } = {}) {
    this.limits = { ...DEFAULT_RESOLUTION_LIMITS, ...options.limits }
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) throw new Error('Resolution limits must be positive safe integers')
  }

  step(world: GameWorld, context: SimulationBreakpointContext = {}): ResolutionStep {
    validateGameWorld(world)
    const before = evaluateSimulationBreakpoints(world, context).candidates
    const mandatory = before.filter(isMandatory)
    const registry = this.options.registry ?? M0_RESOLVERS
    const blocked = (item: Breakpoint, cause: string, current = world): BlockedDecision => ({
      level: item.level, reason: item.reason, sourceKind: item.sourceKind, sourceId: item.sourceId, date: current.currentDate,
      diagnostic: item.diagnostic, cause, evidence: { worldHash: digest(current), userCoachId: current.userCoachId,
        userTeamId: getUserTeam(current)?.id, source: sourceEvidence(current, item) ?? null },
      classification: KNOWN_BREAKPOINT_REASONS.some(reason => reason === item.reason) ? 'KNOWN_REASON' : 'UNKNOWN_EXTENSION',
    })
    // Preflight ALL obligations. An unsupported BLOCKING or lower-ranked mandatory
    // candidate prevents an otherwise resolvable action from running.
    const blockers = mandatory.flatMap(item => {
      const resolver = Object.hasOwn(registry, item.reason) ? registry[item.reason] : undefined
      if (!resolver) return [blocked(item, 'MISSING_RESOLVER')]
      if (item.level !== 'ACTION_REQUIRED' || item.sourceKind !== resolver.sourceKind || item.ownership.kind !== resolver.ownership
        || item.ownership.coachId !== world.userCoachId
        || resolver.ownership === 'USER_TEAM' && item.ownership.teamId !== getUserTeam(world)?.id) return [blocked(item, 'SOURCE_OR_OWNERSHIP_MISMATCH')]
      if (!resolver.precondition(world, item)) return [blocked(item, 'CANONICAL_PRECONDITION_FAILED')]
      return []
    })
    if (blockers.length > 0) return { status: 'BLOCKED', mayAdvance: false, world, before, after: before, blockers }
    const item = mandatory[0]
    if (!item) return { status: 'READY', mayAdvance: true, world, before, after: before, blockers: [] }
    const attemptKey = `${world.currentDate}:${identity(item)}`
    const count = this.actionsPerDay.get(world.currentDate) ?? 0
    const attempts = this.attempts.get(attemptKey) ?? 0
    const cause = this.actions >= this.limits.maxActions ? 'OVERALL_ACTION_LIMIT'
      : count >= this.limits.maxActionsPerDay ? 'DAILY_ACTION_LIMIT'
        : attempts >= this.limits.maxAttemptsPerIdentity ? 'BREAKPOINT_ATTEMPT_LIMIT' : undefined
    if (cause) return { status: 'BLOCKED', mayAdvance: false, world, before, after: before, blockers: [blocked(item, cause)] }
    this.actions++
    this.actionsPerDay.set(world.currentDate, count + 1)
    this.attempts.set(attemptKey, attempts + 1)
    const resolver = registry[item.reason]!
    const beforeHash = digest(world)
    let next = world
    let after = before
    let failure: string | undefined
    try {
      const resolved = resolver.apply(world, item, this.options.rootSeed ?? ROOT_SEED)
      validateGameWorld(resolved)
      next = resolved
      after = evaluateSimulationBreakpoints(next, context).candidates
      if (next.currentDate !== world.currentDate) failure = 'ACTION_CHANGED_DATE'
      else if (digest(next) === beforeHash || after.some(candidate => isMandatory(candidate) && identity(candidate) === identity(item))
        || !resolver.resolved(world, next, item)) failure = 'NO_PROGRESS_OR_UNRESOLVED_OBLIGATION'
    } catch (error) {
      failure = `CANONICAL_ACTION_FAILED: ${error instanceof Error ? error.message : String(error)}`
    }
    const action: ResolutionAction = { breakpoint: item, operation: resolver.operation, status: failure ? 'BLOCKED' : 'RESOLVED',
      beforeHash, afterHash: digest(next), generatedMandatory: after.filter(candidate => isMandatory(candidate) && !mandatory.some(prior => identity(prior) === identity(candidate))) }
    return { status: failure ? 'BLOCKED' : 'RESOLVED', mayAdvance: !failure && !after.some(isMandatory), world: next,
      before, after, action, blockers: failure ? [blocked(item, failure, next)] : [] }
  }

  run(world: GameWorld, context: SimulationBreakpointContext = {}) {
    const steps: ResolutionStep[] = []
    for (;;) {
      const step = this.step(world, context)
      steps.push(step)
      world = step.world
      if (step.status !== 'RESOLVED') return { status: step.status, mayAdvance: step.mayAdvance, world, steps }
    }
  }
}
