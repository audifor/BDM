import { describe, expect, it } from 'vitest'
import { teamIdFromString } from '@/domain/ids'
import { generateBalancedMatrixRounds, matrixRoundCount } from './MatrixScheduleGenerator'

const ids = (n: number) => Array.from({ length: n }, (_, i) => teamIdFromString(`matrix-team-${String(i + 1).padStart(2, '0')}`))

function inspect(teamCount: number, quota: number) {
  const teams = ids(teamCount)
  const rounds = generateBalancedMatrixRounds(teams, quota)
  const totals = new Map(teams.map(t => [t, { home: 0, away: 0, opponents: new Set<string>() }]))
  const gamesByPair = new Map<string, number>()
  for (const round of rounds) {
    const seen = new Set<string>()
    for (const fixture of round) {
      const home = String(fixture.homeTeamId), away = String(fixture.awayTeamId)
      expect(home).not.toBe(away)
      expect(seen.has(home) || seen.has(away)).toBe(false)
      seen.add(home); seen.add(away)
      totals.get(fixture.homeTeamId)!.home++
      totals.get(fixture.awayTeamId)!.away++
      totals.get(fixture.homeTeamId)!.opponents.add(away)
      totals.get(fixture.awayTeamId)!.opponents.add(home)
      const pair = [home, away].sort().join('|')
      gamesByPair.set(pair, (gamesByPair.get(pair) ?? 0) + 1)
    }
  }
  for (const entry of totals.values()) {
    expect(entry.home + entry.away).toBe(quota)
    expect(Math.abs(entry.home - entry.away)).toBeLessThanOrEqual(1)
    expect(entry.opponents.size).toBe(teamCount - 1)
  }
  expect(rounds.length).toBe(matrixRoundCount(teamCount, quota))
  expect([...gamesByPair.values()].reduce((a, b) => a + b, 0)).toBe(teamCount * quota / 2)
  expect(generateBalancedMatrixRounds([...teams].reverse(), quota)).toEqual(rounds)
  return rounds
}

describe('generated WorldDB fixture matrix (never an official federation calendar)', () => {
  it('supports the 30 × 82 NBA-shaped quota without treating 82 as meetings per opponent', () => {
    const rounds = inspect(30, 82)
    expect(rounds).toHaveLength(82)
    expect(rounds.flat()).toHaveLength(1230)
  })
  it('supports a ten-club NBL-shaped 32-match fictional quota', () => {
    expect(inspect(10, 32).flat()).toHaveLength(160)
  })
  it('supports the official 10 × 33 NBL27 game quota, with 16/17 home distribution', () => {
    expect(inspect(10, 33).flat()).toHaveLength(165)
  })
  it('supports 31 clubs × 50 games with byes and balanced home/away', () => {
    const rounds = inspect(31, 50)
    expect(rounds).toHaveLength(75)
    expect(rounds.flat()).toHaveLength(775)
  })
  it('rejects duplicate clubs, impossible parity and invalid targets', () => {
    expect(() => generateBalancedMatrixRounds([...ids(4), ids(4)[0]!], 8)).toThrow(/Duplicate/)
    expect(() => generateBalancedMatrixRounds(ids(31), 49)).toThrow(/Odd-sized/)
    expect(() => matrixRoundCount(30, 0)).toThrow()
    expect(() => matrixRoundCount(1, 20)).toThrow()
  })
})
