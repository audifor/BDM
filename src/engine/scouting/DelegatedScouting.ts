import { organizationIdForTeam, type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
import { calculateStaffWorkload, getNextScheduledGame, getTeam, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import { createDelegationOutcome, delegationOutcomeIdFromString } from '@/domain/responsibility'
import { resolveDelegatedResponsibility, scoutingQuality } from '@/engine/staff'
import { calculateStaffRoleProficiencyByRoleId, staffRoleIdsInDepartment } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { activeWorkload, requestScouting } from './ScoutingEngine'

/**
 * Narrow autonomous Scouting orchestration hook (docs/STAFF_SYSTEM_V2.md §16). Decides only
 * WHICH bounded existing scouting request(s) to create for each team's `assignScouts`
 * responsibility, when genuinely delegated — `requestScouting()`/`progressScoutingAssignments()`
 * remain the sole assignment/report execution authority. This is never a second Scouting engine.
 *
 * The `assignScouts` holder is modeled as the department's DISTRIBUTOR, not the sole executor: it
 * ranks bounded targets and bounded evaluator candidates (real Staff with a scouting-department
 * role on the same team, per `staffRoleIdsInDepartment('scouting')`) independently, then commits
 * to one (target, evaluator) pairing from a `scoutingQuality`-sized top-N band of each ranking via
 * `SeededRandomSource` — never `Math.random`. The holder itself is only ever selected as evaluator
 * when its own role is legitimately in the scouting-department set (it is never forced to
 * self-assign). See `selectBoundedScoutingTargets`/`selectEvaluatorCandidate` below.
 *
 * Bounded target sources ONLY (docs §5.2 — never a world-wide player scan):
 * - the roster of the team's next scheduled opponent (`getNextScheduledGame`), when one exists.
 *
 * `prioritizeRegions`, when also delegated, computes its own `scoutingQuality` and reorders the
 * bounded target pool by existing bounded metadata only (nationality-grouped, largest
 * unknown-nationality-cluster first) — no new region entity/model is introduced (see docs §5.3).
 * It records its own `DelegationOutcome` exactly once, only when it genuinely changes the
 * resulting ordering.
 *
 * If a team has no bounded target source (no scheduled game), no unknown target, or no genuinely
 * delegated `assignScouts` holder, delegated scouting legitimately creates no new assignment for
 * that team on that day — never a fallback to an unbounded scan.
 */
export function progressDelegatedScouting(world: GameWorld): GameWorld {
  return Object.keys(world.teams).sort().reduce((next, teamId) => progressTeamDelegatedScouting(next, teamId as TeamId), world)
}

function progressTeamDelegatedScouting(world: GameWorld, teamId: TeamId): GameWorld {
  const resolution = resolveDelegatedResponsibility(world, teamId, 'assignScouts')
  if (resolution === undefined) return world

  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = scoutingQuality(resolution.context, seed)

  const withPrioritization = applyPrioritizeRegions(world, teamId, seed, qualityScore)
  const targets = selectBoundedScoutingTargets(withPrioritization.world, teamId, withPrioritization.nationalityOrder)
  if (targets.length === 0) return withPrioritization.world

  const evaluators = selectEvaluatorCandidates(withPrioritization.world, teamId)
  if (evaluators.length === 0) return withPrioritization.world

  const target = pickFromTopN(targets, qualityScore, `${seed}:target`)
  const evaluatorStaffId = pickFromTopN(evaluators, qualityScore, `${seed}:evaluator`)
  const organizationId = organizationIdForTeam(teamId)

  const before = withPrioritization.world.scoutingAssignmentsById
  const withRequest = requestScouting(withPrioritization.world, {
    organizationId,
    playerId: target,
    missionType: 'QUICK_LOOK',
    evaluatorStaffId,
    requestedBy: 'SCOUTING_DEPARTMENT',
    staffQualityScore: qualityScore,
  })
  // requestScouting() no-ops (returns world unchanged) when a duplicate/in-progress request
  // already exists for this (organization, player, evaluator, mission) tuple — only record an
  // outcome for a genuinely new autonomous decision.
  if (withRequest.scoutingAssignmentsById === before) return withPrioritization.world

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${target}:${world.currentDate}`)
  if (withRequest.delegationOutcomesById[outcomeId] !== undefined) return withRequest
  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind: 'assignScouts',
    applied: true,
    qualityScore,
    payload: { targetPlayerId: target, evaluatorStaffId, missionType: 'QUICK_LOOK' },
  })
  return { ...withRequest, delegationOutcomesById: { ...withRequest.delegationOutcomesById, [outcomeId]: outcome } }
}

/**
 * Bounded target pool for `assignScouts`: the next scheduled opponent's roster, filtered to
 * players the organization has no existing knowledge of (mirrors `deriveScoutingNeeds`'s own
 * bounded-candidate + "no existing knowledge" filter, reused here rather than duplicated),
 * deterministically ordered. `nationalityOrder`, when provided by a genuinely delegated
 * `prioritizeRegions`, reorders by nationality-cluster priority; otherwise falls back to plain
 * stable id order.
 */
function selectBoundedScoutingTargets(world: GameWorld, teamId: TeamId, nationalityOrder: readonly string[] | undefined): readonly PlayerId[] {
  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined) return []
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = organizationIdForTeam(teamId)
  const unknownRoster = [...opponent.rosterPlayerIds].filter((playerId) => !world.organizationKnowledge.some((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId))
  if (unknownRoster.length === 0) return []

  if (nationalityOrder === undefined) return [...unknownRoster].sort()

  const priority = new Map(nationalityOrder.map((nationalityId, index) => [nationalityId, index]))
  return [...unknownRoster].sort((a, b) => {
    const rankA = priority.get(world.players[a]!.nationalityId) ?? nationalityOrder.length
    const rankB = priority.get(world.players[b]!.nationalityId) ?? nationalityOrder.length
    return rankA - rankB || a.localeCompare(b)
  })
}

/**
 * Bounded evaluator pool: real Staff on `teamId` whose assigned role is in the canonical
 * scouting-department role set (`staffRoleIdsInDepartment('scouting')` — headScout, regionalScout,
 * advanceScout, collegeScout, internationalScout, proScout). The `assignScouts` holder qualifies
 * only when its own role is also in this set; it is never forced to self-assign. Ranked by role
 * proficiency (`calculateStaffRoleProficiencyByRoleId`) minus a workload/capacity penalty derived
 * from existing active scouting workload and `calculateStaffWorkload`, so a department with
 * multiple scouts can distribute more work than a department with only one. Deterministic tie-break
 * by staff id.
 */
function selectEvaluatorCandidates(world: GameWorld, teamId: TeamId): readonly StaffPersonId[] {
  const scoutingRoleIds = new Set(staffRoleIdsInDepartment('scouting'))
  const candidates = getTeamStaffAssignments(world, teamId).filter((assignment) => scoutingRoleIds.has(assignment.role))
  return candidates
    .map((assignment) => {
      const staff = world.staffPeopleById[assignment.staffPersonId]!
      const proficiency = calculateStaffRoleProficiencyByRoleId(staff, assignment.role)
      const workload = calculateStaffWorkload(world, assignment.staffPersonId)
      const capacityPenalty = workload.overloaded ? 100 : activeWorkload(world, assignment.staffPersonId) * 5
      return { staffId: assignment.staffPersonId, rank: proficiency - capacityPenalty }
    })
    .sort((a, b) => b.rank - a.rank || a.staffId.localeCompare(b.staffId))
    .map((entry) => entry.staffId)
}

/**
 * Wave 3 quality-gated top-N selection (§2.4): higher `scoutingQuality` narrows toward the top of
 * an already-deterministic ranking; lower quality draws from a wider (but still bounded) band.
 * Selection within the band uses `SeededRandomSource` keyed off a stable seed — same world + same
 * ids + same date always yields the same pick, never `Math.random`.
 */
function topNForQuality(qualityScore: number): number {
  if (qualityScore >= 80) return 1
  if (qualityScore >= 60) return 2
  if (qualityScore >= 35) return 3
  return 4
}

function pickFromTopN<Item>(ranked: readonly Item[], qualityScore: number, seed: string): Item {
  const bandSize = Math.min(ranked.length, topNForQuality(qualityScore))
  const band = ranked.slice(0, bandSize)
  if (band.length === 1) return band[0]!
  const random = new SeededRandomSource(hashStringToSeed(seed))
  return random.pick(band)
}

/**
 * `prioritizeRegions` (§2.6): produces a real, bounded reordering signal rather than a fixed
 * alphabetical sort. It resolves its own canonical holder/context (independent of `assignScouts`'s
 * holder — they may or may not be the same Staff), computes its own `scoutingQuality`, and derives
 * a nationality-cluster priority from EXISTING bounded metadata only: the next opponent's roster,
 * grouped by `Player.nationalityId`, ranked by how many roster players of that nationality the
 * organization has no knowledge of yet (larger unknown clusters prioritized — never comparing
 * Staff nationality to Player nationality, since no such affinity is modeled). Quality narrows how
 * many of the largest clusters are actually surfaced ahead of the rest (top-N banding, same
 * discipline as target/evaluator selection) via `SeededRandomSource`, never `Math.random`. Still
 * never creates a new Region entity — it only ever reorders the existing bounded target pool.
 * Records its own `DelegationOutcome` exactly once per (responsibility, day) when it genuinely
 * produces a non-trivial ordering (more than one nationality cluster to prioritize among).
 */
function applyPrioritizeRegions(world: GameWorld, teamId: TeamId, assignScoutsSeed: string, assignScoutsQuality: number): { readonly world: GameWorld; readonly nationalityOrder: readonly string[] | undefined } {
  const resolution = resolveDelegatedResponsibility(world, teamId, 'prioritizeRegions')
  if (resolution === undefined) return { world, nationalityOrder: undefined }

  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined) return { world, nationalityOrder: undefined }
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = organizationIdForTeam(teamId)

  const unknownByNationality = new Map<string, number>()
  for (const playerId of opponent.rosterPlayerIds) {
    const known = world.organizationKnowledge.some((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId)
    if (known) continue
    const nationalityId = world.players[playerId]!.nationalityId
    unknownByNationality.set(nationalityId, (unknownByNationality.get(nationalityId) ?? 0) + 1)
  }
  const clusters = [...unknownByNationality.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (clusters.length <= 1) return { world, nationalityOrder: clusters.map(([nationalityId]) => nationalityId) }

  const prioritizeSeed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const prioritizeQuality = scoutingQuality(resolution.context, prioritizeSeed)
  const bandSize = Math.min(clusters.length, topNForQuality(prioritizeQuality))
  const prioritized = clusters.slice(0, bandSize).map(([nationalityId]) => nationalityId)
  const rest = clusters.slice(bandSize).map(([nationalityId]) => nationalityId)
  const nationalityOrder = [...prioritized, ...rest]

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${nextGame.id}:${world.currentDate}`)
  if (world.delegationOutcomesById[outcomeId] !== undefined) return { world, nationalityOrder }
  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind: 'prioritizeRegions',
    applied: true,
    qualityScore: prioritizeQuality,
    payload: { opponentTeamId, prioritizedNationalityCount: prioritized.length },
  })
  return { world: { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: outcome } }, nationalityOrder }
}

