import type { TeamId } from '@/domain/ids'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome, type DelegationOutcomeId, type ResponsibilityKind } from '@/domain/responsibility'
import { resolveAdvisoryResponsibility, recruitingQuality } from '@/engine/staff'
import type { GameWorld } from '@/domain/world'
import { getTeamRecruitingNeeds, rankAiRecruitingTargets, performRecruitingAction, makeRecruitingOffer, addRecruitingBoardEntry } from './RecruitingEngine'

/** NCAA-like ecosystem gate, mirroring the eligibility already baked into `recruitingCoordinator`/`positionalRecruiter` in `STAFF_ROLE_REGISTRY`, made explicit at the advisory boundary per docs §18. */
function isNcaaLikeCycle(world: GameWorld, cycleId: string): boolean {
  const cycle = world.recruitingCyclesById[cycleId]
  if (cycle === undefined) return false
  return world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike'
}

/**
 * Wave 4B Recruiting advisory orchestration (docs/STAFF_SYSTEM_V2.md §18) — narrowly scoped,
 * called per open/signing recruiting cycle from `progressRecruiting` (`CalendarEngine.ts`), same
 * cadence family as `progressAiRecruiting`. Every recommendation is `applied: false`; nothing here
 * mutates recruiting state directly — only `RecruitingEngine`'s existing canonical operations do,
 * and only once a user explicitly accepts via `acceptRecruitingRecommendation`.
 */
export function progressRecruitingAdvisories(world: GameWorld, cycleId: string): GameWorld {
  if (!isNcaaLikeCycle(world, cycleId)) return world
  return Object.keys(world.teams).sort().reduce((next, teamId) => progressTeamRecruitingAdvisories(next, teamId as TeamId, cycleId), world)
}

function progressTeamRecruitingAdvisories(world: GameWorld, teamId: TeamId, cycleId: string): GameWorld {
  const withIdentification = recordProspectIdentification(world, teamId, cycleId)
  const withEvaluation = recordRecruitEvaluation(withIdentification, teamId, cycleId)
  return recordRecruitingPriorities(withEvaluation, teamId, cycleId)
}

/** Bounded candidate band: top-3 ranked targets not yet on the team's board. Quality bounds band size/stability, never reveals hidden truth (ranking already comes from the existing, knowledge-only `rankAiRecruitingTargets`). */
function recordProspectIdentification(world: GameWorld, teamId: TeamId, cycleId: string): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'prospectIdentification')
  if (resolution === undefined) return world
  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const quality = recruitingQuality(resolution.context, seed)
  const bandSize = quality >= 70 ? 3 : quality >= 40 ? 2 : 1

  const boarded = new Set(world.recruitingBoards.filter((entry) => entry.programTeamId === teamId).map((entry) => entry.recruitId))
  const target = rankAiRecruitingTargets(world, cycleId, teamId).find((profile) => !boarded.has(profile.id))
  if (target === undefined) return world

  return recordOutcome(world, teamId, resolution, 'prospectIdentification', { cycleId, recruitId: target.id, bandSize })
}

/** Bounded to a recruit already relevant to the program: the highest-priority board entry with capacity for its next existing action. */
function recordRecruitEvaluation(world: GameWorld, teamId: TeamId, cycleId: string): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'recruitEvaluation')
  if (resolution === undefined) return world
  const boardEntries = world.recruitingBoards.filter((entry) => entry.programTeamId === teamId && world.recruitProfilesById[entry.recruitId]?.cycleId === cycleId && world.recruitProfilesById[entry.recruitId]?.status === 'open')
  if (boardEntries.length === 0) return world
  const priorityRank: Readonly<Record<string, number>> = { high: 0, normal: 1, low: 2 }
  const entry = [...boardEntries].sort((a, b) => priorityRank[a.priority]! - priorityRank[b.priority]! || a.recruitId.localeCompare(b.recruitId))[0]!

  const interest = world.recruitingInterests.find((item) => item.recruitId === entry.recruitId && item.programTeamId === teamId)?.value ?? 0
  const alreadyOffered = Object.values(world.recruitingOffersById).some((offer) => offer.recruitId === entry.recruitId && offer.programTeamId === teamId && offer.status === 'active')
  const actionCount = Object.values(world.recruitingActionHistoryById).filter((item) => item.recruitId === entry.recruitId && item.programTeamId === teamId).length
  const nextAction: 'contact' | 'pitch' | 'visit' | 'offer' = alreadyOffered ? 'offer' : interest >= 60 ? 'offer' : actionCount === 0 ? 'contact' : actionCount === 1 ? 'pitch' : 'visit'
  if (alreadyOffered) return world

  return recordOutcome(world, teamId, resolution, 'recruitEvaluation', { cycleId, recruitId: entry.recruitId, recommendedAction: nextAction })
}

/** Recommends a priority (high/normal/low) for the team's existing board entries, using positional needs + valuation. */
function recordRecruitingPriorities(world: GameWorld, teamId: TeamId, cycleId: string): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'recruitingPriorities')
  if (resolution === undefined) return world
  const needs = getTeamRecruitingNeeds(world, teamId)
  const boardEntries = world.recruitingBoards.filter((entry) => entry.programTeamId === teamId && world.recruitProfilesById[entry.recruitId]?.cycleId === cycleId)
  const target = [...boardEntries].sort((a, b) => a.recruitId.localeCompare(b.recruitId)).find((entry) => {
    const profile = world.recruitProfilesById[entry.recruitId]
    if (profile === undefined) return false
    const recommended = needs[profile.position] > 0 ? 'high' : 'normal'
    return entry.priority !== recommended
  })
  if (target === undefined) return world
  const profile = world.recruitProfilesById[target.recruitId]!
  const recommendedPriority = needs[profile.position] > 0 ? 'high' : 'normal'

  return recordOutcome(world, teamId, resolution, 'recruitingPriorities', { cycleId, recruitId: target.recruitId, recommendedPriority })
}

