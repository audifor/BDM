import { createInitialCoachRpgProfile } from '@/domain/coachRpg'
import { createCoach } from '@/domain/coach'
import { createCompetition, defaultLeagueCompetitionRules } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { parseGameDate } from '@/domain/date'
import { createPerson } from '@/domain/person'
import { createPersonality, type Personality } from '@/domain/personality'
import { DEVELOPMENT_DOMAINS, createDevelopmentProfile, type DevelopmentStage } from '@/domain/player/PlayerDevelopmentProfile'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthRatings, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'
import { createPlayer } from '@/domain/player'
import { createPlayerRepertoire } from '@/domain/player/PlayerRepertoire'
import { createSeason } from '@/domain/season'
import type { CompetitionCalendarPolicy } from '@/domain/season'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { contractIdFromString, coachIdFromString, competitionIdFromString, countryIdFromString, ecosystemIdFromString, gameIdFromString, personIdFromString, playerIdFromString, seasonIdFromString, staffPersonIdFromString, teamIdFromString, teamStaffAssignmentIdFromString, type PlayerId } from '@/domain/ids'
import { createStaffPerson, createTeamStaffAssignment, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, type StaffPerson, type StaffRoleFamily } from '@/domain/staff'
import { createTeam } from '@/domain/team'
import { createOrganization, createOrganizationSection } from '@/domain/organization'
import { organizationIdFromString, organizationSectionIdFromString } from '@/domain/ids'
import { createOrganizationOwnership } from '@/domain/ownership'
import { createOrganizationInvestorInterest } from '@/domain/investment/OrganizationInvestorInterest'
import { createGame, type Game } from '@/domain/game'
import { createPlayerContract, type ContractYearCompensation, type PlayerContract } from '@/domain/contract'
import { createStaffContract, staffContractIdFromString, type StaffContract } from '@/domain/staffContract'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'
import { attachWorldDbCompetitionRuntime, createGameWorld, type GameWorld, type WorldDbCompetitionRuntimeBundlePin } from '@/domain/world'
import { distributeRoundsAcrossSeason, generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { ensureStaffContractStructure, ensureStaffEmploymentStructure, ensureStaffReputationStructure } from '@/engine/world/StaffCareerEnrichment'
import { assertWorldDbGameBootstrapSliceV1, type WorldDbGameBootstrapSelectionV1, type WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import { projectWorldDbPhysicalContent } from './WorldDbPhysicalContent'

const ROLE_FAMILIES: Readonly<Record<string, StaffRoleFamily>> = {
  headCoach: 'coaching', assistantCoach: 'coaching', playerDevelopmentCoach: 'coaching',
  physiotherapist: 'medical', regionalScout: 'scouting', strengthConditioningCoach: 'performance', recruitingCoordinator: 'recruiting',
  performanceCoach: 'performance', teamDoctor: 'medical', analyticsStaff: 'basketballOperations',
}

const isBaseSalaryTerm = (termType: string): boolean => termType.toUpperCase().includes('BASE')
const dateOf = (value: string): string => value.slice(0, 10)
const wholeCurrency = (cents: number): number => Math.round(cents / 100)

/** World DB money is exact minor units; BDM's player contract keeps whole currency units, so cents round half up. */
function mapPlayerContract(source: WorldDbGameBootstrapSliceV1['contracts'] extends readonly (infer C)[] | undefined ? C : never, playerId: string): PlayerContract {
  const bySeason = new Map<string, { base: number; guaranteed: number }>()
  for (const term of source.terms) {
    if (!isBaseSalaryTerm(term.termType)) continue
    const entry = bySeason.get(term.seasonLabel) ?? { base: 0, guaranteed: 0 }
    bySeason.set(term.seasonLabel, { base: entry.base + term.amountCents, guaranteed: entry.guaranteed + term.guaranteedCents })
  }
  const seasons = [...bySeason.entries()].sort(([left], [right]) => left.localeCompare(right))
  if (seasons.length === 0) throw new Error(`World DB player contract has no base salary term: ${source.contractId}`)
  const years: ContractYearCompensation[] = seasons.map(([, value]) => ({ cashSalary: wholeCurrency(value.base), guaranteedAmount: Math.min(wholeCurrency(value.guaranteed), wholeCurrency(value.base)), capTreatment: { policy: 'NOT_APPLICABLE' } }))
  return createPlayerContract({
    id: contractIdFromString(source.contractId), playerId: playerIdFromString(playerId), teamId: teamIdFromString(source.teamId), kind: 'standard',
    term: { startsOn: parseGameDate(dateOf(source.effectiveFrom)), expiresOn: parseGameDate(dateOf(source.effectiveTo)) },
    compensation: { annualSalary: years[0]!.cashSalary, years },
  })
}

function mapStaffContract(source: NonNullable<WorldDbGameBootstrapSliceV1['contracts']>[number], staffId: string): StaffContract {
  const base = source.terms.filter((term) => isBaseSalaryTerm(term.termType)).sort((left, right) => left.seasonLabel.localeCompare(right.seasonLabel))[0]
  if (base === undefined) throw new Error(`World DB staff contract has no base salary term: ${source.contractId}`)
  return createStaffContract({ id: staffContractIdFromString(source.contractId), staffId: staffPersonIdFromString(staffId), teamId: teamIdFromString(source.teamId), kind: 'standard', term: { startsOn: parseGameDate(dateOf(source.effectiveFrom)), expiresOn: parseGameDate(dateOf(source.effectiveTo)) }, compensation: { annualSalary: base.amountCents / 100 } })
}

/** Semantic projection for BDM's existing staff runtime; the complete STAFF80 remains in the source slice. */
function projectStaffAttributes(source: Readonly<Record<string, number>>): StaffPerson['professional']['attributes'] {
  const keys: Record<string, string> = { coaching:'SKILL_TEACHING', tacticalKnowledge:'TACTICAL_VISION', playerDevelopment:'INDIVIDUAL_DEVELOPMENT_PLANS', talentEvaluation:'TALENT_IDENTIFICATION', potentialEvaluation:'TALENT_PROJECTION', medicalKnowledge:'CLINICAL_ASSESSMENT', rehabilitation:'REHABILITATION_PLANNING', analysis:'DATA_INTERPRETATION', leadership:'STAFF_COORDINATION', communication:'COMMUNICATION', motivation:'MOTIVATION', discipline:'PROFESSIONALISM', adaptability:'SYSTEM_ADAPTATION' }
  const legacyKeys = Object.keys(source).sort()
  if (legacyKeys.length === 80 && legacyKeys.every((key, index) => key === `STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`)) {
    // Compatibility for the earlier explicit ordinal STAFF80 contract, never for unknown keys.
    return Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key, index) => {
      const group = legacyKeys.slice(Math.floor(index * 80 / 13), Math.floor((index + 1) * 80 / 13))
      return [key, Math.round(group.reduce((sum, code) => sum + source[code]!, 0) / group.length)]
    })) as StaffPerson['professional']['attributes']
  }
  if (Object.keys(source).length !== 80 || STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.some(key => !Number.isFinite(source[keys[key]!])) ) throw new RangeError('World DB Staff source must contain the complete semantic STAFF80')
  return Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map(key => [key, source[keys[key]!]!])) as StaffPerson['professional']['attributes']
}

