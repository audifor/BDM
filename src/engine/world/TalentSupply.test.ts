import { describe, expect, it } from 'vitest'
import { createPlace } from '@/domain/facilities'
import { createCountry } from '@/domain/country'
import { createGameWorld, getPlayersInScoutingTerritory, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createTalentCohort } from '@/domain/talent'
import { auditTalentQualityDistribution, runTalentGenerationDiagnostic } from './TalentCohortAudit'
import { createTalentSupplyCohort, getTalentSupplyMetrics, materializeTalentCandidate, materializeTalentCandidates, TALENT_SUPPLY_TEST_FIXTURES } from './TalentSupply'

const savedAt = '2032-10-01T00:00:00.000Z'

function makeWorld() {
  const world = createGameWorld(createValidGameWorldInput())
  const country = Object.values(world.countries)[0]!
  const place = createPlace({ id: 'talent-place', kind: 'CITY', name: 'Talent fixture place', countryId: country.id })
  return updateGameWorld(world, { places: [...Object.values(world.placesById), place] })
}

function cohortInput(placeId: string, gender: 'male' | 'female' = 'male', id = `cohort:${gender}`) {
  return {
    id,
    placeId: placeId as never,
    birthYear: 2009,
    generationYear: 2032,
    gender,
    seed: 812,
    inputVersion: 'fixture-v1',
    inputs: { ageCohortPopulation: 20_000, basketballParticipationPerThousand: 60, accessOpportunityBasisPoints: 9000 },
  } as const
}

