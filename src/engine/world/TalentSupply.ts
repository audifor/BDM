import { createPerson } from '@/domain/person'
import { parseGameDate } from '@/domain/date'
import { createPlayer, calculateAge, type Player, type PlayerPathwaySource } from '@/domain/player'
import type { Place } from '@/domain/facilities'
import { countryIdFromString, personIdFromString, playerIdFromString } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import {
  createTalentCohort,
  createTalentMaterialization,
  talentCandidateKey,
  type CreateTalentCohortInput,
  type TalentCohortId,
  type TalentMaterializationCause,
  type TalentSupplyInputs,
} from '@/domain/talent'
import { generateCanonicalDevelopmentProfile, generateCanonicalRatings } from './CanonicalPlayerTruthGenerator'
import { generatePlayerBio } from './PlayerBioGenerator'
import { generatePersonName } from './GeneratedPersonName'

export const TALENT_GENERATOR_VERSION = 'global-talent-v1'

export function createTalentSupplyCohort(world: GameWorld, input: CreateTalentCohortInput): GameWorld {
  const cohort = createTalentCohort(input)
  if (world.placesById[cohort.placeId] === undefined) throw new RangeError(`Talent cohort Place ${cohort.placeId} does not exist`)
  if (world.talentCohortsById[cohort.id] !== undefined) throw new RangeError(`Talent cohort ${cohort.id} already exists`)
  return updateGameWorld(world, { talentCohorts: [...Object.values(world.talentCohortsById), cohort] })
}

export function materializeTalentCandidate(
  world: GameWorld,
  cohortId: TalentCohortId | string,
  candidateIndex: number,
  cause: TalentMaterializationCause,
): { readonly world: GameWorld; readonly player: Player; readonly created: boolean } {
  const result = materializeTalentCandidates(world, [{ cohortId, candidateIndex, cause }])
  return { world: result.world, player: result.players[0]!, created: result.createdCount === 1 }
}

export interface TalentCandidateRequest {
  readonly cohortId: TalentCohortId | string
  readonly candidateIndex: number
  readonly cause: TalentMaterializationCause
  readonly pathwaySource?: PlayerPathwaySource
}

export interface MaterializeTalentCandidatesResult {
  readonly world: GameWorld
  readonly players: readonly Player[]
  readonly createdCount: number
}

