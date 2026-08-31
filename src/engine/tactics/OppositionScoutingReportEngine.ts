import { organizationIdForTeam, type PlayerId, type TeamId } from '@/domain/ids'
import { createDelegationOutcome, delegationOutcomeIdFromString } from '@/domain/responsibility'
import { createOppositionScoutingReport, oppositionScoutingReportId, MAX_FLAGGED_PLAYERS, type DefensiveEmphasis, type OppositionScoutingReport, type PaceAdjustment } from '@/domain/tactics'
import { attributeKnowledgeDimension, getNextScheduledGame, getTeam, type GameWorld } from '@/domain/world'
import { resolveAdvisoryResponsibility, tacticsQuality } from '@/engine/staff'
import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'

/**
 * Generates the Wave 3 pre-match `OppositionScoutingReport` (docs/STAFF_SYSTEM_V2.md §15.1/§8)
 * for every team whose `oppositionScouting` responsibility is genuinely `advisory` with a valid
 * holder, when a scheduled game becomes that team's next future scheduled game. Idempotent:
 * `oppositionScoutingReportId(teamId, gameId)` is the stable, exactly-once identity — a report is
 * never regenerated for the same (team, game) pair, so repeated calendar processing is a no-op
 * once the report exists. `userControlled`/vacant is entirely unaffected (no report, no outcome).
 *
 * NO HIDDEN TRUTH: every recommendation field is derived only from `OrganizationKnowledge`
 * (`getPlayerKnowledgeSummary`) and existing Staff-attributed reports — never `Player.basketball`
 * ratings/potential. When knowledge is insufficient, recommendation fields stay `undefined`/the
 * flagged list stays empty rather than leaking anything — see `deriveRecommendations`.
 */
export function progressOppositionScoutingReports(world: GameWorld): GameWorld {
  return Object.keys(world.teams).sort().reduce((next, teamId) => progressTeamOppositionReport(next, teamId as TeamId), world)
}