const DEVELOPMENT_MAP: Readonly<Record<string, readonly string[]>> = {
  SHOOTING: ['shooting'], FINISHING: ['finishing'], BALL_HANDLING: ['creation'], PLAYMAKING: ['passing'],
  OFF_BALL_OFFENSE: ['creation'], DEFENSE_REBOUNDING: ['defense', 'rebounding'], PHYSICAL: ['physical'], MENTAL: ['mental'],
}

export function bootstrapGameWorldFromWorldDb(slice: WorldDbGameBootstrapSliceV1, selection: WorldDbGameBootstrapSelectionV1, runtimeBundlePin: WorldDbCompetitionRuntimeBundlePin, worldCompetitionFormat?: WorldCompetitionFormatDocument, calendarPolicy?: CompetitionCalendarPolicy, referenceDate?: string): GameWorld {
  assertWorldDbGameBootstrapSliceV1(slice)
  const physicalContent = projectWorldDbPhysicalContent(slice.physicalContent)
  assertSelectionMatchesSlice(slice, selection)
  if (runtimeBundlePin.worldDbSchema !== slice.source.schemaId) throw new Error('World DB bootstrap runtime schema identity mismatch')
  if (worldCompetitionFormat !== undefined && (worldCompetitionFormat.competitionId !== selection.competitionId || worldCompetitionFormat.competitionSeasonId !== selection.competitionSeasonId)) throw new Error('World DB bootstrap competition format identity mismatch')
  const countries = slice.countries.map((country) => createCountry({ id: countryIdFromString(country.countryId), name: country.name, code: country.code }))
  const organizations = slice.organizations.map((organization) => createOrganization({ id: organizationIdFromString(organization.organizationId), entityId: organization.entityId, legalName: organization.legalName, foundedYear: organization.foundedYear, dissolvedYear: organization.dissolvedYear, primaryPlaceId: organization.primaryPlaceId, website: organization.website }))
  const organizationSections = slice.organizationSections.map((section) => createOrganizationSection({ id: organizationSectionIdFromString(section.sectionId), organizationId: organizationIdFromString(section.organizationId), sport: section.sport, gender: section.gender, categoryScope: section.categoryScope, canonicalName: section.canonicalName, validFrom: section.validFrom, validTo: section.validTo }))
  const countryIds = new Set(countries.map((country) => String(country.id)))
  const personById = new Map(slice.persons.map((person) => [person.personId, person]))
  for (const team of slice.teams) if (!countryIds.has(team.countryId)) throw new Error(`World DB bootstrap team country is missing: ${team.countryId}`)
  for (const person of slice.persons) for (const nationalityId of person.nationalityIds) if (!countryIds.has(nationalityId)) throw new Error(`World DB bootstrap person nationality is missing: ${nationalityId}`)
  const seasonId = seasonIdFromString(slice.season.seasonId)
  const competitionId = competitionIdFromString(slice.competition.competitionId)
  const ecosystemId = ecosystemIdFromString(slice.ecosystem.ecosystemId)
  const rosterAssignments = activeRosterAssignments(slice)
  const players = slice.players.map((source) => {
    assertExactPlayerKeys(source.ratings, PLAYER_TRUTH_RATING_KEYS, `${source.playerId} ratings`)
    assertExactPlayerKeys(source.tendencies, PLAYER_TRUTH_TENDENCY_KEYS, `${source.playerId} tendencies`)
    const person = personById.get(source.personId)
    if (person === undefined) throw new Error(`World DB bootstrap player person is missing: ${source.personId}`)
    const profilePerson = requireProfilePerson(person, source.personId)
    return createPlayer({
      id: playerIdFromString(source.playerId), personId: source.personId as never, firstName: person.firstName, lastName: person.lastName,
      gender: profilePerson.gender, nationalityId: countryIdFromString(person.nationalityIds[0]!),
      basketball: { primaryPosition: source.primaryPosition, secondaryPositions: source.secondaryPositions, ...(source.positionFamiliarity === undefined ? {} : { positionFamiliarity: source.positionFamiliarity }), ratings: source.ratings as PlayerTruthRatings, tendencies: source.tendencies as PlayerTruthTendencies },
      bio: { dateOfBirth: parseGameDate(profilePerson.dateOfBirth), ...profilePerson.physical, dominantHand: source.dominantHand, measurementProvenance: { wingspanCm: 'sourced', standingReachCm: 'sourced', dominantHand: 'sourced' } },
      development: createPlayerDevelopment(source.development, profilePerson.dateOfBirth, referenceDate ?? slice.season.startDate),
    })
  })
  const staffAssignments = slice.staffAssignments.map((assignment) => {
    if (!ROLE_FAMILIES[assignment.roleCode]) throw new Error(`World DB bootstrap staff role is unsupported: ${assignment.roleCode}`)
    return createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(assignment.assignmentId), staffPersonId: staffPersonIdFromString(assignment.staffId), teamId: teamIdFromString(assignment.teamId), role: assignment.roleCode as never, assignedOn: parseGameDate(assignment.assignedOn) })
  })
  const staff = slice.staffProfiles.map((source) => {
    const person = personById.get(source.personId)
    if (person === undefined) throw new Error(`World DB bootstrap staff person is missing: ${source.personId}`)
    if (person.gender === undefined || person.dateOfBirth === undefined) throw new Error(`World DB staff identity is incomplete: ${source.personId}`)
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
  if (selectedHeadCoachPerson.gender === undefined) throw new Error('World DB selected coach gender is missing')
  const coach = createCoach({ id: coachIdFromString(`worlddb:coach:${selectedTeam.teamId}`), personId: selectedHeadCoachStaff.personId as never, staffProfileId: selectedHeadCoachStaff.id, firstName: selectedHeadCoachPerson.firstName, lastName: selectedHeadCoachPerson.lastName, gender: selectedHeadCoachPerson.gender, nationalityId: countryIdFromString(selectedHeadCoachPerson.nationalityIds[0]!) })
  // One canonical WorldDB PERSON score is projected to each BDM profile identity.
  // The current GameWorld keys personalities by Coach/Player/Staff profile ID.
  // Unknown legacy PERSON values still fall back to existing generator unchanged.
  const importedPersonalities: Record<string, Personality> = {}
  const project = (profileId: string, personId: string): void => {
    const scores = personById.get(personId)?.personality
    if (scores !== undefined) importedPersonalities[profileId] = createPersonality({ values: scores })
  }
  for (const player of slice.players) project(player.playerId, player.personId)
  for (const staffPerson of staff) if (staffPerson.personId !== undefined) project(staffPerson.id, staffPerson.personId)
  project(coach.id, selectedHeadCoachStaff.personId)
  const playerPersonIds = new Set(slice.players.map((player) => player.personId))
  const persons = slice.persons.map((person) => createPerson({ id: personIdFromString(person.personId), firstName: person.firstName, lastName: person.lastName, ...(person.gender === undefined ? {} : { gender: person.gender }), ...(person.dateOfBirth === undefined ? {} : { dateOfBirth: parseGameDate(person.dateOfBirth) }), nationalityIds: person.nationalityIds.map(countryIdFromString), ...(person.physical === undefined ? {} : { physical: person.physical }), profileRefs: [...(playerPersonIds.has(person.personId) ? [{ kind: 'player' as const, profileId: person.personId }] : []), ...slice.staffProfiles.filter((staffProfile) => staffProfile.personId === person.personId).map((staffProfile) => ({ kind: 'staff' as const, profileId: staffProfile.staffId }))] }))
  const teams = slice.teams.map((team) => createTeam({ id: teamIdFromString(team.teamId), name: team.name, gender: team.gender, countryId: countryIdFromString(team.countryId), organizationId: organizationIdFromString(team.organizationId), organizationSectionId: organizationSectionIdFromString(team.organizationSectionId), rosterPlayerIds: rosterForTeam(rosterAssignments, team.teamId), ...(team.teamId === selectedTeam.teamId ? { coachId: coach.id } : {}) }))
  const competition = createCompetition({ id: competitionId, name: slice.competition.name, gender: slice.competition.gender, ecosystemId, participantTeamIds: teams.map((team) => team.id), rules: defaultLeagueCompetitionRules })
  const season = createSeason({ id: seasonId, competitionId, label: slice.season.label, startDate: parseGameDate(slice.season.startDate), endDate: parseGameDate(slice.season.endDate), participantTeamIds: teams.map((team) => team.id), ...(worldCompetitionFormat === undefined ? {} : { worldCompetitionFormat }), ...(calendarPolicy === undefined ? {} : { calendarPolicy }) })
  const ecosystem = createSportsEcosystem({ id: ecosystemId, name: slice.ecosystem.name, kind: slice.ecosystem.kind, category: slice.ecosystem.category })
  const organizationOwnership = (slice.organizationOwnership ?? []).map((record) => createOrganizationOwnership({ id: record.ownershipId, organizationId: record.organizationId, owner: record.ownerKind === 'PERSON' ? { kind: 'PERSON', personId: personIdFromString(record.ownerId) } : { kind: 'ORGANIZATION', organizationId: organizationIdFromString(record.ownerId) }, ownershipPercentage: record.ownershipPercentage, validFrom: record.validFrom, validTo: record.validTo }))
  const organizationInvestorInterests = (slice.organizationInvestorInterest ?? []).map((record) => createOrganizationInvestorInterest({ id: record.interestId, organizationId: record.organizationId, investor: record.investorKind === 'PERSON' ? { kind: 'PERSON', personId: personIdFromString(record.investorId) } : { kind: 'ORGANIZATION', organizationId: organizationIdFromString(record.investorId) }, interestType: record.interestType, status: record.status, openedOn: record.openedOn, closedOn: record.closedOn }))
  const playerRepertoireByPlayerId = Object.fromEntries(slice.players.flatMap((source) => source.repertoire === undefined ? [] : [[source.playerId, createPlayerRepertoire({ ...source.repertoire, playerId: source.playerId })]]))
  const coachRpgProfilesByCoachId = { [coach.id]: createInitialCoachRpgProfile() }
  // Real contracts of the universe replace BDM's default back-fill; a contract whose person is not loaded is a broken relation.
  const playerPersonIdSet = new Set(slice.players.map((player) => player.personId))
  const staffIdByPersonId = new Map(staff.map((member) => [String(member.personId), String(member.id)]))
  const contracts: PlayerContract[] = []
  const staffContracts: StaffContract[] = []
  for (const contract of slice.contracts ?? []) {
    if (contract.kind === 'PLAYER') {
      if (!playerPersonIdSet.has(contract.personId)) throw new Error(`World DB contract references a player that is not loaded: ${contract.contractId}`)
      contracts.push(mapPlayerContract(contract, contract.personId))
    } else {
      const staffId = staffIdByPersonId.get(contract.personId)
      if (staffId === undefined) throw new Error(`World DB contract references a staff member that is not loaded: ${contract.contractId}`)
      staffContracts.push(mapStaffContract(contract, staffId))
    }
  }
  const baseWorld = createGameWorld({ playerRepertoireByPlayerId, ...physicalContent, currentDate: season.startDate, currentSeasonId: season.id, userCoachId: coach.id, persons, countries, coaches: [coach], players, teams, organizations, organizationSections, organizationOwnership, organizationInvestorInterests, competitions: [competition], ecosystems: [ecosystem], seasons: [season], games: [], staffPeople: staff, teamStaffAssignments: staffAssignments, personalitiesByPersonId: importedPersonalities, coachRpgProfilesByCoachId })
  const regularSeasonNodeKey = worldCompetitionFormat?.variants.find((variant) => variant.isRealVariant)?.nodes.find((node) => node.role === 'REGULAR_SEASON')?.key ?? worldCompetitionFormat?.variants[0]?.nodes.find((node) => node.role === 'REGULAR_SEASON')?.key
  const importedGames = slice.matches.map((match) => materializeMatch(slice, match))
  // A generated universe supplies its own simulated calendar. A partial sourced format must
  // not force another calendar or be relabelled COMPLETE to pass the executable-format gate.
  const expectedGames = teams.length * (teams.length - 1) * competition.rules.schedule.meetingsPerPair / 2
  const games = importedGames.length === expectedGames
    ? assertCompleteRoundRobin(importedGames, teams.length, competition.rules.schedule.meetingsPerPair)
    : generateRoundRobinSchedule({ world: baseWorld, seasonId, schedulePolicy: distributeRoundsAcrossSeason, ...(regularSeasonNodeKey === undefined ? {} : { competitionStageKey: regularSeasonNodeKey }) }).map((game, index) => ({ ...game, id: gameIdFromString(`derived-simulation-from-b04:${slice.season.competitionSeasonId}:${String(index + 1).padStart(4, '0')}`) }))
  const employment = ensureStaffEmploymentStructure(baseWorld)
  const world = createGameWorld({ staffEmploymentByStaffId: employment.staffEmploymentByStaffId, staffCareerHistoryByStaffId: employment.staffCareerHistoryByStaffId, playerRepertoireByPlayerId, ...physicalContent, ...(contracts.length === 0 ? {} : { contracts }), ...(staffContracts.length === 0 ? {} : { staffContracts }), currentDate: season.startDate, currentSeasonId: season.id, userCoachId: coach.id, persons, countries, coaches: [coach], players, teams, organizations, organizationSections, organizationOwnership, organizationInvestorInterests, competitions: [competition], ecosystems: [ecosystem], seasons: [season], games, staffPeople: staff, teamStaffAssignments: staffAssignments, personalitiesByPersonId: importedPersonalities, coachRpgProfilesByCoachId })
  const withStaffCareer = ensureStaffReputationStructure(ensureStaffContractStructure(ensureStaffEmploymentStructure(world)))
  return attachWorldDbCompetitionRuntime(withStaffCareer, { competitionRuntimeBundle: runtimeBundlePin, competitionPlanIds: [], competitionSeasonIds: [slice.season.competitionSeasonId] })
}

function requireProfilePerson(person: WorldDbGameBootstrapSliceV1['persons'][number], personId: string): {
  readonly gender: 'male' | 'female'
  readonly dateOfBirth: string
  readonly physical: { readonly heightCm: number; readonly weightKg: number; readonly wingspanCm: number; readonly standingReachCm: number }
} {
  if (person.gender === undefined || person.dateOfBirth === undefined || person.physical === undefined) throw new Error(`World DB bootstrap profiled person is incomplete: ${personId}`)
  return { gender: person.gender, dateOfBirth: person.dateOfBirth, physical: person.physical }
}

function assertCompleteRoundRobin(games: readonly Game[], teamCount: number, meetingsPerPair: number): Game[] {
  const expectedGames = teamCount * (teamCount - 1) / 2 * meetingsPerPair
  if (games.length !== expectedGames) throw new RangeError(`RealWorldSpain regular schedule requires ${expectedGames} games; found ${games.length}`)
  const rounds = new Map<string, Game[]>()
  const pairs = new Map<string, Game[]>()
  for (const game of games) {
    rounds.set(game.date, [...(rounds.get(game.date) ?? []), game])
    const key = [game.homeTeamId, game.awayTeamId].sort().join(':')
    pairs.set(key, [...(pairs.get(key) ?? []), game])
  }
  // A round may span several dates and an odd-sized league has byes.
  for (const [date, round] of rounds) {
    const participants = round.flatMap((game) => [game.homeTeamId, game.awayTeamId])
    if (new Set(participants).size !== participants.length) throw new RangeError(`World DB calendar has a team scheduled twice on ${date}`)
  }
  for (const pair of pairs.values()) {
    if (pair.length !== meetingsPerPair || (meetingsPerPair === 2 && (pair[0]!.homeTeamId !== pair[1]!.awayTeamId || pair[0]!.awayTeamId !== pair[1]!.homeTeamId))) throw new RangeError('RealWorldSpain round-robin schedule has an incomplete or unbalanced matchup')
  }
  if (pairs.size !== teamCount * (teamCount - 1) / 2) throw new RangeError('RealWorldSpain regular schedule does not cover every team pair')
  return [...games]
}

function assertExactPlayerKeys(values: Readonly<Record<string, number>>, expected: readonly string[], label: string): void {
  const keys = Object.keys(values)
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new RangeError(`World DB bootstrap player ${label} must contain exactly ${expected.length} canonical keys`)
  }
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