/** Resolves several consumers in one canonical world validation pass. */
export function materializeTalentCandidates(world: GameWorld, requests: readonly TalentCandidateRequest[]): MaterializeTalentCandidatesResult {
  if (requests.length === 0) return { world, players: [], createdCount: 0 }
  const playersById = { ...world.players } as Record<string, Player>
  const persons = [...Object.values(world.personsById)]
  const materializations = { ...world.talentMaterializationsByCandidateKey }
  const resolved: Player[] = []
  let createdCount = 0

  for (const request of requests) {
    const candidateKey = talentCandidateKey(request.cohortId, request.candidateIndex)
    const existing = materializations[candidateKey]
    if (existing !== undefined) {
      resolved.push(playersById[existing.playerId]!)
      continue
    }

    const cohort = world.talentCohortsById[request.cohortId]
    if (cohort === undefined) throw new RangeError(`Talent cohort ${request.cohortId} does not exist`)
    if (request.candidateIndex > cohort.candidateCapacity) throw new RangeError(`Talent cohort ${cohort.id} has no candidate ${request.candidateIndex}; capacity is ${cohort.candidateCapacity}`)
    if (cohort.birthYear >= Number(world.currentDate.slice(0, 4))) throw new RangeError('Talent cohort birth year must be before the current game year')

    const place = world.placesById[cohort.placeId]!
    const nationalityId = countryForPlace(world, place)
    const playerId = playerIdFromString(`player:talent:${cohort.id}:${request.candidateIndex.toString().padStart(6, '0')}`)
    if (playersById[playerId] !== undefined) throw new RangeError(`Talent candidate ${candidateKey} conflicts with an existing Player ID`)
    const random = new SeededRandomSource(hashStringToSeed(`talent-candidate:${cohort.seed}:${candidateKey}:${TALENT_GENERATOR_VERSION}`))
    const position = random.pick(['PG', 'SG', 'SF', 'PF', 'C'] as const)
    const bio = generatePlayerBio(playerId, position, world.currentDate, cohort.birthYear)
    const ratings = generateCanonicalRatings(cohort.seed, playerId, position, 35, 82, 'globalTalentRareTailV1')
    const pathwayHistory = generatedPathwayHistory(world, cohort, request, candidateKey, nationalityId)
    const player = createPlayer({
      id: playerId,
      ...generatePersonName(random),
      gender: cohort.gender,
      nationalityId,
      basketball: { primaryPosition: position, ratings },
      bio,
      development: generateCanonicalDevelopmentProfile(cohort.seed, playerId, ratings, calculateAge(bio.dateOfBirth, world.currentDate)),
      pathwayHistory,
    })
    const person = createPerson({
      id: personIdFromString(player.personId!),
      firstName: player.firstName,
      lastName: player.lastName,
      gender: player.gender,
      dateOfBirth: player.bio.dateOfBirth,
      nationalityIds: [player.nationalityId],
      profileRefs: [{ kind: 'player', profileId: player.id }],
    })
    const materialization = createTalentMaterialization({
      candidateKey,
      cohortId: cohort.id,
      candidateIndex: request.candidateIndex,
      playerId: player.id,
      placeId: cohort.placeId,
      generationYear: cohort.generationYear,
      generatorVersion: TALENT_GENERATOR_VERSION,
      materializationCause: request.cause,
      materializedOn: world.currentDate,
    })
    playersById[player.id] = player
    persons.push(person)
    materializations[candidateKey] = materialization
    resolved.push(player)
    createdCount += 1
  }

  if (createdCount === 0) return { world, players: resolved, createdCount }
  const next = updateGameWorld(world, {
    persons,
    players: Object.values(playersById),
    talentMaterializations: Object.values(materializations),
  })
  return { world: next, players: resolved, createdCount }
}

function generatedPathwayHistory(
  world: GameWorld,
  cohort: GameWorld['talentCohortsById'][string],
  request: TalentCandidateRequest,
  candidateKey: string,
  nationalityId: ReturnType<typeof countryIdFromString>,
): Player['pathwayHistory'] {
  const source = request.cause === 'ACADEMY_INTAKE'
    ? 'ACADEMY_YOUTH'
    : request.pathwaySource ?? cohort.pathwaySource ?? sourceFromContext(world, cohort, candidateKey, nationalityId)
  const record = (recordSource: PlayerPathwaySource, occurredOn: string) => ({
    id: `pathway:${candidateKey}:${recordSource}:${occurredOn}`,
    source: recordSource,
    occurredOn: parseGameDate(occurredOn),
    placeId: cohort.placeId,
    evidenceId: `talent-materialization:${candidateKey}:${recordSource}`,
  })
  if (source === 'JUCO') {
    if (Number(world.currentDate.slice(0, 4)) - cohort.birthYear < 19) throw new RangeError('JUCO pathway requires a candidate age of at least 19')
    const highSchoolDate = `${cohort.birthYear + 18}-06-30`
    return [record('US_HIGH_SCHOOL', highSchoolDate), record('JUCO', world.currentDate)]
  }
  return [record(source, world.currentDate)]
}

