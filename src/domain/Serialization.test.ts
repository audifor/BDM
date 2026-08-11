import { describe, expect, it } from 'vitest'

import { createCountry } from '@/domain/country'
import { createGameDate } from '@/domain/date'
import { countryIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createTeam } from '@/domain/team'

describe('domain serialization', () => {
  it('round-trips composed entities through JSON', () => {
    const country = createCountry({
      id: countryIdFromString('country-a'),
      name: 'Arcadia',
      code: 'ARC',
    })
    const team = createTeam({
      id: teamIdFromString('team-a'),
      name: 'Arcadia Owls',
      gender: 'female',
      countryId: country.id,
      rosterPlayerIds: [playerIdFromString('player-a')],
    })
    const value = { country, team, openingDate: createGameDate(2032, 10, 1) }

    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  })
})
