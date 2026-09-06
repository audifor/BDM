import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { competitionIdFromString } from '@/domain/ids'
import {
  resolveStandingsZoneBands,
  standingsZoneClassName,
  standingsZoneForPosition,
} from '@/ui-ng/applications/competition/standingsZones'

describe('standingsZones', () => {
  it('colors ACB-sized FIBA tables with playoff top half and bottom-two relegation band', () => {
    const world = createAcbTestGame()
    const competitionId = competitionIdFromString('acb-competition-liga-endesa-2026-27')
    const bands = resolveStandingsZoneBands(world, competitionId)

    expect(bands.teamCount).toBe(18)
    expect(bands.playoffThrough).toBe(8)
    expect(bands.relegationFrom).toBe(17)
    expect(standingsZoneForPosition(1, bands)).toBe('playoff')
    expect(standingsZoneForPosition(8, bands)).toBe('playoff')
    expect(standingsZoneForPosition(9, bands)).toBe('midtable')
    expect(standingsZoneForPosition(17, bands)).toBe('relegation')
    expect(standingsZoneForPosition(18, bands)).toBe('relegation')
    expect(standingsZoneClassName('playoff')).toBe('is-zone-playoff')
    expect(standingsZoneClassName('midtable')).toBeUndefined()
  })

  it('prefers ecosystem promotion/relegation exchange counts when configured', () => {
    const world = createNewGame()
    const competition = Object.values(world.competitions)[0]!
    const ecosystem = competition.ecosystemId === undefined ? undefined : world.ecosystems[competition.ecosystemId]
    if (ecosystem === undefined || ecosystem.tierMovementRules.length === 0) {
      // Prototype may be single-tier; still assert resolver stays safe.
      const bands = resolveStandingsZoneBands(world, competition.id)
      expect(bands.teamCount).toBe(competition.participantTeamIds.length)
      return
    }

    const upperRule = ecosystem.tierMovementRules[0]!
    const bands = resolveStandingsZoneBands(world, upperRule.upperCompetitionId)
    expect(bands.relegationFrom).toBe(bands.teamCount - upperRule.exchangeCount + 1)
  })
})
