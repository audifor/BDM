import { createCoach } from '@/domain/coach'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { parseGameDate } from '@/domain/date'
import { coachIdFromString, competitionIdFromString, countryIdFromString, ecosystemIdFromString, gameIdFromString, playerIdFromString, seasonIdFromString, teamIdFromString, type PlayerId } from '@/domain/ids'
import { createPlayer, type PlayerRatings } from '@/domain/player'
import { createSeason } from '@/domain/season'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { createTeam } from '@/domain/team'
import { createGame } from '@/domain/game'
import { attachWorldDbCompetitionRuntime, createGameWorld, type GameWorld, type WorldDbCompetitionRuntimeBundlePin } from '@/domain/world'
import type { WorldDbGameBootstrapSelectionV1, WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'

export function bootstrapGameWorldFromWorldDb(
  slice: WorldDbGameBootstrapSliceV1,
  selection: WorldDbGameBootstrapSelectionV1,
  runtimeBundlePin: WorldDbCompetitionRuntimeBundlePin,
): GameWorld {
  assertSelectionMatchesSlice(slice, selection)
  if (runtimeBundlePin.worldDbSchema !== slice.source.schemaId) throw new Error('World DB bootstrap runtime schema identity mismatch')

  const countries = slice.countries.map((country) => createCountry({
    id: countryIdFromString(country.countryId),
    name: country.name,
    code: country.code,
  }))
  const countryIds = new Set(countries.map((country) => String(country.id)))
  for (const id of slice.teams.map((team) => team.countryId)) if (!countryIds.has(id)) throw new Error(`World DB bootstrap team country is missing: ${id}`)
  for (const id of slice.players.map((player) => player.nationalityId)) if (!countryIds.has(id)) throw new Error(`World DB bootstrap player nationality is missing: ${id}`)

  const seasonId = seasonIdFromString(slice.season.seasonId)
  const competitionId = competitionIdFromString(slice.competition.competitionId)
  const teams = slice.teams.map((team) => createTeam({
    id: teamIdFromString(team.teamId),
    name: team.name,
    gender: team.gender,
    countryId: countryIdFromString(team.countryId),
    rosterPlayerIds: rosterForTeam(slice, team.teamId),
    ...(team.teamId === selection.teamId ? { coachId: coachIdFromString(coachIdForTeam(team.teamId)) } : {}),
  }))
  const players = slice.players.map((player) => createPlayer({
    id: playerIdFromString(player.playerId),
    firstName: player.firstName,
    lastName: player.lastName,
    gender: player.gender,
    nationalityId: countryIdFromString(player.nationalityId),
    basketball: { primaryPosition: player.primaryPosition, ratings: player.ratings as PlayerRatings },
    bio: {
      dateOfBirth: parseGameDate(player.dateOfBirth),
      heightCm: player.heightCm,
      weightKg: player.weightKg,
      ...(player.wingspanCm === undefined ? {} : { wingspanCm: player.wingspanCm }),
      ...(player.standingReachCm === undefined ? {} : { standingReachCm: player.standingReachCm }),
      ...(player.dominantHand === undefined ? {} : { dominantHand: player.dominantHand }),
    },
  }))
  const coach = createCoach({
    id: coachIdFromString(coachIdForTeam(selection.teamId)),
    firstName: 'BDM',
    lastName: 'World DB Manager',
    gender: slice.competition.gender,
    nationalityId: countryIdFromString(slice.teams.find((team) => team.teamId === selection.teamId)!.countryId),
  })
  const competition = createCompetition({
    id: competitionId,
    name: slice.competition.name,
    gender: slice.competition.gender,
    ecosystemId: ecosystemIdFromString(slice.ecosystem.ecosystemId),
    participantTeamIds: teams.map((team) => team.id),
  })
  const season = createSeason({
    id: seasonId,
    competitionId,
    label: slice.season.label,
    startDate: parseGameDate(slice.season.startDate),
    endDate: parseGameDate(slice.season.endDate),
    participantTeamIds: teams.map((team) => team.id),
  })
  const games = slice.matches.map((match) => materializeMatch(slice, match))
  const world = createGameWorld({
    currentDate: season.startDate,
    currentSeasonId: season.id,
    userCoachId: coach.id,
    countries,
    coaches: [coach],
    players,
    teams,
    competitions: [competition],
    ecosystems: [createSportsEcosystem({ id: ecosystemIdFromString(slice.ecosystem.ecosystemId), name: slice.ecosystem.name, kind: slice.ecosystem.kind, category: slice.ecosystem.category })],
    seasons: [season],
    games,
  })
  return attachWorldDbCompetitionRuntime(world, {
    competitionRuntimeBundle: runtimeBundlePin,
    competitionPlanIds: [],
    competitionSeasonIds: [slice.season.competitionSeasonId],
  })
}

function assertSelectionMatchesSlice(slice: WorldDbGameBootstrapSliceV1, selection: WorldDbGameBootstrapSelectionV1): void {
  if (slice.source.databaseId !== selection.source.databaseId || slice.source.schemaId !== selection.source.schemaId) throw new Error('World DB bootstrap slice source identity mismatch')
  if (slice.ecosystem.ecosystemId !== selection.ecosystemId) throw new Error('World DB bootstrap ecosystem mismatch')
  if (slice.competition.competitionId !== selection.competitionId) throw new Error('World DB bootstrap competition mismatch')
  if (slice.season.competitionSeasonId !== selection.competitionSeasonId) throw new Error('World DB bootstrap competition season mismatch')
  if (slice.competition.ecosystemId !== slice.ecosystem.ecosystemId) throw new Error('World DB bootstrap competition ecosystem relation is invalid')
  if (slice.season.competitionSeasonId.length === 0 || slice.season.seasonId.length === 0) throw new Error('World DB bootstrap competition season identity is invalid')
  if (!slice.teams.some((team) => team.teamId === selection.teamId)) throw new Error(`World DB bootstrap team is not in competition season: ${selection.teamId}`)
  if (slice.teams.length < 2) throw new Error('World DB bootstrap competition season requires at least two teams')
  const assignments = activeAssignments(slice)
  if (new Set(slice.teams.map((team) => team.teamId)).size !== slice.teams.length) throw new Error('World DB bootstrap contains duplicate team IDs')
  if (new Set(slice.players.map((player) => player.playerId)).size !== slice.players.length) throw new Error('World DB bootstrap contains duplicate player IDs')
  if (new Set(assignments.map((assignment) => assignment.playerId)).size !== assignments.length) throw new Error('World DB bootstrap contains duplicate player roster assignments')
  const teamIds = new Set(slice.teams.map((team) => team.teamId))
  const playerIds = new Set(slice.players.map((player) => player.playerId))
  for (const assignment of assignments) {
    if (!teamIds.has(assignment.teamId)) throw new Error(`World DB bootstrap roster assignment references unloaded team: ${assignment.teamId}`)
    if (!playerIds.has(assignment.playerId)) throw new Error(`World DB bootstrap roster assignment references unloaded player: ${assignment.playerId}`)
  }
  if (rosterForTeam(slice, selection.teamId).length < 5) throw new Error(`World DB bootstrap selected team has fewer than five active players: ${selection.teamId}`)
}

function activeAssignments(slice: WorldDbGameBootstrapSliceV1) { return slice.rosterAssignments.filter((assignment) => assignment.status.toUpperCase() === 'ACTIVE') }
function rosterForTeam(slice: WorldDbGameBootstrapSliceV1, teamId: string): readonly PlayerId[] { return activeAssignments(slice).filter((assignment) => assignment.teamId === teamId).map((assignment) => playerIdFromString(assignment.playerId)) }
function coachIdForTeam(teamId: string): string { return `world-db-bootstrap-coach:${teamId}` }
function materializeMatch(slice: WorldDbGameBootstrapSliceV1, match: WorldDbGameBootstrapSliceV1['matches'][number]) {
  const status = match.status.toUpperCase() === 'COMPLETED' ? 'completed' : match.status.toUpperCase() === 'SCHEDULED' ? 'scheduled' : (() => { throw new Error(`World DB bootstrap match status is unsupported: ${match.status}`) })()
  const dateText = match.scheduledAt ?? match.playedAt
  if (dateText === null) throw new Error(`World DB bootstrap match has no scheduled or played date: ${match.matchId}`)
  const date = parseGameDate(dateText.slice(0, 10))
  const result = status === 'completed' ? { homeScore: match.homeScore ?? -1, awayScore: match.awayScore ?? -1 } : null
  if (result !== null && (result.homeScore < 0 || result.awayScore < 0)) throw new Error(`World DB bootstrap completed match has no score: ${match.matchId}`)
  if (!slice.teams.some((team) => team.teamId === match.homeTeamId) || !slice.teams.some((team) => team.teamId === match.awayTeamId)) throw new Error(`World DB bootstrap match references a team outside the season: ${match.matchId}`)
  return createGame({
    id: gameIdFromString(match.matchId),
    seasonId: seasonIdFromString(slice.season.seasonId),
    competitionId: competitionIdFromString(slice.competition.competitionId),
    date,
    homeTeamId: teamIdFromString(match.homeTeamId),
    awayTeamId: teamIdFromString(match.awayTeamId),
    status,
    result,
    stakes: 'regular',
  })
}
