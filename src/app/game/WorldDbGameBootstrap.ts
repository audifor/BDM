import { createCoach } from '@/domain/coach'
import { createCompetition, defaultLeagueCompetitionRules } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { parseGameDate } from '@/domain/date'
import { createPerson } from '@/domain/person'
import { DEVELOPMENT_DOMAINS, createDevelopmentProfile, type DevelopmentStage } from '@/domain/player/PlayerDevelopmentProfile'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthRatings, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'
import { createPlayer } from '@/domain/player'
import { createSeason } from '@/domain/season'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { coachIdFromString, competitionIdFromString, countryIdFromString, ecosystemIdFromString, gameIdFromString, playerIdFromString, seasonIdFromString, staffPersonIdFromString, teamIdFromString, teamStaffAssignmentIdFromString, type PlayerId } from '@/domain/ids'
import { createStaffPerson, createTeamStaffAssignment, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, type StaffPerson, type StaffRoleFamily } from '@/domain/staff'
import { createTeam } from '@/domain/team'
import { createGame } from '@/domain/game'
import { attachWorldDbCompetitionRuntime, createGameWorld, type GameWorld, type WorldDbCompetitionRuntimeBundlePin } from '@/domain/world'
import { distributeRoundsAcrossSeason, generateRoundRobinSchedule } from '@/engine/competition/schedule'
import type { WorldDbGameBootstrapSelectionV1, WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'

const ROLE_FAMILIES: Readonly<Record<string, StaffRoleFamily>> = {
  headCoach: 'coaching', assistantCoach: 'coaching', playerDevelopmentCoach: 'coaching',
  physiotherapist: 'medical', regionalScout: 'scouting', strengthConditioningCoach: 'performance', recruitingCoordinator: 'recruiting',
}

/** DDL-12 stores the complete 80-value Staff source vector without semantic labels. The runtime
 * StaffProfile has the certified 13-key interface, so this adapter uses a stable non-overlapping
 * bucket mean. It is a projection only; no source values are invented or persisted to World DB. */
function projectStaffAttributes(source: Readonly<Record<string, number>>): StaffPerson['professional']['attributes'] {
  const sourceKeys = Object.keys(source).sort()
  if (sourceKeys.length !== 80 || sourceKeys.some((key, index) => key !== `STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`)) throw new RangeError('World DB Staff source attributes must contain STAFF_ATTRIBUTE_01..80')
  const result = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key, index) => {
    const start = Math.floor(index * sourceKeys.length / STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length)
    const end = Math.floor((index + 1) * sourceKeys.length / STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length)
    const values = sourceKeys.slice(start, end).map((sourceKey) => source[sourceKey]!)
    return [key, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)]
  }))
  return result as StaffPerson['professional']['attributes']
}

const DEVELOPMENT_MAP: Readonly<Record<string, readonly string[]>> = {
  SHOOTING: ['shooting'], FINISHING: ['finishing'], BALL_HANDLING: ['creation'], PLAYMAKING: ['passing'],
  OFF_BALL_OFFENSE: ['creation'], DEFENSE_REBOUNDING: ['defense', 'rebounding'], PHYSICAL: ['physical'], MENTAL: ['mental'],
}

