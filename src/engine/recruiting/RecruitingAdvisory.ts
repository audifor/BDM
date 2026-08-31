import type { TeamId } from '@/domain/ids'
import type { RecruitProfile } from '@/domain/recruiting'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome, type DelegationOutcomeId, type ResponsibilityKind } from '@/domain/responsibility'
import { resolveAdvisoryResponsibility, recruitingQuality } from '@/engine/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
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

/**
 * Bounded candidate band, actually consumed (Wave 4B review Blocker 3A): `recruitingQuality`
 * determines how wide a slice of the top of the existing, knowledge-only `rankAiRecruitingTargets`
 * ranking the holder draws from — quality >= 70 is a band of 1 (always the top target), quality
 * >= 40 a band of 2, otherwise a band of 3. Selection WITHIN that band is deterministic, drawn
 * only from the canonical seeded RandomSource, keyed off the canonical decision seed plus a
 * `prospect-band` namespace so it never collides with the quality/jitter seed streams. The ranking itself is untouched — no
 * new ranking is built, and no hidden Player truth is ever read (the ranking already only reads
 * `OrganizationKnowledge`/valuation).
 */
function recordProspectIdentification(world: GameWorld, teamId: TeamId, cycleId: string): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'prospectIdentification')
  if (resolution === undefined) return world
  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const quality = recruitingQuality(resolution.context, seed)
  const bandSize = quality >= 70 ? 1 : quality >= 40 ? 2 : 3

  const boarded = new Set(world.recruitingBoards.filter((entry) => entry.programTeamId === teamId).map((entry) => entry.recruitId))
  const band = rankAiRecruitingTargets(world, cycleId, teamId).filter((profile) => !boarded.has(profile.id)).slice(0, bandSize)
  if (band.length === 0) return world
  const random = new SeededRandomSource(hashStringToSeed(`${seed}:prospect-band`))
  const target = band[random.nextInt(0, band.length - 1)]!

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

/**
 * Recommends a priority (high/normal/low) for one existing board entry (Wave 4B review Blocker
 * 3B). Reuses the existing canonical `rankAiRecruitingTargets` ranking — which already folds in
 * positional needs, `OrganizationKnowledge`/`deriveOrganizationPlayerValuation(context:
 * 'RECRUITING')`, public rank and a deterministic tie-break — rather than building a second
 * ranking or reading `Player.basketball.ratings`/potential directly. A board entry's RELATIVE
 * standing within that ranking, combined with positional need, decides the recommendation:
 *
 *   strong need + within the quality-adjusted top band  => high
 *   within the wider quality-adjusted band, or no strong need but reasonably ranked => normal
 *   clearly outside the quality-adjusted preferred band and no strong need         => low
 *
 * `recruitingQuality` widens/narrows the "preferred band" threshold itself: a high-quality holder
 * draws a tight preferred band (only genuinely top-ranked recruits read as `high`/`normal`,
 * everything else reads `low`), a low-quality holder draws a wide, less discriminating band. This
 * makes quality materially change the recommendation, not just its metadata.
 */
function recordRecruitingPriorities(world: GameWorld, teamId: TeamId, cycleId: string): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'recruitingPriorities')
  if (resolution === undefined) return world
  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const quality = recruitingQuality(resolution.context, seed)
  const needs = getTeamRecruitingNeeds(world, teamId)
  const ranked = rankAiRecruitingTargets(world, cycleId, teamId)
  const rankIndexByRecruitId = new Map(ranked.map((profile, index) => [profile.id, index]))
  const preferredBand = quality >= 70 ? Math.max(1, Math.ceil(ranked.length * 0.15)) : quality >= 40 ? Math.max(1, Math.ceil(ranked.length * 0.35)) : Math.max(1, Math.ceil(ranked.length * 0.6))

  const boardEntries = world.recruitingBoards.filter((entry) => entry.programTeamId === teamId && world.recruitProfilesById[entry.recruitId]?.cycleId === cycleId)
  const target = [...boardEntries].sort((a, b) => a.recruitId.localeCompare(b.recruitId)).find((entry) => {
    const profile = world.recruitProfilesById[entry.recruitId]
    if (profile === undefined) return false
    const recommended = recommendedPriorityFor(profile, needs, rankIndexByRecruitId, preferredBand)
    return entry.priority !== recommended
  })
  if (target === undefined) return world
  const profile = world.recruitProfilesById[target.recruitId]!
  const recommendedPriority = recommendedPriorityFor(profile, needs, rankIndexByRecruitId, preferredBand)

  return recordOutcome(world, teamId, resolution, 'recruitingPriorities', { cycleId, recruitId: target.recruitId, recommendedPriority })
}

function recommendedPriorityFor(profile: RecruitProfile, needs: Readonly<Record<'PG' | 'SG' | 'SF' | 'PF' | 'C', number>>, rankIndexByRecruitId: ReadonlyMap<string, number>, preferredBand: number): 'high' | 'normal' | 'low' {
  const rankIndex = rankIndexByRecruitId.get(profile.id)
  const strongNeed = needs[profile.position] > 0
  if (rankIndex === undefined) return strongNeed ? 'normal' : 'low'
  const withinPreferredBand = rankIndex < preferredBand
  if (strongNeed && withinPreferredBand) return 'high'
  if (withinPreferredBand || strongNeed) return 'normal'
  return 'low'
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
