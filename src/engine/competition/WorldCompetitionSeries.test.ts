import { describe, expect, it } from 'vitest'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'
import { evaluateWorldCompetitionSeriesV1, instantiateWorldCompetitionSeriesV1 } from './WorldCompetitionSeries'

const format: WorldCompetitionFormatDocument = Object.freeze({
  schemaVersion: '1.0',
  competitionId: 'competition:test',
  competitionSeasonId: 'edition:test:2026',
  seasonLabel: '2026',
  status: 'COMPLETE',
  variants: Object.freeze([Object.freeze({
    key: 'MAIN',
    isRealVariant: false,
    nodes: Object.freeze([Object.freeze({
      key: 'QF',
      nodeType: 'ROUND',
      role: 'PLAYOFF',
      contest: Object.freeze({ formatType: 'SERIES', bestOf: 3, winsRequired: 2 }),
      hosting: Object.freeze({ ruleType: 'SERIES_PATTERN', pattern: 'HAH', payload: Object.freeze({}) }),
    })]),
    edges: Object.freeze([]),
  })]),
  consequences: Object.freeze([]),
  sources: Object.freeze([Object.freeze({ url: 'https://example.com', type: 'OFFICIAL' })]),
})

describe('WorldCompetitionSeries', () => {
  it('instantiates explicit hosting pattern relative to the declared priority participant', () => {
    const plan = instantiateWorldCompetitionSeriesV1(format, 'MAIN', 'QF', {
      firstEntryId: 'seed-1',
      secondEntryId: 'seed-8',
      priorityEntryId: 'seed-1',
    })

    expect(plan.games.map((game) => [game.gameNo, game.homeEntryId, game.awayEntryId])).toEqual([
      [1, 'seed-1', 'seed-8'],
      [2, 'seed-8', 'seed-1'],
      [3, 'seed-1', 'seed-8'],
    ])
  })

  it('advances sequentially and stops immediately when the series is clinched', () => {
    const plan = instantiateWorldCompetitionSeriesV1(format, 'MAIN', 'QF', {
      firstEntryId: 'seed-1',
      secondEntryId: 'seed-8',
      priorityEntryId: 'seed-1',
    })
    const afterOne = evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: plan.games[0]!.gameId, homeScore: 80, awayScore: 70 },
    ])
    expect(afterOne.firstEntryWins).toBe(1)
    expect(afterOne.nextGame?.gameNo).toBe(2)

    const split = evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: plan.games[0]!.gameId, homeScore: 80, awayScore: 70 },
      { gameId: plan.games[1]!.gameId, homeScore: 77, awayScore: 74 },
    ])
    expect(split.firstEntryWins).toBe(1)
    expect(split.secondEntryWins).toBe(1)
    expect(split.nextGame?.gameNo).toBe(3)

    const clinched = evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: plan.games[0]!.gameId, homeScore: 80, awayScore: 70 },
      { gameId: plan.games[1]!.gameId, homeScore: 71, awayScore: 75 },
    ])
    expect(clinched.completed).toBe(true)
    expect(clinched.winnerEntryId).toBe('seed-1')
    expect(clinched.loserEntryId).toBe('seed-8')
    expect(clinched.nextGame).toBeNull()
  })

  it('rejects gaps, unknown games, ties and results after a clinch', () => {
    const plan = instantiateWorldCompetitionSeriesV1(format, 'MAIN', 'QF', {
      firstEntryId: 'seed-1',
      secondEntryId: 'seed-8',
      priorityEntryId: 'seed-1',
    })
    expect(() => evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: plan.games[1]!.gameId, homeScore: 80, awayScore: 70 },
    ])).toThrow('contiguous')
    expect(() => evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: 'missing', homeScore: 80, awayScore: 70 },
    ])).toThrow('unknown game')
    expect(() => evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: plan.games[0]!.gameId, homeScore: 80, awayScore: 80 },
    ])).toThrow('cannot be tied')
    expect(() => evaluateWorldCompetitionSeriesV1(plan, [
      { gameId: plan.games[0]!.gameId, homeScore: 80, awayScore: 70 },
      { gameId: plan.games[1]!.gameId, homeScore: 70, awayScore: 80 },
      { gameId: plan.games[2]!.gameId, homeScore: 80, awayScore: 70 },
    ])).toThrow('after clinch')
  })
})
