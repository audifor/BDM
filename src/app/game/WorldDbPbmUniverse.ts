import { addDays, parseGameDate } from '@/domain/date'
import { personIdForProfile } from '@/domain/person'
import { generateWorld } from '@/engine/world'
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator'
import { createWorldDbCompetitionRuntimeV1 } from '@/engine/competition/WorldDbCompetitionRuntime'
import { toWorldDbCompetitionBundleV1, type Db04PbmCompetitionDetailV1, type Db04PbmCountryV1 } from '@/domain/worldDb/Db04PbmCatalogContract'
import type { WorldDbGameBootstrapSliceV1, WorldDbGameBootstrapSelectionV1 } from '@/domain/worldDb/GameBootstrap'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import type { GameWorld } from '@/domain/world'

export interface CreateWorldDbPbmUniverseOptionsV1 {
  readonly detail: Db04PbmCompetitionDetailV1
  readonly countries: readonly Db04PbmCountryV1[]
  readonly editionId: string
  readonly startDate: string
  readonly seed: number
  readonly userTeamId?: string
}

export interface WorldDbPbmUniverseV1 {
  readonly world: GameWorld
  readonly selection: WorldDbGameBootstrapSelectionV1
  readonly sourceEditionId: string
  readonly generatedCounts: Readonly<{ players: number; staff: number }>
}