describe('BS15B global talent supply and materialization', () => {
  it('generates context-backed pre-college provenance deterministically before recruiting', () => {
    const base = makeWorld()
    const usa = createCountry({ id: 'country:us-pathway' as never, name: 'United States', code: 'USA' })
    const usPlace = createPlace({ id: 'place:us-pathway', kind: 'CITY', name: 'U.S. pathway place', countryId: usa.id })
    const usWorld = updateGameWorld(base, { countries: [...Object.values(base.countries), usa], places: [...Object.values(base.placesById), usPlace] })
    const young = createTalentSupplyCohort(usWorld, { ...cohortInput(usPlace.id, 'male', 'us-high-school'), birthYear: 2014 })
    const highSchool = materializeTalentCandidates(young, [{ cohortId: 'us-high-school', candidateIndex: 1, cause: 'RECRUITING_POOL' }])
    expect(highSchool.players[0]!.pathwayHistory).toMatchObject([{ source: 'US_HIGH_SCHOOL', placeId: usPlace.id }])
    expect(() => materializeTalentCandidates(young, [{ cohortId: 'us-high-school', candidateIndex: 2, cause: 'RECRUITING_POOL', pathwaySource: 'JUCO' }])).toThrow('age of at least 19')

    const matureInput = { ...cohortInput(usPlace.id, 'male', 'us-two-year'), birthYear: 2013, seed: 991 }
    const mature = createTalentSupplyCohort(usWorld, matureInput)
    const first = materializeTalentCandidates(mature, Array.from({ length: 40 }, (_, index) => ({ cohortId: 'us-two-year', candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const })))
    const repeat = materializeTalentCandidates(createTalentSupplyCohort(usWorld, matureInput), Array.from({ length: 40 }, (_, index) => ({ cohortId: 'us-two-year', candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const })))
    const firstSources = first.players.map((player) => player.pathwayHistory!.at(-1)!.source)
    expect(repeat.players.map((player) => player.pathwayHistory!.at(-1)!.source)).toEqual(firstSources)
    expect(firstSources).toContain('US_HIGH_SCHOOL')
    expect(firstSources).toContain('JUCO')
    const juco = first.players.find((player) => player.pathwayHistory!.at(-1)!.source === 'JUCO')!
    expect(juco.pathwayHistory!.map((item) => item.source)).toEqual(['US_HIGH_SCHOOL', 'JUCO'])
    expect(juco.pathwayHistory![0]!.occurredOn < juco.pathwayHistory![1]!.occurredOn).toBe(true)
    expect(new Set(first.players.map((player) => player.id)).size).toBe(40)
    expect(new Set(first.players.map((player) => player.personId)).size).toBe(40)

    const truthTarget = Object.values(usWorld.players)[0]!
    const changedTruthPlayer = { ...truthTarget, basketball: { ...truthTarget.basketball, ratings: { ...truthTarget.basketball.ratings, SPEED: 99 } } }
    const changedTruthWorld = updateGameWorld(usWorld, { players: [...Object.values(usWorld.players).filter((player) => player.id !== truthTarget.id), changedTruthPlayer] })
    const truthChangedCandidates = materializeTalentCandidates(createTalentSupplyCohort(changedTruthWorld, matureInput), Array.from({ length: 40 }, (_, index) => ({ cohortId: 'us-two-year', candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const })))
    expect(truthChangedCandidates.players.map((player) => player.pathwayHistory!.at(-1)!.source)).toEqual(firstSources)

    const differentSeedInput = { ...matureInput, seed: 992 }
    const differentSeed = materializeTalentCandidates(createTalentSupplyCohort(usWorld, differentSeedInput), Array.from({ length: 40 }, (_, index) => ({ cohortId: differentSeedInput.id, candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const })))
    expect(differentSeed.players.map((player) => player.pathwayHistory!.at(-1)!.source)).not.toEqual(firstSources)

    const academyWorld = createTalentSupplyCohort(usWorld, { ...cohortInput(usPlace.id, 'male', 'academy-intake') })
    const academy = materializeTalentCandidates(academyWorld, [{ cohortId: 'academy-intake', candidateIndex: 1, cause: 'ACADEMY_INTAKE' }])
    expect(academy.players[0]!.pathwayHistory!.at(-1)!.source).toBe('ACADEMY_YOUTH')

    const international = createCountry({ id: 'country:intl-pathway' as never, name: 'International', code: 'INT' })
    const intlPlace = createPlace({ id: 'place:intl-pathway', kind: 'CITY', name: 'International pathway place', countryId: international.id })
    const intlTeams = Object.values(base.teams).map((team) => ({ ...team, countryId: international.id }))
    const intlWorld = updateGameWorld(base, { countries: [...Object.values(base.countries), international], places: [...Object.values(base.placesById), intlPlace], teams: intlTeams })
    const intlCohort = createTalentSupplyCohort(intlWorld, { ...cohortInput(intlPlace.id, 'male', 'intl-source-mix'), seed: 813 })
    const intlPlayers = materializeTalentCandidates(intlCohort, Array.from({ length: 40 }, (_, index) => ({ cohortId: 'intl-source-mix', candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const }))).players
    const intlSources = intlPlayers.map((player) => player.pathwayHistory!.at(-1)!.source)
    expect(intlSources).toContain('INTERNATIONAL_CLUB')
    expect(intlSources).toContain('OTHER_PRECOLLEGE')
    const withPlayers = materializeTalentCandidates(intlCohort, Array.from({ length: 40 }, (_, index) => ({ cohortId: 'intl-source-mix', candidateIndex: index + 1, cause: 'RECRUITING_POOL' as const }))).world
    const restored = deserializeGameWorldV4(serializeGameWorldV4(withPlayers, savedAt))
    expect(restored.players[intlPlayers[0]!.id]!.pathwayHistory).toEqual(intlPlayers[0]!.pathwayHistory)
  })

  it('creates cheap, deterministic, finite cohorts with place-specific supply inputs', () => {
    const inputs = TALENT_SUPPLY_TEST_FIXTURES.map((fixture, index) => createTalentCohort({
      id: `fixture-cohort-${index}`,
      placeId: `fixture-place-${index}` as never,
      birthYear: 2009,
      generationYear: 2032,
      gender: 'male',
      seed: 99,
      inputVersion: 'test-fixture-v1',
      inputs: {
        ageCohortPopulation: fixture.ageCohortPopulation,
        basketballParticipationPerThousand: fixture.basketballParticipationPerThousand,
        accessOpportunityBasisPoints: fixture.accessOpportunityBasisPoints,
      },
    }))
    expect(inputs.map((cohort) => cohort.candidateCapacity)).toEqual([3600, 1785, 308])
    expect(createTalentCohort({ ...cohortInput('fixture-place-large'), id: 'repeat' })).toEqual(createTalentCohort({ ...cohortInput('fixture-place-large'), id: 'repeat' }))
    expect(() => createTalentCohort({ ...cohortInput('fixture-place-large'), id: 'empty', inputs: { ageCohortPopulation: 1, basketballParticipationPerThousand: 0, accessOpportunityBasisPoints: 10000 } })).not.toThrow()
  })

  it('materializes one canonical Player once, preserves origin through save/load, and never assigns a Team', () => {
    const base = makeWorld()
    const place = Object.values(base.placesById)[0]!
    let world = createTalentSupplyCohort(base, cohortInput(place.id))
    const first = materializeTalentCandidate(world, 'cohort:male', 17, 'SCOUTING_DISCOVERY')
    world = first.world
    expect(first.created).toBe(true)
    expect(first.player.personId).toBeTruthy()
    expect(first.player.bio.dateOfBirth.slice(0, 4)).toBe('2009')
    const person = world.personsById[first.player.personId!]!
    expect(person).toMatchObject({ gender: 'male', dateOfBirth: first.player.bio.dateOfBirth, nationalityIds: [first.player.nationalityId] })
    expect(world.talentMaterializationsByCandidateKey['cohort:male:candidate:000017']).toMatchObject({ placeId: place.id, generationYear: 2032, materializationCause: 'SCOUTING_DISCOVERY', playerId: first.player.id })
    expect(Object.values(world.teams).some((team) => team.rosterPlayerIds.includes(first.player.id))).toBe(false)
    expect(world.organizationKnowledge).toEqual(base.organizationKnowledge)
    expect(world.organizationPlayerAwarenessById).toEqual(base.organizationPlayerAwarenessById)

    const recruitingReference = materializeTalentCandidate(world, 'cohort:male', 17, 'RECRUITING_POOL')
    expect(recruitingReference.created).toBe(false)
    expect(recruitingReference.player.id).toBe(first.player.id)
    expect(recruitingReference.world).toBe(world)
    const other = materializeTalentCandidate(world, 'cohort:male', 18, 'RECRUITING_POOL')
    expect(other.player.id).not.toBe(first.player.id)
    expect(other.player.personId).not.toBe(first.player.personId)
    expect(other.player.bio.dateOfBirth.slice(0, 4)).toBe('2009')
    expect(other.player.bio).not.toEqual(first.player.bio)
    expect(other.player.basketball.ratings).not.toEqual(first.player.basketball.ratings)
    expect(other.player.development).not.toEqual(first.player.development)
    expect(getTalentSupplyMetrics(other.world, 'cohort:male')).toMatchObject({ latentCount: 1078, materializedCount: 2, unrosteredMaterializedCount: 2, cohortAge: 23 })

    const restored = deserializeGameWorldV4(serializeGameWorldV4(other.world, savedAt))
    const afterLoad = materializeTalentCandidate(restored, 'cohort:male', 17, 'RECRUITING_POOL')
    expect(afterLoad.created).toBe(false)
    expect(afterLoad.player.id).toBe(first.player.id)
    expect(restored.players[first.player.id]).toEqual(first.player)

    const legacySave = serializeGameWorldV4(base, savedAt)
    const legacyPayload = { ...legacySave.payload } as Record<string, unknown>
    delete legacyPayload.talentCohorts
    delete legacyPayload.talentMaterializations
    const legacyRestored = deserializeGameWorldV4({ ...legacySave, payload: legacyPayload })
    expect(legacyRestored.talentCohortsById).toEqual({})
    expect(legacyRestored.talentMaterializationsByCandidateKey).toEqual({})
  })

  it('supports women through the same cohort and materialization architecture', () => {
    const base = makeWorld()
    const place = Object.values(base.placesById)[0]!
    const withCohort = createTalentSupplyCohort(base, cohortInput(place.id, 'female'))
    const created = materializeTalentCandidate(withCohort, 'cohort:female', 1, 'SCOUTING_DISCOVERY')
    expect(created.player.gender).toBe('female')
    expect(created.world.talentMaterializationsByCandidateKey['cohort:female:candidate:000001']?.playerId).toBe(created.player.id)
  })

  it('does not generate a candidate after finite supply is exhausted', () => {
    const base = makeWorld()
    const place = Object.values(base.placesById)[0]!
    const noSupply = createTalentSupplyCohort(base, {
      ...cohortInput(place.id, 'male', 'cohort:empty'),
      inputs: { ageCohortPopulation: 100, basketballParticipationPerThousand: 0, accessOpportunityBasisPoints: 10_000 },
    })
    expect(noSupply.talentCohortsById['cohort:empty']?.candidateCapacity).toBe(0)
    expect(() => materializeTalentCandidate(noSupply, 'cohort:empty', 1, 'SCOUTING_DISCOVERY')).toThrow('capacity is 0')
  })

  it('keeps hidden Player Truth out of organization visibility and scouting selection', () => {
    const base = makeWorld()
    const place = Object.values(base.placesById)[0]!
    const withCohort = createTalentSupplyCohort(base, cohortInput(place.id))
    const materialized = materializeTalentCandidate(withCohort, 'cohort:male', 17, 'SCOUTING_DISCOVERY').world
    const team = Object.values(base.teams)[0]!
    const territory = { kind: 'COUNTRY' as const, countryId: team.countryId }
    const selectedBefore = getPlayersInScoutingTerritory(materialized, territory)
    const playerId = materialized.talentMaterializationsByCandidateKey['cohort:male:candidate:000017']!.playerId
    const player = materialized.players[playerId]!
    const changedPlayer = { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, speed: 99 } } }
    const changedTruth = updateGameWorld(materialized, { players: [...Object.values(materialized.players).filter((player) => player.id !== changedPlayer.id), changedPlayer] })
    expect(getPlayersInScoutingTerritory(changedTruth, territory)).toEqual(selectedBefore)
    expect(changedTruth.organizationKnowledge).toEqual(materialized.organizationKnowledge)
  })

  it('produces a deterministic rare tail and sensible five-position mix without materializing audit samples', () => {
    const first = auditTalentQualityDistribution(20_000, 17)
    const second = auditTalentQualityDistribution(20_000, 17)
    console.info('BS15B quality audit', first)
    expect(first).toEqual(second)
    expect(first.percentiles.P50).toBeLessThan(first.percentiles.P90)
    expect(first.percentiles.P90).toBeLessThan(first.percentiles.P99)
    expect(first.percentiles.P99).toBeLessThan(first.percentiles.P99_9)
    expect(first.percentiles.P99_9).toBeGreaterThanOrEqual(80)
    expect(first.qualityBands.ordinary + first.qualityBands.useful + first.qualityBands.strong + first.qualityBands.elite + first.qualityBands.generational).toBe(20_000)
    expect(first.qualityBands.generational).toBeGreaterThan(0)
    expect(Object.values(first.positionCounts).every((count) => count > 3_000)).toBe(true)
    const generationRun = runTalentGenerationDiagnostic(3, 200, 17)
    expect(generationRun).toMatchObject({ generationCount: 3, suppliedCandidates: 10_800, sampledCandidates: 600, duplicateCandidateKeys: 0 })
    expect(generationRun.checksum).toBe(runTalentGenerationDiagnostic(3, 200, 17).checksum)
  })

  it('reports much lower save cost for latent supply than for materialized candidates and records operation timings', () => {
    const base = makeWorld()
    const place = Object.values(base.placesById)[0]!
    const cohortStarted = performance.now()
    const latent = createTalentSupplyCohort(base, cohortInput(place.id))
    const createCohortMs = performance.now() - cohortStarted
    const inspectStarted = performance.now()
    expect(getTalentSupplyMetrics(latent, 'cohort:male').latentCount).toBe(1080)
    const inspectSupplyMs = performance.now() - inspectStarted

    const oneStarted = performance.now()
    const one = materializeTalentCandidate(latent, 'cohort:male', 1, 'SCOUTING_DISCOVERY')
    const materializeOneMs = performance.now() - oneStarted
    const hundredStarted = performance.now()
    const hundred = materializeTalentCandidates(latent, Array.from({ length: 100 }, (_, index) => ({ cohortId: 'cohort:male', candidateIndex: index + 1, cause: 'SCOUTING_DISCOVERY' as const })))
    const materialized = hundred.world
    const materializeHundredMs = performance.now() - hundredStarted

    const latentBytes = new TextEncoder().encode(JSON.stringify(serializeGameWorldV4(latent, savedAt).payload)).length
    const hundredBytes = new TextEncoder().encode(JSON.stringify(serializeGameWorldV4(materialized, savedAt).payload)).length
    const reloadStarted = performance.now()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(materialized, savedAt))
    const resolveExisting = materializeTalentCandidate(restored, 'cohort:male', 99, 'RECRUITING_POOL')
    const reloadResolveMs = performance.now() - reloadStarted
    expect(one.created).toBe(true)
    expect(hundred.createdCount).toBe(100)
    expect(hundredBytes).toBeGreaterThan(latentBytes * 1.1)
    expect(resolveExisting.created).toBe(false)
    expect(resolveExisting.player.id).toBe(materialized.talentMaterializationsByCandidateKey['cohort:male:candidate:000099']?.playerId)
    console.info('BS15B benchmark', { createCohortMs, inspectSupplyMs, materializeOneMs, materializeHundredMs, reloadResolveMs, latentPayloadBytes: latentBytes, hundredMaterializedPayloadBytes: hundredBytes })
  })
})
