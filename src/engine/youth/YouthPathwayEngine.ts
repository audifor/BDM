import type { CompetitionId, PlayerId, TeamId } from '@/domain/ids'
import { calculateAge } from '@/domain/player'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { RegistrationCause, TeamPathwayRelation } from '@/domain/youth/ClubPathway'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'

export type YouthActionResult = { readonly ok: true; readonly world: GameWorld; readonly playerId: PlayerId } | { readonly ok: false; readonly world: GameWorld; readonly reason: string }

export function configureTeamPathway(world: GameWorld, relation: TeamPathwayRelation): GameWorld {
  const team = world.teams[relation.teamId], senior = world.teams[relation.seniorTeamId]
  if (!team || !senior || team.organizationId !== relation.organizationId || senior.organizationId !== relation.organizationId) throw new RangeError('Pathway teams must belong to its organization')
  for (const targetId of relation.movementTargetTeamIds) {
    const target = world.teams[targetId], targetRelation = Object.values(world.teamPathwayRelationsById).find((item) => item.teamId === targetId)
    if (!target || target.organizationId !== relation.organizationId || target.gender !== team.gender || targetId === team.id || targetRelation && targetRelation.seniorTeamId !== relation.seniorTeamId) throw new RangeError('Pathway movement target is incompatible')
  }
  if (Object.values(world.teamPathwayRelationsById).some((item) => item.teamId === relation.teamId && item.id !== relation.id)) throw new RangeError('Team already has a pathway relation')
  return updateGameWorld(world, { teamPathwayRelations: [...Object.values(world.teamPathwayRelationsById).filter((item) => item.id !== relation.id), relation] })
}

export function acceptYouthIntake(world: GameWorld, input: { cohortId: string; candidateIndex: number; youthTeamId: TeamId; competitionId: CompetitionId; actionId: string; decision: 'ACCEPT' | 'DECLINE' }): YouthActionResult {
  if (input.decision === 'DECLINE') return { ok: false, world, reason: 'INTAKE_DECLINED' }
  const team = world.teams[input.youthTeamId], competition = world.competitions[input.competitionId], cohort = world.talentCohortsById[input.cohortId]
  if (!team || !competition || !cohort || competition.gender !== team.gender || !competition.participantTeamIds.includes(team.id)) return { ok: false, world, reason: 'INVALID_YOUTH_INTAKE_SCOPE' }
  if (!Object.values(world.teamPathwayRelationsById).some((relation) => relation.teamId === team.id && relation.role === 'youth' && relation.organizationId === team.organizationId)) return { ok: false, world, reason: 'YOUTH_PATHWAY_NOT_CONFIGURED' }
  const existing = Object.values(world.playerRegistrationsById).find((item) => item.sourceActionId === input.actionId)
  if (existing) return existing.cause === 'ACADEMY_INTAKE' && existing.teamId === team.id ? { ok: true, world, playerId: existing.playerId } : { ok: false, world, reason: 'ACTION_ID_CONFLICT' }
  if (Object.values(world.teams).some((candidate) => candidate.rosterPlayerIds.some((id) => world.talentMaterializationsByCandidateKey[`${input.cohortId}:candidate:${input.candidateIndex.toString().padStart(6, '0')}`]?.playerId === id))) return { ok: false, world, reason: 'CANDIDATE_ALREADY_REGISTERED' }
  if (!world.placesById[cohort.placeId] || world.organizationsById[team.organizationId]?.primaryPlaceId !== cohort.placeId) return { ok: false, world, reason: 'COHORT_PLACE_UNAVAILABLE' }
  let materialized: ReturnType<typeof materializeTalentCandidate>
  try { materialized = materializeTalentCandidate(world, input.cohortId, input.candidateIndex, 'ACADEMY_INTAKE') } catch { return { ok: false, world, reason: 'CANDIDATE_UNAVAILABLE' } }
  const result = movePlayer(materialized.world, { playerId: materialized.player.id, toTeamId: team.id, competitionId: competition.id, cause: 'ACADEMY_INTAKE', actionId: input.actionId })
  return result.ok ? result : { ...result, world }
}

export function promotePathwayPlayer(world: GameWorld, input: { playerId: PlayerId; toTeamId: TeamId; competitionId?: CompetitionId; actionId: string }): YouthActionResult {
  const prior = world.playerRegistrationsById[`registration:${input.actionId}`]
  if (prior) return prior.playerId === input.playerId ? { ok: true, world, playerId: input.playerId } : { ok: false, world, reason: 'ACTION_ID_CONFLICT' }
  const source = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(input.playerId))
  if (!source) return { ok: false, world, reason: 'PLAYER_NOT_REGISTERED' }
  const relation = Object.values(world.teamPathwayRelationsById).find((item) => item.teamId === source.id)
  if (!relation || !relation.movementTargetTeamIds.includes(input.toTeamId)) return { ok: false, world, reason: 'INVALID_PATHWAY_DESTINATION' }
  const destination = Object.values(world.teamPathwayRelationsById).find((item) => item.teamId === input.toTeamId)
  const cause: RegistrationCause = input.toTeamId === relation.seniorTeamId || destination?.role === 'senior' ? 'SENIOR_PROMOTION' : destination?.role === 'reserve' ? 'RESERVE_PROMOTION' : 'AGE_GROUP_PROMOTION'
  return movePlayer(world, { ...input, cause })
}

