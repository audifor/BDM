import { organizationIdForTeam, type PlayerId, type TeamId } from '@/domain/ids'
import { createDelegationOutcome, delegationOutcomeIdFromString } from '@/domain/responsibility'
import { createOppositionScoutingReport, oppositionScoutingReportId, MAX_FLAGGED_PLAYERS, type DefensiveEmphasis, type OppositionScoutingReport, type PaceAdjustment } from '@/domain/tactics'
import { attributeKnowledgeDimension, getNextScheduledGame, getTeam, type GameWorld } from '@/domain/world'
import { resolveAdvisoryResponsibility, tacticsQuality } from '@/engine/staff'
import { getPlayerKnowledgeSummary } from '@/engine/scouting'
import type { OrganizationKnowledgeDimension } from '@/domain/knowledge'

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
  const recommendations = deriveRecommendations(world, teamId, opponentTeamId, qualityScore, seed)

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
    organizationKnowledge: applyStaffFamiliarity(world, teamId, opponentTeamId, world.currentDate),
  }
}

interface Recommendations {
  readonly recommendedDefensiveEmphasis?: DefensiveEmphasis
  readonly recommendedPaceAdjustment?: PaceAdjustment
  readonly flaggedPlayerIds: readonly PlayerId[]
}

const MIN_COVERAGE_FOR_RECOMMENDATION = 0.35
const MIN_COVERAGE_FOR_FLAG = 0.3

/**
 * Every value here comes from `getPlayerKnowledgeSummary` (itself sourced only from
 * `OrganizationKnowledge`) — never from `Player.basketball`. Insufficient aggregate knowledge
 * (`overallCoverage` below the bounded threshold) yields neutral/undefined output rather than a
 * guess; quality only bounds the pace adjustment's magnitude/selection stability, never grants
 * additional information access.
 */
function deriveRecommendations(world: GameWorld, teamId: TeamId, opponentTeamId: TeamId, qualityScore: number, seed: string): Recommendations {
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = organizationIdForTeam(teamId)
  const summaries = opponent.rosterPlayerIds.map((playerId) => ({ playerId, summary: getPlayerKnowledgeSummary(world, organizationId, playerId) }))
  const known = summaries.filter((entry) => entry.summary.overallCoverage >= MIN_COVERAGE_FOR_RECOMMENDATION)

  if (known.length === 0) {
    return { flaggedPlayerIds: [] }
  }

  const averageConfidence = known.reduce((sum, entry) => sum + entry.summary.overallConfidence, 0) / known.length
  // Bounded, deterministic: higher aggregate knowledge confidence and higher Staff quality both
  // narrow toward committing to a concrete recommendation; low confidence stays neutral/undefined
  // rather than fabricating a guess from thin information.
  const commitThreshold = 0.4
  const paceAdjustment: PaceAdjustment | undefined = averageConfidence >= commitThreshold
    ? clampPace(Math.round((averageConfidence - 0.5) * 4 + (qualityScore - 50) / 50))
    : undefined
  const defensiveEmphasis: DefensiveEmphasis | undefined = averageConfidence >= commitThreshold
    ? (hashToUnit(`${seed}:emphasis`) >= 0.5 ? 'interior' : 'perimeter')
    : undefined

  const flaggedPlayerIds = known
    .filter((entry) => entry.summary.overallCoverage >= MIN_COVERAGE_FOR_FLAG)
    .sort((a, b) => (b.summary.overallCoverage * b.summary.overallConfidence) - (a.summary.overallCoverage * a.summary.overallConfidence) || a.playerId.localeCompare(b.playerId))
    .slice(0, MAX_FLAGGED_PLAYERS)
    .map((entry) => entry.playerId)

  return {
    ...(paceAdjustment === undefined ? {} : { recommendedPaceAdjustment: paceAdjustment }),
    ...(defensiveEmphasis === undefined ? {} : { recommendedDefensiveEmphasis: defensiveEmphasis }),
    flaggedPlayerIds,
  }
}

function clampPace(value: number): PaceAdjustment {
  return Math.max(-2, Math.min(2, value)) as PaceAdjustment
}

function hashToUnit(key: string): number {
  let hash = 2166136261
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0) / 0xffffffff
}

const FAMILIARITY_COVERAGE_BOOST = 0.05
const FAMILIARITY_CONFIDENCE_BOOST = 0.05
const FAMILIARITY_UNCERTAINTY_REDUCTION = 1

/**
 * §12: prior relevant Staff scouting history (existing `EvaluatorReport`s attributed via
 * `attributeKnowledgeDimension`) against `opponentTeamId`'s roster may provide a small, bounded
 * familiarity benefit — never created from hidden truth, only from the fact that the
 * organization has previously produced real reports about these players. Dimensions touched
 * carry provenance `'staffFamiliarity'`. Idempotent per generated report: this function is only
 * ever invoked once, from the exactly-once report-generation gate above, so the same game/report
 * cannot repeatedly compound familiarity across calendar ticks.
 */
function applyStaffFamiliarity(world: GameWorld, teamId: TeamId, opponentTeamId: TeamId, now: import('@/domain/date').GameDate): readonly import('@/domain/knowledge').OrganizationKnowledge[] {
  const organizationId = organizationIdForTeam(teamId)
  const opponent = getTeam(world, opponentTeamId)
  return world.organizationKnowledge.map((entry) => {
    if (entry.organizationId !== organizationId || !opponent.rosterPlayerIds.includes(entry.subjectPlayerId)) return entry
    const hasPriorStaffReports = Object.values(entry.dimensions).some((dimension) => attributeKnowledgeDimension(world, dimension).length > 0)
    if (!hasPriorStaffReports) return entry
    return {
      ...entry,
      dimensions: Object.fromEntries(Object.entries(entry.dimensions).map(([key, dimension]) => [key, boostWithFamiliarity(dimension, now)])),
    }
  })
}

function boostWithFamiliarity(dimension: OrganizationKnowledgeDimension, now: import('@/domain/date').GameDate): OrganizationKnowledgeDimension {
  return {
    ...dimension,
    coverage: Math.min(1, dimension.coverage + FAMILIARITY_COVERAGE_BOOST),
    confidence: Math.min(1, dimension.confidence + FAMILIARITY_CONFIDENCE_BOOST),
    ...(dimension.uncertainty === undefined ? {} : { uncertainty: Math.max(1, dimension.uncertainty - FAMILIARITY_UNCERTAINTY_REDUCTION) }),
    assessedAt: now,
    provenance: 'staffFamiliarity',
  }
}
