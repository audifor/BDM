import { organizationIdForTeam, type PlayerId, type TeamId } from '@/domain/ids'
import { getNextScheduledGame, getTeam, type GameWorld } from '@/domain/world'
import { createDelegationOutcome, delegationOutcomeIdFromString } from '@/domain/responsibility'
import { resolveAdvisoryResponsibility, scoutingQuality } from '@/engine/staff'
import { requestScouting } from './ScoutingEngine'

/**
 * Advisory Scouting responsibilities (`oppositionReport`, `prospectReport`) remain `advisory` per
 * the canonical registry — they never auto-execute a new report type. When a genuine advisory
 * holder exists and a bounded target legitimately needs one, this triggers the EXISTING
 * `requestScouting()` path exactly as a manual `HEAD_COACH` request would, just attributed to
 * `'SCOUTING_DEPARTMENT'`. `progressScoutingAssignments()` remains the sole path that turns the
 * resulting `ScoutingAssignment` into a real `EvaluatorReport` — nothing here manufactures a
 * report directly. The `DelegationOutcome` recorded here is `applied: false`: creating the
 * scouting REQUEST is itself advisory information ("staff recommends looking into this"), not an
 * irreversible action, so it is recorded advisory rather than applied, matching the mode.
 */
export function progressAdvisoryScoutingReports(world: GameWorld): GameWorld {
  return Object.keys(world.teams).sort().reduce((next, teamId) => progressTeamAdvisoryReports(next, teamId as TeamId), world)
}

function progressTeamAdvisoryReports(world: GameWorld, teamId: TeamId): GameWorld {
  const withOpposition = progressOppositionReport(world, teamId)
  return progressProspectReport(withOpposition, teamId)
}

/** Bounded target: the next scheduled opponent's roster (mirrors DelegatedScouting.ts's assignScouts target source). */
function progressOppositionReport(world: GameWorld, teamId: TeamId): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'oppositionReport')
  if (resolution === undefined) return world
  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame === undefined) return world
  const opponentTeamId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
  const opponent = getTeam(world, opponentTeamId)
  const organizationId = organizationIdForTeam(teamId)
  const target = [...opponent.rosterPlayerIds].filter((playerId) => !world.organizationKnowledge.some((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId)).sort()[0]
  if (target === undefined) return world
  return recordAdvisoryScoutingRequest(world, teamId, resolution, 'oppositionReport', organizationId, target, 'FULL_REPORT')
}

/** Bounded target: the team's own recruiting board entries (recruiting-domain bounded source, matches docs §5.3's suggested existing metadata; NCAA-like-gated by the recruiting responsibility eligibility already encoded in the registry). */
function progressProspectReport(world: GameWorld, teamId: TeamId): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'prospectReport')
  if (resolution === undefined) return world
  const organizationId = organizationIdForTeam(teamId)
  const boardRecruitIds = world.recruitingBoards.filter((entry) => entry.programTeamId === teamId).map((entry) => entry.recruitId).sort()
  const target = boardRecruitIds
    .map((recruitId) => world.recruitProfilesById[recruitId]?.playerId)
    .find((playerId): playerId is PlayerId => playerId !== undefined && !world.organizationKnowledge.some((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId))
  if (target === undefined) return world
  return recordAdvisoryScoutingRequest(world, teamId, resolution, 'prospectReport', organizationId, target, 'FULL_REPORT')
}

function recordAdvisoryScoutingRequest(
  world: GameWorld,
  teamId: TeamId,
  resolution: ReturnType<typeof resolveAdvisoryResponsibility>,
  kind: 'oppositionReport' | 'prospectReport',
  organizationId: ReturnType<typeof organizationIdForTeam>,
  target: PlayerId,
  missionType: 'FULL_REPORT',
): GameWorld {
  if (resolution === undefined) return world
  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = scoutingQuality(resolution.context, seed)

  const before = world.scoutingAssignmentsById
  const withRequest = requestScouting(world, {
    organizationId,
    playerId: target,
    missionType,
    evaluatorStaffId: resolution.staffId,
    requestedBy: 'SCOUTING_DEPARTMENT',
    teamContextId: teamId,
    staffQualityScore: qualityScore,
  })
  if (withRequest.scoutingAssignmentsById === before) return world

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${target}:${world.currentDate}`)
  if (withRequest.delegationOutcomesById[outcomeId] !== undefined) return withRequest
  const requestedAssignmentId = Object.keys(withRequest.scoutingAssignmentsById).find((id) => before[id] === undefined)
  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind,
    applied: false,
    qualityScore,
    payload: { targetPlayerId: target, missionType, ...(requestedAssignmentId === undefined ? {} : { assignmentId: requestedAssignmentId }) },
  })
  return { ...withRequest, delegationOutcomesById: { ...withRequest.delegationOutcomesById, [outcomeId]: outcome } }
}
