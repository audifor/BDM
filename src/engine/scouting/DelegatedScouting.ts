import { organizationIdForTeam, type PlayerId, type TeamId } from '@/domain/ids'
import { getNextScheduledGame, getTeam, type GameWorld } from '@/domain/world'
import { createDelegationOutcome, delegationOutcomeIdFromString } from '@/domain/responsibility'
import { resolveDelegatedResponsibility, scoutingQuality } from '@/engine/staff'
import { requestScouting } from './ScoutingEngine'

/**
 * Narrow autonomous Scouting orchestration hook (docs/STAFF_SYSTEM_V2.md §16). Decides only
 * WHICH bounded existing scouting request(s) to create for each team's `assignScouts`
 * responsibility, when genuinely delegated — `requestScouting()`/`progressScoutingAssignments()`
 * remain the sole assignment/report execution authority. This is never a second Scouting engine.
 *
 * Bounded target sources ONLY (docs §5.2 — never a world-wide player scan):
 * - the roster of the team's next scheduled opponent (`getNextScheduledGame`), when one exists.
 *
 * `prioritizeRegions`, when also delegated, influences target ORDERING only, using existing
 * bounded metadata already on `Player`/`RecruitProfile` — nationality identity here (no new
 * region entity/model is introduced; see docs §5.3).
 *
 * If a team has no bounded target source (no scheduled game) or no genuinely delegated
 * `assignScouts` holder, delegated scouting legitimately creates no new assignment for that team
 * on that day — never a fallback to an unbounded scan.
 */
export function progressDelegatedScouting(world: GameWorld): GameWorld {
  return Object.keys(world.teams).sort().reduce((next, teamId) => progressTeamDelegatedScouting(next, teamId as TeamId), world)
}

function progressTeamDelegatedScouting(world: GameWorld, teamId: TeamId): GameWorld {
  const resolution = resolveDelegatedResponsibility(world, teamId, 'assignScouts')
  if (resolution === undefined) return world

  const target = selectBoundedScoutingTarget(world, teamId)
  if (target === undefined) return world

  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = scoutingQuality(resolution.context, seed)
  const organizationId = organizationIdForTeam(teamId)

  const before = world.scoutingAssignmentsById
  const withRequest = requestScouting(world, {
    organizationId,
    playerId: target,
    missionType: 'QUICK_LOOK',
    evaluatorStaffId: resolution.staffId,
    requestedBy: 'SCOUTING_DEPARTMENT',
    staffQualityScore: qualityScore,
  })
  // requestScouting() no-ops (returns world unchanged) when a duplicate/in-progress request
  // already exists for this (organization, player, evaluator, mission) tuple — only record an
  // outcome for a genuinely new autonomous decision.
  if (withRequest.scoutingAssignmentsById === before) return world

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
    payload: { targetPlayerId: target, missionType: 'QUICK_LOOK' },
  })
  return { ...withRequest, delegationOutcomesById: { ...withRequest.delegationOutcomesById, [outcomeId]: outcome } }
}

/**
 * Bounded target selection for `assignScouts`: the next scheduled opponent's roster, filtered to
 * players the organization does not already have any knowledge of (mirrors
 * `deriveScoutingNeeds`'s own bounded-candidate + "no existing knowledge" filter, reused here
 * rather than duplicated), ordered deterministically. When `prioritizeRegions` is also
 * genuinely delegated, ordering is influenced by existing per-country roster grouping (players
 * sharing a nationality are scouted together, front-to-back by `nationalityId` then stable player
 * id) rather than plain alphabetical id order — existing `Player.nationalityId` metadata only, no
 * new region entity/geography model introduced. Falls back to plain stable id order when
 * `prioritizeRegions` is not delegated.
 */
function selectBoundedScoutingTarget(world: GameWorld, teamId: TeamId): PlayerId | undefined {
  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined) return undefined
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = organizationIdForTeam(teamId)
  const unknownRoster = [...opponent.rosterPlayerIds].filter((playerId) => !world.organizationKnowledge.some((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId))
  if (unknownRoster.length === 0) return undefined

  const prioritizationDelegated = resolveDelegatedResponsibility(world, teamId, 'prioritizeRegions') !== undefined
  if (!prioritizationDelegated) return [...unknownRoster].sort()[0]

  return [...unknownRoster].sort((a, b) => {
    const nationalityA = world.players[a]!.nationalityId
    const nationalityB = world.players[b]!.nationalityId
    return nationalityA.localeCompare(nationalityB) || a.localeCompare(b)
  })[0]
}
