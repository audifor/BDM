import { describe, expect, it } from 'vitest'
import { createPlace } from '@/domain/facilities'
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