function progressTeamOppositionReport(world: GameWorld, teamId: TeamId): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'oppositionScouting')
  if (resolution === undefined) return world
  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined) return world
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId

  const reportId = oppositionScoutingReportId(teamId, nextGame.id)
  if (world.oppositionScoutingReportsById[reportId] !== undefined) return world // exactly-once gate

  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = tacticsQuality(resolution.context, seed)
  const recommendations = deriveRecommendations(world, teamId, opponentTeamId, qualityScore)

  const report = createOppositionScoutingReport({
    id: reportId,
    teamId,
    opponentTeamId,
    gameId: nextGame.id,
    authoredByStaffId: resolution.staffId,
    generatedOn: world.currentDate,
    qualityScore,
    ...recommendations,
  })

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${nextGame.id}`)
  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind: 'oppositionScouting',
    applied: false,
    qualityScore,
    payload: {
      reportId,
      gameId: nextGame.id,
      opponentTeamId,
      ...(recommendations.recommendedDefensiveEmphasis === undefined ? {} : { recommendedDefensiveEmphasis: recommendations.recommendedDefensiveEmphasis }),
      ...(recommendations.recommendedPaceAdjustment === undefined ? {} : { recommendedPaceAdjustment: recommendations.recommendedPaceAdjustment }),
      flaggedPlayerCount: recommendations.flaggedPlayerIds.length,
    },
  })

  return {
    ...world,
    oppositionScoutingReportsById: { ...world.oppositionScoutingReportsById, [reportId]: report },
    delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: outcome },
    organizationKnowledge: applyStaffFamiliarity(world, teamId, opponentTeamId, resolution.staffId),
  }
}

interface Recommendations {
  readonly recommendedDefensiveEmphasis?: DefensiveEmphasis
  readonly recommendedPaceAdjustment?: PaceAdjustment
  readonly flaggedPlayerIds: readonly PlayerId[]
}

const MIN_COVERAGE_FOR_FLAG = 0.3

/** Offensive dimensions legitimately readable off `OrganizationKnowledge` that indicate a PERIMETER threat (shot creation/shooting off the dribble or catch). */
const PERIMETER_THREAT_DIMENSIONS = ['shooting', 'creation'] as const
/** Offensive dimensions that indicate an INTERIOR threat (finishing at the rim, offensive rebounding/putbacks). */
const INTERIOR_THREAT_DIMENSIONS = ['finishing', 'rebounding'] as const
/** `physical` (speed/quickness/conditioning) is the only existing dimension that legitimately bears on tempo — never confidence-derived causality. */
const PACE_SIGNAL_DIMENSION = 'physical'

const MIN_TEAM_KNOWLEDGE_WEIGHT = 0.6
const BASE_REQUIRED_RELATIVE_MARGIN = 0.15
const PACE_SIGNAL_ESTIMATE_MIDPOINT = 50
const PACE_SIGNAL_SCALE = 25

/**
 * Every value here comes directly from `OrganizationKnowledge` (via the world's roster + existing
 * dimension records) — never from `Player.basketball`. §4: emphasis and flagged players are driven
 * by weighted-estimate threat scores per legitimate offensive dimension, not a seeded coin flip;
 * pace is driven only by the `physical` dimension (an actual tempo-relevant signal already in the
 * domain vocabulary), never by confidence alone. Insufficient/too-close knowledge yields
 * `undefined`/an empty flagged list rather than a guess. `qualityScore` only widens/narrows the
 * RELATIVE margin required to commit to a concrete recommendation — it never grants additional
 * information.
 */
function deriveRecommendations(world: GameWorld, teamId: TeamId, opponentTeamId: TeamId, qualityScore: number): Recommendations {
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = organizationIdForTeam(teamId)
  const roster = opponent.rosterPlayerIds.map((playerId) => ({ playerId, knowledge: findKnowledge(world.organizationKnowledge, organizationId, playerId) }))

  const perimeterThreat = aggregateThreat(roster, PERIMETER_THREAT_DIMENSIONS)
  const interiorThreat = aggregateThreat(roster, INTERIOR_THREAT_DIMENSIONS)
  const totalWeight = perimeterThreat.totalWeight + interiorThreat.totalWeight
  // Normalize each side to its own weighted-average estimate (0..100 scale) before comparing —
  // raw weighted SUMS are not comparable to each other when the two sides have different total
  // weight, and comparing sums against a small relative-margin threshold made almost any nonzero
  // gap "significant". Means are directly comparable magnitudes.
  const perimeterMean = perimeterThreat.totalWeight === 0 ? 0 : perimeterThreat.weightedScore / perimeterThreat.totalWeight
  const interiorMean = interiorThreat.totalWeight === 0 ? 0 : interiorThreat.weightedScore / interiorThreat.totalWeight

  // Quality narrows/widens the RELATIVE margin required to commit — higher quality commits on a
  // smaller observed relative gap, lower quality requires a clearer gap before recommending
  // anything. Bounded to a sane band regardless of quality (never lets quality 100 turn pure noise
  // into a recommendation, never lets quality 0 refuse an overwhelming gap).
  const requiredMargin = BASE_REQUIRED_RELATIVE_MARGIN * (1 + (50 - qualityScore) / 100)
  const relativeGap = Math.abs(perimeterMean - interiorMean) / Math.max(perimeterMean, interiorMean, 1)
  const defensiveEmphasis: DefensiveEmphasis | undefined = totalWeight < MIN_TEAM_KNOWLEDGE_WEIGHT || relativeGap < requiredMargin
    ? undefined
    : perimeterMean > interiorMean ? 'perimeter' : 'interior'

  const paceSignal = aggregatePaceSignal(roster)
  const recommendedPaceAdjustment: PaceAdjustment | undefined = paceSignal === undefined ? undefined : clampPace(Math.round((paceSignal - PACE_SIGNAL_ESTIMATE_MIDPOINT) / PACE_SIGNAL_SCALE))

  const flaggedPlayerIds = roster
    .map((entry) => ({ playerId: entry.playerId, threat: knownThreatScore(entry.knowledge) }))
    .filter((entry) => entry.threat !== undefined && entry.threat.weight >= MIN_COVERAGE_FOR_FLAG)
    .sort((a, b) => b.threat!.effectiveScore - a.threat!.effectiveScore || a.playerId.localeCompare(b.playerId))
    .slice(0, MAX_FLAGGED_PLAYERS)
    .map((entry) => entry.playerId)

  return {
    ...(recommendedPaceAdjustment === undefined ? {} : { recommendedPaceAdjustment }),
    ...(defensiveEmphasis === undefined ? {} : { recommendedDefensiveEmphasis: defensiveEmphasis }),
    flaggedPlayerIds,
  }
}

function findKnowledge(knowledge: readonly OrganizationKnowledge[], organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId): OrganizationKnowledge | undefined {
  return knowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId)
}

/** weight = coverage × confidence per contributing dimension finding; score = weight-weighted estimate sum. Bounded: a dimension with no `estimate` contributes zero score but its weight is excluded entirely (never treated as a zero-rated threat). */
function aggregateThreat(roster: readonly { readonly knowledge: OrganizationKnowledge | undefined }[], dimensionKeys: readonly string[]): { readonly weightedScore: number; readonly totalWeight: number } {
  let weightedScore = 0
  let totalWeight = 0
  for (const entry of roster) {
    for (const key of dimensionKeys) {
      const finding = entry.knowledge?.dimensions[key]
      if (finding?.estimate === undefined) continue
      const weight = finding.coverage * finding.confidence
      weightedScore += finding.estimate * weight
      totalWeight += weight
    }
  }
  return { weightedScore, totalWeight }
}

function aggregatePaceSignal(roster: readonly { readonly knowledge: OrganizationKnowledge | undefined }[]): number | undefined {
  const { weightedScore, totalWeight } = aggregateThreat(roster, [PACE_SIGNAL_DIMENSION])
  return totalWeight < MIN_TEAM_KNOWLEDGE_WEIGHT ? undefined : weightedScore / totalWeight
}

/**
 * Best offensive-threat estimate for one player, from legitimate offense dimensions only — used
 * purely to rank/flag, never to leak Player truth. `effectiveScore = estimate × coverage ×
 * confidence` is the value actually used for ranking (not raw `estimate`), so a player known with
 * high confidence/coverage at a moderate estimate correctly outranks a player barely glimpsed at a
 * high estimate.
 */
function knownThreatScore(knowledge: OrganizationKnowledge | undefined): { readonly effectiveScore: number; readonly weight: number } | undefined {
  if (knowledge === undefined) return undefined
  let best: { readonly effectiveScore: number; readonly weight: number } | undefined
  for (const key of [...PERIMETER_THREAT_DIMENSIONS, ...INTERIOR_THREAT_DIMENSIONS]) {
    const finding = knowledge.dimensions[key]
    if (finding?.estimate === undefined) continue
    const weight = finding.coverage * finding.confidence
    const effectiveScore = finding.estimate * weight
    if (best === undefined || effectiveScore > best.effectiveScore) best = { effectiveScore, weight }
  }
  return best
}

function clampPace(value: number): PaceAdjustment {
  return Math.max(-2, Math.min(2, value)) as PaceAdjustment
}

const FAMILIARITY_COVERAGE_BOOST = 0.05
const FAMILIARITY_CONFIDENCE_BOOST = 0.05
const FAMILIARITY_UNCERTAINTY_REDUCTION = 1

/** Synthetic, non-report marker recorded in `evidenceIds` once a given Staff's familiarity boost has been applied to a dimension — never resolves to a real `Evidence` record, purely an idempotency tag. */
function familiarityMarker(staffId: import('@/domain/ids').StaffPersonId): string {
  return `staff-familiarity:${staffId}`
}

/**
 * §12/§3: prior relevant Staff scouting history may provide a small, bounded familiarity benefit —
 * never created from hidden truth, only from the fact that the CURRENT `oppositionScouting` holder
 * personally authored real reports about these players before. Three invariants enforced here that
 * were previously violated:
 *
 * - HOLDER-SPECIFIC (§3.1): only reports attributed to `resolution.staffId` (the Staff who
 *   currently holds the responsibility) count — a report authored by a different Staff member, or
 *   familiarity accrued under a since-replaced holder, grants nothing.
 * - PER-DIMENSION (§3.2): each dimension is evaluated independently via its OWN `reportIds` — a
 *   report covering `shooting` never boosts unrelated dimensions like `physical` or `potential:*`.
 * - NO ARTIFICIAL REFRESH (§3.3): `assessedAt` is left untouched; familiarity is not a new
 *   observation.
 * - NO COMPOUNDING (§3.4): applying the SAME holder's familiarity to a dimension that already
 *   carries their `familiarityMarker` in `evidenceIds` is a no-op — repeated matchups against the
 *   same opponent without new evidence never grow coverage/confidence past one bounded application
 *   per holder per dimension.
 */
function applyStaffFamiliarity(world: GameWorld, teamId: TeamId, opponentTeamId: TeamId, holderStaffId: import('@/domain/ids').StaffPersonId): readonly import('@/domain/knowledge').OrganizationKnowledge[] {
  const organizationId = organizationIdForTeam(teamId)
  const opponent = getTeam(world, opponentTeamId)
  return world.organizationKnowledge.map((entry) => {
    if (entry.organizationId !== organizationId || !opponent.rosterPlayerIds.includes(entry.subjectPlayerId)) return entry
    return {
      ...entry,
      dimensions: Object.fromEntries(Object.entries(entry.dimensions).map(([key, dimension]) => [key, maybeBoostWithFamiliarity(world, dimension, holderStaffId)])),
    }
  })
}

function maybeBoostWithFamiliarity(world: GameWorld, dimension: OrganizationKnowledgeDimension, holderStaffId: import('@/domain/ids').StaffPersonId): OrganizationKnowledgeDimension {
  const marker = familiarityMarker(holderStaffId)
  if (dimension.evidenceIds?.includes(marker) === true) return dimension // already applied for this holder — no compounding
  const authoredByHolder = attributeKnowledgeDimension(world, dimension).some((record) => record.staffId === holderStaffId)
  if (!authoredByHolder) return dimension
  return {
    ...dimension,
    coverage: Math.min(1, dimension.coverage + FAMILIARITY_COVERAGE_BOOST),
    confidence: Math.min(1, dimension.confidence + FAMILIARITY_CONFIDENCE_BOOST),
    ...(dimension.uncertainty === undefined ? {} : { uncertainty: Math.max(1, dimension.uncertainty - FAMILIARITY_UNCERTAINTY_REDUCTION) }),
    provenance: 'staffFamiliarity',
    evidenceIds: [...new Set([...(dimension.evidenceIds ?? []), marker])],
  }
}
