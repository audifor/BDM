import { createPlace } from '@/domain/facilities'
import { countryIdFromString, placeIdFromString } from '@/domain/ids'
import { createTalentCohort } from '@/domain/talent'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed } from '@/engine/random'

const INPUT_VERSION = 'bs15i-simulated-supply-v1'
const SYNTHETIC_INPUTS = Object.freeze({ ageCohortPopulation: 10_000, basketballParticipationPerThousand: 50, accessOpportunityBasisPoints: 8_000 })

/** Creates one deterministic, explicitly simulated age cohort per represented country and gender each July. */
export function progressAnnualTalentSupply(world: GameWorld): GameWorld {
  const year = Number(world.currentDate.slice(0, 4))
  const countries = [...new Set(Object.values(world.players).map((player) => String(player.nationalityId)))].sort()
  const worldSeedBasis = Object.values(world.players).slice(0, 20).map((player) => `${player.firstName}:${player.lastName}:${player.bio.dateOfBirth}`).join('|')
  const places = [...Object.values(world.placesById)]
  const placeIds = new Set(places.map((place) => place.id))
  const cohorts = [...Object.values(world.talentCohortsById)]
  const cohortIds = new Set<string>(cohorts.map((cohort) => cohort.id))
  for (const countryId of countries) {
    const existingOrigin = places.filter((place) => place.countryId === countryId).sort((a, b) => Number(b.kind === 'COUNTRY_REGION') - Number(a.kind === 'COUNTRY_REGION') || a.id.localeCompare(b.id))[0]
    const placeId = existingOrigin?.id ?? placeIdFromString(`talent-origin:${countryId}`)
    if (existingOrigin === undefined) {
      if (!placeIds.has(placeId)) {
        const place = createPlace({ id: placeId, kind: 'COUNTRY_REGION', name: world.countries[countryIdFromString(countryId)]?.name ?? countryId, countryId })
        places.push(place)
        placeIds.add(placeId)
      }
    }
    for (const gender of ['male', 'female'] as const) {
      const id = `annual-talent:${year}:${countryId}:${gender}`
      if (cohortIds.has(id)) continue
      cohorts.push(createTalentCohort({
        id,
        placeId,
        birthYear: year - 18,
        generationYear: year,
        gender,
        seed: hashStringToSeed(`${INPUT_VERSION}:${worldSeedBasis}:${countryId}:${year}:${gender}`),
        inputVersion: INPUT_VERSION,
        inputs: SYNTHETIC_INPUTS,
      }))
      cohortIds.add(id)
    }
  }
  if (places.length === Object.keys(world.placesById).length && cohorts.length === Object.keys(world.talentCohortsById).length) return world
  return updateGameWorld(world, { places, talentCohorts: cohorts })
}