export function releaseYouthPlayer(world: GameWorld, input: { playerId: PlayerId; actionId: string }): YouthActionResult {
  const prior = world.playerRegistrationsById[`registration:${input.actionId}`]
  if (prior) return prior.cause === 'RELEASE' && prior.playerId === input.playerId ? { ok: true, world, playerId: input.playerId } : { ok: false, world, reason: 'ACTION_ID_CONFLICT' }
  const source = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(input.playerId))
  if (!source) return { ok: false, world, reason: 'PLAYER_NOT_REGISTERED' }
  if (!Object.values(world.teamPathwayRelationsById).some((item) => item.teamId === source.id && item.role === 'youth')) return { ok: false, world, reason: 'PLAYER_NOT_IN_YOUTH_PATHWAY' }
  return movePlayer(world, { playerId: input.playerId, cause: 'RELEASE', actionId: input.actionId })
}

function movePlayer(world: GameWorld, input: { playerId: PlayerId; toTeamId?: TeamId; competitionId?: CompetitionId; cause: RegistrationCause; actionId: string }): YouthActionResult {
  const key = `registration:${input.actionId}`, prior = world.playerRegistrationsById[key]
  if (prior) return prior.playerId === input.playerId ? { ok: true, world, playerId: input.playerId } : { ok: false, world, reason: 'ACTION_ID_CONFLICT' }
  const player = world.players[input.playerId], target = input.toTeamId === undefined ? undefined : world.teams[input.toTeamId]
  if (!player || input.cause !== 'RELEASE' && !target) return { ok: false, world, reason: 'PLAYER_OR_TEAM_UNAVAILABLE' }
  const rosters = Object.values(world.teams).filter((team) => team.rosterPlayerIds.includes(player.id))
  if (rosters.length > 1) return { ok: false, world, reason: 'PLAYER_HAS_CONTRADICTORY_REGISTRATIONS' }
  const source = rosters[0]
  if (input.cause === 'RELEASE' && !source) return { ok: false, world, reason: 'PLAYER_NOT_REGISTERED' }
  if (source?.id === target?.id) return { ok: true, world, playerId: player.id }
  if (target) {
    const relation = Object.values(world.teamPathwayRelationsById).find((item) => item.teamId === target.id)
    if (!relation || relation.organizationId !== target.organizationId) return { ok: false, world, reason: 'PATHWAY_DESTINATION_NOT_CONFIGURED' }
    if (source && source.organizationId !== target.organizationId) return { ok: false, world, reason: 'CROSS_ORGANIZATION_MOVE_UNSUPPORTED' }
    if (player.gender !== target.gender) return { ok: false, world, reason: 'GENDER_MISMATCH' }
  }
  let seasonId: import('@/domain/ids').SeasonId | undefined
  const entryCompetitions = !target ? [] : input.competitionId ? [world.competitions[input.competitionId]] : Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(target.id) && competition.rules.playerAgeEligibility !== undefined)
  for (const competition of entryCompetitions) {
    if (!competition || !target || competition.gender !== player.gender || !competition.participantTeamIds.includes(target.id)) return { ok: false, world, reason: 'TEAM_NOT_IN_COMPETITION' }
    const band = competition.rules.playerAgeEligibility
    if (band) {
      const age = calculateAge(player.bio.dateOfBirth, world.currentDate)
      if (band.minimumAge !== undefined && age < band.minimumAge || band.maximumAge !== undefined && age > band.maximumAge) return { ok: false, world, reason: 'COMPETITION_AGE_INELIGIBLE' }
    }
    seasonId ??= Object.values(world.seasons).find((season) => season.competitionId === competition.id)?.id
  }
  const active = Object.values(world.playerRegistrationsById).find((item) => item.playerId === player.id && item.endsOn === undefined)
  const registrations = Object.values(world.playerRegistrationsById).map((item) => item.id === active?.id ? { ...item, endsOn: world.currentDate } : item)
  registrations.push({ id: key, playerId: player.id, teamId: target?.id ?? source!.id, organizationId: target?.organizationId ?? source!.organizationId, startsOn: world.currentDate, ...(input.competitionId ? { competitionId: input.competitionId } : {}), ...(seasonId ? { seasonId } : {}), ...(input.cause === 'RELEASE' ? { endsOn: world.currentDate } : {}), cause: input.cause, sourceActionId: input.actionId })
  const next = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === source?.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== player.id) } : target && team.id === target.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, player.id] } : team), playerRegistrations: registrations })
  return { ok: true, world: next, playerId: player.id }
}

export function getPlayerPathway(world: GameWorld, playerId: PlayerId) {
  const registrations = Object.values(world.playerRegistrationsById).filter((item) => item.playerId === playerId).sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  const currentTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))
  const currentLevel = currentTeam ? Object.values(world.teamPathwayRelationsById).find((item) => item.teamId === currentTeam.id)?.role : undefined
  const ageOutRequiresDecision = currentTeam ? Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(currentTeam.id) && competition.rules.playerAgeEligibility?.maximumAge !== undefined && calculateAge(world.players[playerId]!.bio.dateOfBirth, world.currentDate) > competition.rules.playerAgeEligibility.maximumAge) : false
  return { playerId, currentTeam, currentLevel, registrations, ageOutRequiresDecision, pathwayStatus: ageOutRequiresDecision ? 'AGE_OUT_REQUIRES_DECISION' as const : 'CURRENT' as const }
}

export function getYouthPlayersRequiringDecision(world: GameWorld) {
  return Object.values(world.players).flatMap((player) => {
    const pathway = getPlayerPathway(world, player.id)
    return pathway.ageOutRequiresDecision ? [pathway] : []
  })
}
