import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

import { buildRosterBriefing, laneDiagnosis } from './buildRosterBriefing'

describe('buildRosterBriefing', () => {
  it('summarizes live roster holes, contracts and unknown scouting without inventing text', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const model = buildRosterBriefing(world, team.id)

    expect(model.rosterCount).toBe(roster.length)
    expect(model.unassignedCount + model.injuredCount).toBeGreaterThanOrEqual(0)
    expect(model.scholarshipCount + model.contractedCount).toBe(roster.length)
    expect(model.knownSignalPercent).toBeGreaterThanOrEqual(0)
    expect(model.knownSignalPercent).toBeLessThanOrEqual(100)
    expect(model.lanes.map((lane) => lane.position)).toEqual([...BASKETBALL_POSITIONS])
    expect(model.lanes.reduce((sum, lane) => sum + lane.count, 0)).toBe(roster.length)
    expect(model.lanes.every((lane) => lane.targetMin === 2 && lane.targetMax === 3)).toBe(true)
    expect(
      model.lanes.every((lane) =>
        ['shortage', 'thin', 'balanced', 'overload', 'critical'].includes(lane.diagnosis),
      ),
    ).toBe(true)
  })

  it('diagnoses lane depth against the 2–3 target without inventing roles', () => {
    expect(laneDiagnosis(0)).toBe('shortage')
    expect(laneDiagnosis(1)).toBe('thin')
    expect(laneDiagnosis(2)).toBe('balanced')
    expect(laneDiagnosis(3)).toBe('balanced')
    expect(laneDiagnosis(4)).toBe('overload')
    expect(laneDiagnosis(5)).toBe('critical')
  })
})
