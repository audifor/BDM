import { describe, expect, it } from 'vitest'

import { playerIdFromString, teamIdFromString } from '@/domain/ids'

import { advanceFatigue, calculateFatigueAdjustedTeamStrength, calculateFatigueAtEvents, createInitialFatigue, MAX_FATIGUE } from './Fatigue'
import type { MatchEvent, MatchLineups, MatchSquads } from './MatchEngine'

const HOME = teamIdFromString('fatigue-home')
const AWAY = teamIdFromString('fatigue-away')
const HOME_PLAYERS = Array.from({ length: 6 }, (_, index) => playerIdFromString(`fatigue-home-${index}`))
const AWAY_PLAYERS = Array.from({ length: 5 }, (_, index) => playerIdFromString(`fatigue-away-${index}`))
const squads: MatchSquads = { home: HOME_PLAYERS, away: AWAY_PLAYERS }
const lineups: MatchLineups = { home: HOME_PLAYERS.slice(0, 5), away: AWAY_PLAYERS }

describe('live fatigue', () => {
  it('initializes, gains on court, recovers on bench, and clamps', () => {
    const initial = createInitialFatigue(squads)
    expect(Object.values(initial).every((value) => value === 0)).toBe(true)
    const afterActive = advanceFatigue(initial, squads, lineups, 60)
    expect(afterActive[HOME_PLAYERS[0]!]).toBeCloseTo(2.4)
    expect(afterActive[HOME_PLAYERS[5]!]).toBe(0)
    const seeded = { ...initial, [HOME_PLAYERS[0]!]: 20, [HOME_PLAYERS[5]!]: 20 }
    const afterRecovery = advanceFatigue(seeded, squads, lineups, 60)
    expect(afterRecovery[HOME_PLAYERS[0]!]).toBeCloseTo(22.4)
    expect(afterRecovery[HOME_PLAYERS[5]!]).toBeCloseTo(18.5)
    expect(advanceFatigue({ ...initial, [HOME_PLAYERS[0]!]: MAX_FATIGUE }, squads, lineups, 60)[HOME_PLAYERS[0]!]).toBe(MAX_FATIGUE)
    expect(advanceFatigue(initial, squads, lineups, 60)[HOME_PLAYERS[5]!]).toBe(0)
  })

  it('adjusts only active-five strength with the provisional fatigue penalty', () => {
    const base = { teamId: HOME, value: 70 }
    expect(calculateFatigueAdjustedTeamStrength(base, lineups.home, Object.fromEntries(HOME_PLAYERS.map((id) => [id, 0]))).value).toBe(70)
    expect(calculateFatigueAdjustedTeamStrength(base, lineups.home, Object.fromEntries(HOME_PLAYERS.slice(0, 5).map((id) => [id, 50]))).value).toBe(63)
    expect(calculateFatigueAdjustedTeamStrength(base, lineups.home, Object.fromEntries(HOME_PLAYERS.map((id) => [id, 100]))).value).toBe(56)
    expect(calculateFatigueAdjustedTeamStrength(base, lineups.home, { [HOME_PLAYERS[0]!]: 100, [HOME_PLAYERS[5]!]: 0 }).value).toBeLessThan(70)
  })

  it('projects substitution fatigue chronologically and does not add quarter-break recovery', () => {
    const events: MatchEvent[] = [
      event({ sequence: 1, period: 1, clockSecondsRemaining: 600, type: 'periodStart' }),
      event({ sequence: 2, period: 1, clockSecondsRemaining: 300, type: 'substitution', teamId: HOME, playerOutId: HOME_PLAYERS[0]!, playerInId: HOME_PLAYERS[5]! }),
      event({ sequence: 3, period: 1, clockSecondsRemaining: 0, type: 'periodEnd' }),
      event({ sequence: 4, period: 2, clockSecondsRemaining: 600, type: 'periodStart' }),
    ]
    const fatigue = calculateFatigueAtEvents(lineups, squads, HOME, AWAY, events)
    expect(fatigue[HOME_PLAYERS[0]!]).toBeCloseTo(4.5)
    expect(fatigue[HOME_PLAYERS[5]!]).toBeCloseTo(12)
  })
})

function event(values: Record<string, unknown>): MatchEvent { return values as MatchEvent }