function sourceFromContext(
  world: GameWorld,
  cohort: GameWorld['talentCohortsById'][string],
  candidateKey: string,
  nationalityId: ReturnType<typeof countryIdFromString>,
): PlayerPathwaySource {
  const country = world.countries[nationalityId]
  if (country?.code.toUpperCase() === 'USA') {
    const age = Number(world.currentDate.slice(0, 4)) - cohort.birthYear
    if (age < 19) return 'US_HIGH_SCHOOL'
    // Older U.S. candidates can arrive through high school or the distinct two-year route.
    // The cohort seed makes that upstream pathway choice repeatable without a recruiting quota.
    const routeRandom = new SeededRandomSource(hashStringToSeed(`talent-pathway:${cohort.seed}:${candidateKey}:v1`))
    return routeRandom.pick(['US_HIGH_SCHOOL', 'JUCO'] as const)
  }
  const hasLocalInternationalEcosystem = Object.values(world.teams).some((team) =>
    team.countryId === nationalityId
      && Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(team.id)
        && world.ecosystems[competition.ecosystemId]?.kind === 'fibaLike'),
  )
  if (!hasLocalInternationalEcosystem) return 'OTHER_PRECOLLEGE'
  const routeRandom = new SeededRandomSource(hashStringToSeed(`talent-pathway:${cohort.seed}:${candidateKey}:v1`))
  return routeRandom.pick(['INTERNATIONAL_CLUB', 'OTHER_PRECOLLEGE'] as const)
}

export interface TalentSupplyMetrics {
  readonly cohortId: TalentCohortId
  readonly placeId: string
  readonly cohortAge: number
  readonly latentCount: number
  readonly materializedCount: number
  readonly unrosteredMaterializedCount: number
}

export function getTalentSupplyMetrics(world: GameWorld, cohortId: TalentCohortId | string): TalentSupplyMetrics {
  const cohort = world.talentCohortsById[cohortId]
  if (cohort === undefined) throw new RangeError(`Talent cohort ${cohortId} does not exist`)
  const records = Object.values(world.talentMaterializationsByCandidateKey).filter((record) => record.cohortId === cohort.id)
  const rostered = new Set(Object.values(world.teams).flatMap((team) => team.rosterPlayerIds))
  return {
    cohortId: cohort.id,
    placeId: cohort.placeId,
    cohortAge: Number(world.currentDate.slice(0, 4)) - cohort.birthYear,
    latentCount: cohort.candidateCapacity - records.length,
    materializedCount: records.length,
    unrosteredMaterializedCount: records.filter((record) => !rostered.has(record.playerId)).length,
  }
}

export interface TalentSupplyFixture {
  readonly id: string
  readonly name: string
  readonly ageCohortPopulation: number
  readonly basketballParticipationPerThousand: number
  readonly accessOpportunityBasisPoints: number
}

/** Synthetic engine-validation fixtures only; these are not demographic claims or production data. */
export const TALENT_SUPPLY_TEST_FIXTURES: readonly TalentSupplyFixture[] = Object.freeze([
  { id: 'fixture-large-community', name: 'Large fixture community', ageCohortPopulation: 100_000, basketballParticipationPerThousand: 45, accessOpportunityBasisPoints: 8000 },
  { id: 'fixture-established-community', name: 'Established fixture community', ageCohortPopulation: 30_000, basketballParticipationPerThousand: 70, accessOpportunityBasisPoints: 8500 },
  { id: 'fixture-small-community', name: 'Small fixture community', ageCohortPopulation: 8_000, basketballParticipationPerThousand: 55, accessOpportunityBasisPoints: 7000 },
])

export function createTalentSupplyInputs(fixture: TalentSupplyFixture): TalentSupplyInputs {
  return {
    ageCohortPopulation: fixture.ageCohortPopulation,
    basketballParticipationPerThousand: fixture.basketballParticipationPerThousand,
    accessOpportunityBasisPoints: fixture.accessOpportunityBasisPoints,
  }
}

function countryForPlace(world: GameWorld, startingPlace: Place) {
  let current: Place | undefined = startingPlace
  const visited = new Set<string>()
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.countryId !== null) {
      if (world.countries[current.countryId] === undefined) throw new RangeError(`Talent Place ${current.id} references unknown Country ${current.countryId}`)
      return countryIdFromString(current.countryId)
    }
    current = current.parentPlaceId === null ? undefined : world.placesById[current.parentPlaceId]
  }
  throw new RangeError(`Talent Place ${startingPlace.id} has no Country in its Place hierarchy`)
}