/** Builds one independent, seedable BDM GameWorld from a certified PBM competition edition. */
export function createWorldDbPbmUniverseV1(options: CreateWorldDbPbmUniverseOptionsV1): WorldDbPbmUniverseV1 {
  const { detail } = options
  const edition = detail.editions.find((candidate) => candidate.editionId === options.editionId)
  if (edition === undefined) throw new Error(`PBM edition not found: ${options.editionId}`)
  if (detail.competition.availability !== 'CERTIFIED_DATA_ONLY' || edition.editionStatus !== 'CERTIFIED' || edition.formatStatus !== 'CERTIFIED' || edition.formatDocument === null || edition.formatSha256 === null) {
    throw new Error(`PBM edition has no certified, usable format: ${options.editionId}`)
  }
  if (edition.participants.length < 2 || edition.participants.length !== edition.participantCount) throw new Error(`PBM edition participant set is incomplete: ${options.editionId}`)
  if (edition.participants.some((participant) => participant.status !== 'CERTIFIED_FOR_EDITION' || participant.canonicalTeamId.length === 0)) throw new Error(`PBM edition has an uncertified participant: ${options.editionId}`)
  if (edition.formatDocument.status !== 'COMPLETE') throw new Error(`PBM edition format is not complete: ${options.editionId}`)
  if (detail.competition.certifiedCompetitionId === null || detail.competition.displayName === null || detail.competition.countryCode === null) throw new Error('PBM competition identity is incomplete')
  const country = options.countries.find((candidate) => candidate.sourceCode === detail.competition.countryCode)
  if (country === undefined) throw new Error(`PBM competition country was not found: ${detail.competition.countryCode}`)

  const startDate = parseGameDate(options.startDate)
  if (!Number.isSafeInteger(options.seed)) throw new RangeError('World generation seed must be an integer')
  const generated = generateWorld({ seed: options.seed, gender: detail.competition.genderNormalized === 'F' ? 'female' : 'male', startDate, includeNbaLike: true, includeNcaaLike: true })
  const generatedTeams = Object.values(generated.teams).slice(0, edition.participants.length)
  if (generatedTeams.length !== edition.participants.length) throw new Error(`BDM roster generator produced ${generatedTeams.length} teams for ${edition.participants.length} PBM participants`)

  const selectedTeamId = options.userTeamId ?? edition.participants[0]!.canonicalTeamId
  const participantById = new Map(edition.participants.map((participant) => [participant.canonicalTeamId, participant]))
  if (!participantById.has(selectedTeamId)) throw new Error(`Selected PBM team is not an edition participant: ${selectedTeamId}`)
  const sourceTeamById = new Map(generatedTeams.map((team, index) => [team.id, edition.participants[index]!.canonicalTeamId]))
  const countryId = `place:country:${detail.competition.countryCode}`
  const ecosystemId = `ecosystem:worlddb:${detail.competition.certifiedCompetitionId}`
  const seasonId = `worlddb-season:${edition.editionId}:${options.startDate}`
  const selection: WorldDbGameBootstrapSelectionV1 = {
    source: { databaseId: detail.source.databaseFile, schemaId: 'DB-04' },
    ecosystemId,
    competitionId: detail.competition.certifiedCompetitionId,
    competitionSeasonId: edition.editionId,
    teamId: selectedTeamId,
  }

  const playersById = new Map(Object.values(generated.players).map((player) => [String(player.id), player]))
  const playerIds = generatedTeams.flatMap((team) => team.rosterPlayerIds)
  const playerSources = playerIds.map((playerId) => {
    const player = playersById.get(playerId)
    if (player === undefined) throw new Error(`Generated PBM roster player is missing: ${playerId}`)
    const personId = String(player.personId ?? personIdForProfile('player', player.id))
    const generatedTeam = generatedTeams.find((team) => team.rosterPlayerIds.includes(playerId))
    const teamId = generatedTeam === undefined ? undefined : sourceTeamById.get(generatedTeam.id)
    if (teamId === undefined) throw new Error(`Generated PBM roster has no owning team: ${playerId}`)
    return { player, personId, teamId }
  })
  const persons = playerSources.map(({ player, personId }) => ({
    personId,
    firstName: player.firstName,
    lastName: player.lastName,
    gender: player.gender,
    dateOfBirth: player.bio.dateOfBirth,
    nationalityIds: [countryId],
    physical: { heightCm: player.bio.heightCm, weightKg: player.bio.weightKg, wingspanCm: player.bio.wingspanCm, standingReachCm: player.bio.standingReachCm },
  }))
  const staffAssignments = generatedTeams.flatMap((team, index) => {
    const pbmTeamId = edition.participants[index]!.canonicalTeamId
    return Object.values(generated.teamStaffAssignmentsById)
      .filter((assignment) => assignment.teamId === team.id)
      .map((assignment) => ({ assignmentId: `worlddb:${edition.editionId}:${pbmTeamId}:${assignment.id}`, staffId: String(assignment.staffPersonId), teamId: pbmTeamId, roleCode: assignment.role, assignedOn: startDate }))
  })
  const generatedStaffIds = new Set(staffAssignments.map((assignment) => assignment.staffId))
  const staffProfiles = [...generatedStaffIds].map((staffId) => {
    const staff = generated.staffPeopleById[staffId as keyof typeof generated.staffPeopleById]
    if (staff === undefined) throw new Error(`Generated PBM staff profile is missing: ${staffId}`)
    const personId = String(staff.personId ?? personIdForProfile('staff', staff.id))
    const role = staffAssignments.find((assignment) => assignment.staffId === staffId)?.roleCode
    const bio = generatePlayerBio(`worlddb-pbm-staff:${options.seed}:${staffId}`, role === 'headCoach' ? 'SF' : 'PF', startDate, 1972 + (staffId.length % 22))
    persons.push({ personId, firstName: staff.identity.firstName, lastName: staff.identity.lastName, gender: detail.competition.genderNormalized === 'F' ? 'female' : 'male', dateOfBirth: bio.dateOfBirth, nationalityIds: [countryId], physical: { heightCm: bio.heightCm, weightKg: bio.weightKg, wingspanCm: bio.wingspanCm, standingReachCm: bio.standingReachCm } })
    return { staffId, personId, generatedAttributes: staff.professional.attributes, specialismIds: staff.specialismIds ?? [] }
  })
  const organizations = edition.participants.map((participant) => ({ organizationId: `organization:${participant.canonicalTeamId}`, entityId: participant.canonicalTeamId, legalName: participant.officialTeamName, foundedYear: null, dissolvedYear: null, primaryPlaceId: countryId, website: null }))
  const organizationSections = edition.participants.map((participant) => ({ sectionId: `section:${participant.canonicalTeamId}`, organizationId: `organization:${participant.canonicalTeamId}`, sport: 'BASKETBALL', gender: detail.competition.genderNormalized === 'F' ? 'FEMALE' : 'MALE', categoryScope: null, canonicalName: participant.officialTeamName, validFrom: null, validTo: null }))
  const teams = generatedTeams.map((team, index) => {
    const participant = edition.participants[index]!
    const source = detail.teams.find((candidate) => candidate.canonicalTeamId === participant.canonicalTeamId)
    const generatedCoach = team.coachId === undefined ? undefined : generated.coaches[team.coachId]
    return { teamId: participant.canonicalTeamId, name: participant.officialTeamName || source?.displayName || team.name, gender: detail.competition.genderNormalized === 'F' ? 'female' as const : 'male' as const, countryId, organizationId: `organization:${participant.canonicalTeamId}`, organizationSectionId: `section:${participant.canonicalTeamId}`, ...(generatedCoach === undefined ? {} : { coachId: generatedCoach.id }) }
  })
  const players = playerSources.map(({ player, personId }) => ({
    playerId: String(player.id), personId,
    primaryPosition: player.basketball.primaryPosition,
    secondaryPositions: player.basketball.secondaryPositions ?? [],
    dominantHand: player.bio.dominantHand,
    ratings: player.basketball.ratings,
    tendencies: player.basketball.tendencies,
    development: [
      ['SHOOTING', player.development.ceilings.shooting], ['FINISHING', player.development.ceilings.finishing],
      ['BALL_HANDLING', player.development.ceilings.creation], ['PLAYMAKING', player.development.ceilings.passing],
      ['OFF_BALL_OFFENSE', player.development.ceilings.creation], ['DEFENSE_REBOUNDING', Math.round((player.development.ceilings.defense + player.development.ceilings.rebounding) / 2)],
      ['PHYSICAL', player.development.ceilings.physical], ['MENTAL', player.development.ceilings.mental],
    ].map(([dimensionCode, ceiling]) => ({ dimensionCode: String(dimensionCode), ceiling: Number(ceiling), growthRate: player.development.growthRate, declineSensitivity: player.development.declineSensitivity })),
  }))
  const slice: WorldDbGameBootstrapSliceV1 = {
    schemaVersion: 1,
    source: selection.source,
    ecosystem: { ecosystemId, name: `${detail.competition.displayName} · PBM`, kind: 'fibaLike', category: detail.competition.genderNormalized === 'F' ? 'women' : 'men' },
    competition: { competitionId: detail.competition.certifiedCompetitionId, name: detail.competition.displayName, gender: detail.competition.genderNormalized === 'F' ? 'female' : 'male', ecosystemId },
    season: { competitionSeasonId: edition.editionId, seasonId, label: `${options.startDate.slice(0, 4)}-${Number(options.startDate.slice(0, 4)) + 1}`, startDate, endDate: addDays(startDate, 272), provenance: 'DERIVED_SIMULATION_FROM_B04' },
    countries: [{ countryId, name: country.name, code: country.sourceCode }],
    organizations,
    organizationSections,
    teams,
    persons,
    players,
    staffProfiles,
    staffAssignments,
    rosterAssignments: playerSources.map(({ player, teamId }) => ({ rosterId: `worlddb-roster:${edition.editionId}:${player.id}`, teamId, playerId: String(player.id), status: 'ACTIVE' })),
    matches: [],
  }
  const bundle = toWorldDbCompetitionBundleV1(detail, edition.editionId)
  const runtime = createWorldDbCompetitionRuntimeV1(bundle)
  if (runtime.entryIdsByNodeId.REGULAR?.length !== edition.participantCount) throw new Error('PBM format runtime does not contain every certified participant')
  const world = bootstrapGameWorldFromWorldDb(slice, selection, {
    contentId: `PBM-DB07:${edition.formatVersion}`,
    contentHash: edition.formatSha256.toLowerCase(),
    worldDbSchema: 'DB-04',
  }, edition.formatDocument)
  return { world, selection, sourceEditionId: edition.editionId, generatedCounts: { players: players.length, staff: staffProfiles.length } }
}
