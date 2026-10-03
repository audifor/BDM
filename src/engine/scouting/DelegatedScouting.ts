import { type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
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
 * `prioritizeRegions`, when also delegated, now records the competition territory for the next
 * scheduled opponent. Territory authority comes from the scheduled game's competition, never
 * player nationality.
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

  const withPrioritization = applyPrioritizeRegions(world, teamId)
  const targets = selectBoundedScoutingTargets(withPrioritization.world, teamId, withPrioritization.priorityTerritory)
  if (targets.length === 0) return withPrioritization.world

  const evaluators = selectEvaluatorCandidates(withPrioritization.world, teamId)
  if (evaluators.length === 0) return withPrioritization.world

  const target = pickFromTopN(targets, qualityScore, `${seed}:target`)
  const evaluatorStaffId = pickFromTopN(evaluators, qualityScore, `${seed}:evaluator`)
  const organizationId = world.teams[teamId]!.organizationId

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
    staffRoleIdAtDecision: resolution.context.roleId,
    staffWasOverloadedAtDecision: resolution.context.workload.overloaded,
    payload: { targetPlayerId: target, evaluatorStaffId, missionType: 'QUICK_LOOK' },
  })
  return { ...withRequest, delegationOutcomesById: { ...withRequest.delegationOutcomesById, [outcomeId]: outcome } }
}

/**
 * Bounded target pool for `assignScouts`: the next scheduled opponent's roster, filtered to
 * players the organization has no existing knowledge of (mirrors `deriveScoutingNeeds`'s own
 * bounded-candidate + "no existing knowledge" filter, reused here rather than duplicated),
 * deterministically ordered. `priorityTerritory`, when provided by `prioritizeRegions`, is the
 * current scheduled game's competition territory. The bounded pool is already that opponent's
 * competition roster; stable player id order breaks ties without consulting biographical data.
 */
function selectBoundedScoutingTargets(world: GameWorld, teamId: TeamId, priorityTerritory: string | undefined): readonly PlayerId[] {
  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined) return []
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = world.teams[teamId]!.organizationId
  const unknownRoster = [...opponent.rosterPlayerIds].filter((playerId) => !world.organizationKnowledge.some((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId))
  if (unknownRoster.length === 0) return []

  // The scheduled competition is the bounded operation's territory. Keep this explicit so
  // future multi-territory target sources can use the same authority without nationality grouping.
  void priorityTerritory
  return [...unknownRoster].sort()
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
 * `prioritizeRegions` retains its persisted responsibility ID but now means “prioritize scouting
 * territories.” The current bounded target source is the next scheduled opponent, so its
 * competition is the territory focus. This stays within the existing bounded cadence and does not
 * create or allocate persistent territory operations on behalf of AI teams (that is deferred).
 */
function applyPrioritizeRegions(world: GameWorld, teamId: TeamId): { readonly world: GameWorld; readonly priorityTerritory: string | undefined } {
  const resolution = resolveDelegatedResponsibility(world, teamId, 'prioritizeRegions')
  if (resolution === undefined) return { world, priorityTerritory: undefined }

  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined || world.competitions[nextGame.competitionId] === undefined) return { world, priorityTerritory: undefined }
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const priorityTerritory = `COMPETITION:${nextGame.competitionId}`
  const prioritizeSeed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}:territory-priority`
  const prioritizeQuality = scoutingQuality(resolution.context, prioritizeSeed)

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${nextGame.id}:${world.currentDate}`)
  if (world.delegationOutcomesById[outcomeId] !== undefined) return { world, priorityTerritory }
  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind: 'prioritizeRegions',
    applied: true,
    qualityScore: prioritizeQuality,
    staffRoleIdAtDecision: resolution.context.roleId,
    staffWasOverloadedAtDecision: resolution.context.workload.overloaded,
    payload: { opponentTeamId, territoryKind: 'COMPETITION', competitionId: nextGame.competitionId },
  })
  return { world: { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: outcome } }, priorityTerritory }
}