export function bootstrapGameWorldFromWorldDb(slice: WorldDbGameBootstrapSliceV1, selection: WorldDbGameBootstrapSelectionV1, runtimeBundlePin: WorldDbCompetitionRuntimeBundlePin): GameWorld {
  assertSelectionMatchesSlice(slice, selection)
  if (runtimeBundlePin.worldDbSchema !== slice.source.schemaId) throw new Error('World DB bootstrap runtime schema identity mismatch')
  const countries = slice.countries.map((country) => createCountry({ id: countryIdFromString(country.countryId), name: country.name, code: country.code }))
  const countryIds = new Set(countries.map((country) => String(country.id)))
  const personById = new Map(slice.persons.map((person) => [person.personId, person]))
  for (const team of slice.teams) if (!countryIds.has(team.countryId)) throw new Error(`World DB bootstrap team country is missing: ${team.countryId}`)
  for (const person of slice.persons) for (const nationalityId of person.nationalityIds) if (!countryIds.has(nationalityId)) throw new Error(`World DB bootstrap person nationality is missing: ${nationalityId}`)
  const seasonId = seasonIdFromString(slice.season.seasonId)
  const competitionId = competitionIdFromString(slice.competition.competitionId)
  const ecosystemId = ecosystemIdFromString(slice.ecosystem.ecosystemId)
  const rosterAssignments = activeRosterAssignments(slice)
  const players = slice.players.map((source) => {
    const person = personById.get(source.personId)
    if (person === undefined) throw new Error(`World DB bootstrap player person is missing: ${source.personId}`)
    return createPlayer({
      id: playerIdFromString(source.playerId), personId: source.personId as never, firstName: person.firstName, lastName: person.lastName,
      gender: person.gender, nationalityId: countryIdFromString(person.nationalityIds[0]!),
      basketball: { primaryPosition: source.primaryPosition, secondaryPositions: source.secondaryPositions, ratings: source.ratings as PlayerTruthRatings, tendencies: source.tendencies as PlayerTruthTendencies },
      bio: { dateOfBirth: parseGameDate(person.dateOfBirth), ...person.physical, dominantHand: source.dominantHand, measurementProvenance: { wingspanCm: 'sourced', standingReachCm: 'sourced', dominantHand: 'sourced' } },
      development: createPlayerDevelopment(source.development, person.dateOfBirth, slice.season.startDate),
    })
  })
  const staffAssignments = slice.staffAssignments.map((assignment) => {
    if (!ROLE_FAMILIES[assignment.roleCode]) throw new Error(`World DB bootstrap staff role is unsupported: ${assignment.roleCode}`)
    return createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(assignment.assignmentId), staffPersonId: staffPersonIdFromString(assignment.staffId), teamId: teamIdFromString(assignment.teamId), role: assignment.roleCode as never, assignedOn: parseGameDate(assignment.assignedOn) })
  })
  const staff = slice.staffProfiles.map((source) => {
    const person = personById.get(source.personId)
    if (person === undefined) throw new Error(`World DB bootstrap staff person is missing: ${source.personId}`)
    const assignments = slice.staffAssignments.filter((assignment) => assignment.staffId === source.staffId)
    const marketRole = assignments[0]?.roleCode
    return createStaffPerson({ id: staffPersonIdFromString(source.staffId), personId: source.personId as never, identity: { firstName: person.firstName, lastName: person.lastName, dateOfBirth: parseGameDate(person.dateOfBirth), nationality: person.nationalityIds[0] }, professional: { attributes: projectStaffAttributes(source.attributes) }, ...(marketRole === undefined ? {} : { marketRole: marketRole as never, roleFamily: ROLE_FAMILIES[marketRole] }), specialismIds: source.specialismIds })
  })
  const selectedTeam = slice.teams.find((team) => team.teamId === selection.teamId)!
  const selectedHeadCoachAssignment = staffAssignments.find((assignment) => assignment.teamId === selectedTeam.teamId && assignment.role === 'headCoach')
  if (selectedHeadCoachAssignment === undefined) throw new Error(`World DB selected team has no canonical head coach: ${selectedTeam.teamId}`)
  const selectedHeadCoachStaff = staff.find((profile) => profile.id === selectedHeadCoachAssignment.staffPersonId)
  if (selectedHeadCoachStaff === undefined || selectedHeadCoachStaff.personId === undefined) throw new Error('World DB selected head coach staff profile is missing')
  const selectedHeadCoachPerson = personById.get(selectedHeadCoachStaff.personId)
  if (selectedHeadCoachPerson === undefined) throw new Error('World DB selected head coach Person is missing')
  const coach = createCoach({ id: coachIdFromString(`worlddb:coach:${selectedTeam.teamId}`), personId: selectedHeadCoachStaff.personId as never, staffProfileId: selectedHeadCoachStaff.id, firstName: selectedHeadCoachPerson.firstName, lastName: selectedHeadCoachPerson.lastName, gender: selectedHeadCoachPerson.gender, nationalityId: countryIdFromString(selectedHeadCoachPerson.nationalityIds[0]!) })
  const playerPersonIds = new Set(slice.players.map((player) => player.personId))
  const persons = slice.persons.map((person) => createPerson({ id: person.personId as never, firstName: person.firstName, lastName: person.lastName, gender: person.gender, dateOfBirth: parseGameDate(person.dateOfBirth), nationalityIds: person.nationalityIds.map(countryIdFromString), physical: person.physical, profileRefs: [...(playerPersonIds.has(person.personId) ? [{ kind: 'player' as const, profileId: person.personId }] : []), ...slice.staffProfiles.filter((staffProfile) => staffProfile.personId === person.personId).map((staffProfile) => ({ kind: 'staff' as const, profileId: staffProfile.staffId }))] }))
  const teams = slice.teams.map((team) => createTeam({ id: teamIdFromString(team.teamId), name: team.name, gender: team.gender, countryId: countryIdFromString(team.countryId), rosterPlayerIds: rosterForTeam(rosterAssignments, team.teamId), ...(team.teamId === selectedTeam.teamId ? { coachId: coach.id } : {}) }))
  const competition = createCompetition({ id: competitionId, name: slice.competition.name, gender: slice.competition.gender, ecosystemId, participantTeamIds: teams.map((team) => team.id), rules: defaultLeagueCompetitionRules })
  const season = createSeason({ id: seasonId, competitionId, label: slice.season.label, startDate: parseGameDate(slice.season.startDate), endDate: parseGameDate(slice.season.endDate), participantTeamIds: teams.map((team) => team.id) })
  const ecosystem = createSportsEcosystem({ id: ecosystemId, name: slice.ecosystem.name, kind: slice.ecosystem.kind, category: slice.ecosystem.category })
  const baseWorld = createGameWorld({ currentDate: season.startDate, currentSeasonId: season.id, userCoachId: coach.id, persons, countries, coaches: [coach], players, teams, competitions: [competition], ecosystems: [ecosystem], seasons: [season], games: [], staffPeople: staff, teamStaffAssignments: staffAssignments })
  const games = slice.matches.length === 0 ? generateRoundRobinSchedule({ world: baseWorld, seasonId, schedulePolicy: distributeRoundsAcrossSeason }).map((game, index) => ({ ...game, id: gameIdFromString(`derived-simulation-from-b04:${slice.season.competitionSeasonId}:${String(index + 1).padStart(4, '0')}`) })) : slice.matches.map((match) => materializeMatch(slice, match))
  const world = createGameWorld({ currentDate: season.startDate, currentSeasonId: season.id, userCoachId: coach.id, persons, countries, coaches: [coach], players, teams, competitions: [competition], ecosystems: [ecosystem], seasons: [season], games, staffPeople: staff, teamStaffAssignments: staffAssignments })
  return attachWorldDbCompetitionRuntime(world, { competitionRuntimeBundle: runtimeBundlePin, competitionPlanIds: [], competitionSeasonIds: [slice.season.competitionSeasonId] })
}