function recordOutcome(world: GameWorld, teamId: TeamId, resolution: NonNullable<ReturnType<typeof resolveAdvisoryResponsibility>>, kind: ResponsibilityKind, payload: Readonly<Record<string, string | number | boolean>>): GameWorld {
  const recruitId = payload.recruitId as string
  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${recruitId}:${kind}:${world.currentDate}`)
  if (world.delegationOutcomesById[outcomeId] !== undefined) return world
  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = recruitingQuality(resolution.context, seed)
  const outcome = createDelegationOutcome({ id: outcomeId, responsibilityId: resolution.responsibilityId, staffId: resolution.staffId, decidedOn: world.currentDate, kind, applied: false, qualityScore, payload: { teamId, ...payload } })
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: outcome } }
}

export type AcceptRecruitingRecommendationFailureReason = 'notFound' | 'invalidKind' | 'alreadyApplied' | 'malformedPayload' | 'staleRecommendation' | 'recruitingEngineRejected'
export type AcceptRecruitingRecommendationResult = { readonly ok: true; readonly world: GameWorld } | { readonly ok: false; readonly reason: AcceptRecruitingRecommendationFailureReason }

const RECRUITING_RECOMMENDATION_KINDS = ['prospectIdentification', 'recruitEvaluation', 'recruitingPriorities'] as const

/**
 * Sole canonical application seam for a Recruiting advisory outcome (docs §7). Revalidates current
 * world state before dispatching to the existing canonical `RecruitingEngine` boundary — a stale
 * recommendation (recruit already committed, board entry removed, cycle closed) fails atomically
 * with no partial mutation, since every branch either returns the untouched `world` (as a failure)
 * or a single `updateGameWorld`-derived result from the underlying canonical operation.
 */
export function acceptRecruitingRecommendation(world: GameWorld, outcomeId: DelegationOutcomeId): AcceptRecruitingRecommendationResult {
  const outcome = world.delegationOutcomesById[outcomeId]
  if (outcome === undefined) return { ok: false, reason: 'notFound' }
  if (!RECRUITING_RECOMMENDATION_KINDS.includes(outcome.kind as typeof RECRUITING_RECOMMENDATION_KINDS[number])) return { ok: false, reason: 'invalidKind' }
  if (outcome.applied) return { ok: false, reason: 'alreadyApplied' }

  const { teamId, cycleId, recruitId } = outcome.payload
  if (typeof teamId !== 'string' || typeof cycleId !== 'string' || typeof recruitId !== 'string') return { ok: false, reason: 'malformedPayload' }
  const recruit = world.recruitProfilesById[recruitId]
  if (recruit === undefined || recruit.status !== 'open' || recruit.cycleId !== cycleId) return { ok: false, reason: 'staleRecommendation' }

  if (outcome.kind === 'prospectIdentification') {
    const alreadyBoarded = world.recruitingBoards.some((entry) => entry.programTeamId === teamId && entry.recruitId === recruitId)
    if (alreadyBoarded) return { ok: false, reason: 'staleRecommendation' }
    const needs = getTeamRecruitingNeeds(world, teamId as TeamId)
    const priority = needs[recruit.position] > 0 ? 'high' : 'normal'
    const updated = addRecruitingBoardEntry(world, { programTeamId: teamId as TeamId, recruitId, priority })
    return { ok: true, world: markApplied(updated, outcome) }
  }

  if (outcome.kind === 'recruitingPriorities') {
    const recommendedPriority = outcome.payload.recommendedPriority
    if (recommendedPriority !== 'high' && recommendedPriority !== 'normal' && recommendedPriority !== 'low') return { ok: false, reason: 'malformedPayload' }
    const existing = world.recruitingBoards.find((entry) => entry.programTeamId === teamId && entry.recruitId === recruitId)
    if (existing === undefined) return { ok: false, reason: 'staleRecommendation' }
    const updated = addRecruitingBoardEntry(world, { programTeamId: teamId as TeamId, recruitId, priority: recommendedPriority })
    return { ok: true, world: markApplied(updated, outcome) }
  }

  const recommendedAction = outcome.payload.recommendedAction
  if (typeof recommendedAction !== 'string') return { ok: false, reason: 'malformedPayload' }
  if (recommendedAction === 'offer') {
    const result = makeRecruitingOffer(world, cycleId, recruitId, teamId as TeamId)
    if (!result.ok) return { ok: false, reason: 'recruitingEngineRejected' }
    return { ok: true, world: markApplied(result.value, outcome) }
  }
  if (recommendedAction !== 'contact' && recommendedAction !== 'pitch' && recommendedAction !== 'visit') return { ok: false, reason: 'malformedPayload' }
  const result = performRecruitingAction(world, cycleId, recruitId, teamId as TeamId, recommendedAction)
  if (!result.ok) return { ok: false, reason: 'recruitingEngineRejected' }
  return { ok: true, world: markApplied(result.value, outcome) }
}

function markApplied(world: GameWorld, outcome: DelegationOutcome): GameWorld {
  const updated: DelegationOutcome = { ...outcome, applied: true }
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcome.id]: updated } }
}
