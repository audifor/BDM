import { pendingBindingRosterPlayerIds } from './RecruitingRosterCommitments'
import { getPlayerContractStatus } from '@/domain/contract'
import { addYears } from '@/domain/date'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { playerTransactionIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createPlayerRegistration } from '@/domain/youth/ClubPathway'
import { assessCollegeEligibility, deriveCollegeEligibilityClock, enrollPlayer, recordCollegeEligibilityAssessment, resolveCollegeRuleset } from '@/engine/eligibility/EligibilityEngine'

export function getNcaaIntakeContext(world: GameWorld, teamId: TeamId) {
  const competition = Object.values(world.competitions).find(item => item.participantTeamIds.includes(teamId) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
  const seasons = competition ? Object.values(world.seasons).filter(item => item.competitionId === competition.id).sort((a, b) => b.startDate.localeCompare(a.startDate)) : []
  const season = seasons.find(item => item.startDate <= world.currentDate && item.endDate >= world.currentDate) ?? [...seasons].reverse().find(item => item.startDate > world.currentDate) ?? seasons[0]
  return competition && season ? { competition, season } : undefined
}

/** Existing identities only. Recruiting/Portal destinations and professional commitments take priority. */
export function isNcaaWalkOnAvailable(world: GameWorld, teamId: TeamId, playerId: PlayerId): boolean {
  const player = world.players[playerId]
  const team = world.teams[teamId]
  const context = getNcaaIntakeContext(world, teamId)
  if (!player || !team || !context || player.careerEnd || player.gender !== team.gender || !player.pathwayHistory?.length
    || Object.values(world.teams).some(item => item.rosterPlayerIds.includes(playerId))) return false
  if (Object.values(world.contractsById).some(item => item.playerId === playerId && ['active', 'scheduled'].includes(getPlayerContractStatus(item, world.currentDate)))) return false
  if (Object.values(world.playerRightsById).some(item => item.playerId === playerId && item.status === 'active' && (item.expiresAt === undefined || item.expiresAt >= world.currentDate))) return false
  if (Object.values(world.playerEnrollmentsById).some(item => item.playerId === playerId && item.status === 'active')) return false
  if (Object.values(world.playerRegistrationsById).some(item => item.playerId === playerId && item.endsOn === undefined)) return false
  if (Object.values(world.transferPortalEntriesById).some(item => item.playerId === playerId && ['noticePending', 'authorized'].includes(item.status))) return false
  if (pendingBindingRosterPlayerIds(world).has(playerId)) return false
  const rules = resolveCollegeRuleset(world, context.competition.ecosystemId, world.currentDate)
  if (!rules) return false
  const clock = deriveCollegeEligibilityClock(world, playerId, rules)
  return clock === undefined || world.currentDate < addYears(clock.startsOn, rules.eligibilityClock!.periodYears)
}

/** Public position and organization knowledge only; legal eligibility is checked by the command. */
export function rankNcaaWalkOnCandidates(world: GameWorld, teamId: TeamId): readonly PlayerId[] {
  const team = world.teams[teamId]
  if (!team) return []
  const positions = new Map<string, number>()
  for (const id of team.rosterPlayerIds) { const position = world.players[id]!.basketball.primaryPosition; positions.set(position, (positions.get(position) ?? 0) + 1) }
  return Object.values(world.players).filter(player => isNcaaWalkOnAvailable(world, teamId, player.id)).map(player => ({
    id: player.id,
    depth: positions.get(player.basketball.primaryPosition) ?? 0,
    score: deriveOrganizationPlayerValuation({ organizationId: team.organizationId, playerId: player.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'RECRUITING', publicPosition: player.basketball.primaryPosition, policy: world.organizationEvaluationPoliciesById[team.organizationId] }).priorityScore,
  })).sort((a, b) => a.depth - b.depth || b.score - a.score || a.id.localeCompare(b.id)).map(item => item.id)
}

/** Atomic no-aid admission: failed assessments expose none of the staged changes. */
export function enrollNcaaWalkOn(world: GameWorld, teamId: TeamId, playerId: PlayerId, provenance: 'MARKET' | 'WORLD_REPAIR' = 'MARKET'): GameWorld {
  if (!isNcaaWalkOnAvailable(world, teamId, playerId)) return world
  const { competition, season } = getNcaaIntakeContext(world, teamId)!
  const team = world.teams[teamId]!
  const actionId = `ncaa-walk-on:${teamId}:${playerId}:${world.currentDate}`
  const registration = createPlayerRegistration({ id: `registration:${actionId}`, playerId, teamId, organizationId: team.organizationId, startsOn: world.currentDate, competitionId: competition.id, seasonId: season.id, cause: 'NCAA_WALK_ON', sourceActionId: actionId })
  let staged = updateGameWorld(world, { teams: Object.values(world.teams).map(item => item.id === teamId ? { ...item, rosterPlayerIds: [...item.rosterPlayerIds, playerId] } : item), playerRegistrations: [...Object.values(world.playerRegistrationsById), registration] })
  const previous = Object.values(world.playerEnrollmentsById).filter(item => item.playerId === playerId && item.ecosystemId === competition.ecosystemId).sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]
  const enrolled = enrollPlayer(staged, { playerId, teamId, ecosystemId: competition.ecosystemId, actionId, evidence: { fullTimeEnrollmentTermStartedAt: world.currentDate, firstClassAttendanceAt: world.currentDate, academicLevel: previous?.academicLevel ?? 'UNDERGRADUATE', ...(previous && previous.teamId !== teamId ? { transferFromEnrollmentId: previous.id, ...(previous.firstAcademicTermEndsOn ? { firstAcademicTermEndsOn: previous.firstAcademicTermEndsOn } : {}), ...(previous.nextAcademicYearStartsOn ? { nextAcademicYearStartsOn: previous.nextAcademicYearStartsOn } : {}) } : {}) } })
  if (!enrolled.ok) return world
  staged = enrolled.world
  const academic = previous && Object.values(world.academicProfilesById).find(item => item.playerId === playerId && item.programTeamId === previous.teamId && item.ecosystemId === competition.ecosystemId)
  if (academic) staged = updateGameWorld(staged, { academicProfiles: Object.values(staged.academicProfilesById).map(item => item.playerId === playerId && item.programTeamId === teamId && item.ecosystemId === competition.ecosystemId ? { ...academic, id: item.id, programTeamId: teamId } : item) })
  if (!assessCollegeEligibility(staged, { playerId, teamId, ecosystemId: competition.ecosystemId })?.eligible) return world
  staged = recordCollegeEligibilityAssessment(staged, { playerId, teamId, ecosystemId: competition.ecosystemId })
  return updateGameWorld(staged, { playerTransactions: [...Object.values(staged.playerTransactionsById), { id: playerTransactionIdFromString(actionId), playerId, kind: 'ncaaWalkOn', occurredOn: world.currentDate, toTeamId: teamId, provenance }] })
}