function createPlayerDevelopment(dimensions: WorldDbGameBootstrapSliceV1['players'][number]['development'], dateOfBirth: string, seasonStart: string) {
  const ceilings: Record<string, number> = {}
  const growth: number[] = []; const decline: number[] = []
  for (const dimension of dimensions) { const targets = DEVELOPMENT_MAP[dimension.dimensionCode]; if (targets === undefined) throw new Error(`World DB development dimension is unsupported: ${dimension.dimensionCode}`); for (const target of targets) ceilings[target] = Math.max(1, Math.min(100, dimension.ceiling)); growth.push(dimension.growthRate); decline.push(dimension.declineSensitivity) }
  for (const domain of DEVELOPMENT_DOMAINS) if (ceilings[domain] === undefined) throw new Error(`World DB development mapping is incomplete: ${domain}`)
  const age = Number(seasonStart.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - (seasonStart.slice(5) < dateOfBirth.slice(5) ? 1 : 0)
  const developmentStage: DevelopmentStage = age < 21 ? 'early' : age < 25 ? 'developing' : age < 31 ? 'prime' : 'declining'
  return createDevelopmentProfile({ developmentStage, growthRate: Math.max(1, Math.min(100, Math.round(growth.reduce((sum, value) => sum + value, 0) / growth.length))), declineSensitivity: Math.max(1, Math.min(100, Math.round(decline.reduce((sum, value) => sum + value, 0) / decline.length))), ceilings: ceilings as never })
}
function assertSelectionMatchesSlice(slice: WorldDbGameBootstrapSliceV1, selection: WorldDbGameBootstrapSelectionV1): void { if (slice.source.databaseId !== selection.source.databaseId || slice.source.schemaId !== selection.source.schemaId) throw new Error('World DB bootstrap slice source identity mismatch'); if (slice.ecosystem.ecosystemId !== selection.ecosystemId || slice.competition.competitionId !== selection.competitionId || slice.season.competitionSeasonId !== selection.competitionSeasonId) throw new Error('World DB bootstrap selection does not match loaded slice'); if (slice.competition.ecosystemId !== slice.ecosystem.ecosystemId) throw new Error('World DB bootstrap competition ecosystem relation is invalid'); if (!slice.teams.some((team) => team.teamId === selection.teamId)) throw new Error(`World DB bootstrap team is not in ecosystem membership: ${selection.teamId}`); if (new Set(slice.teams.map((team) => team.teamId)).size !== slice.teams.length) throw new Error('World DB bootstrap contains duplicate team IDs'); if (new Set(slice.players.map((player) => player.playerId)).size !== slice.players.length) throw new Error('World DB bootstrap contains duplicate player IDs'); if (activeRosterAssignments(slice).length !== slice.players.length) throw new Error('World DB bootstrap roster assignments and players are not one-to-one'); if (rosterForTeam(activeRosterAssignments(slice), selection.teamId).length < 5) throw new Error(`World DB bootstrap selected team has fewer than five active players: ${selection.teamId}`) }
function activeRosterAssignments(slice: WorldDbGameBootstrapSliceV1) { return slice.rosterAssignments.filter((assignment) => assignment.status.toUpperCase() === 'ACTIVE') }
function rosterForTeam(assignments: readonly WorldDbGameBootstrapSliceV1['rosterAssignments'][number][], teamId: string): readonly PlayerId[] { return assignments.filter((assignment) => assignment.teamId === teamId).map((assignment) => playerIdFromString(assignment.playerId)) }
function materializeMatch(slice: WorldDbGameBootstrapSliceV1, match: WorldDbGameBootstrapSliceV1['matches'][number]) { const status = match.status.toUpperCase() === 'COMPLETED' ? 'completed' : match.status.toUpperCase() === 'SCHEDULED' ? 'scheduled' : (() => { throw new Error(`World DB bootstrap match status is unsupported: ${match.status}`) })(); const dateText = match.scheduledAt ?? match.playedAt; if (dateText === null) throw new Error(`World DB bootstrap match has no date: ${match.matchId}`); return createGame({ id: gameIdFromString(match.matchId), seasonId: seasonIdFromString(slice.season.seasonId), competitionId: competitionIdFromString(slice.competition.competitionId), date: parseGameDate(dateText.slice(0, 10)), homeTeamId: teamIdFromString(match.homeTeamId), awayTeamId: teamIdFromString(match.awayTeamId), status, result: status === 'completed' ? { homeScore: match.homeScore ?? -1, awayScore: match.awayScore ?? -1 } : null, stakes: 'regular' }) }
