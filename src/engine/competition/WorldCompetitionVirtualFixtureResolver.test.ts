import { describe, expect, it } from 'vitest'

import type { WorldCompetitionFixedBracketPlanV1 } from './WorldCompetitionFixedBracket'
import { listReadyUncompletedWorldCompetitionFixturesV1, resolveWorldCompetitionVirtualFixturesV1 } from './WorldCompetitionVirtualFixtureResolver'

const plan: WorldCompetitionFixedBracketPlanV1 = {
  competitionSeasonId: 'edition:test',
  variantKey: 'MAIN',
  fixtureIdsByNodeKey: { SF: ['sf1', 'sf2'], FINAL: ['final'] },
  fixtures: [
    {
      fixtureId: 'sf1', competitionSeasonId: 'edition:test', variantKey: 'MAIN', nodeKey: 'SF', fixtureOrder: 1,
      participants: [
        { kind: 'ENTRY', competitionSeasonEntryId: 'entry:1', seed: 1 },
        { kind: 'ENTRY', competitionSeasonEntryId: 'entry:4', seed: 4 },
      ],
    },
    {
      fixtureId: 'sf2', competitionSeasonId: 'edition:test', variantKey: 'MAIN', nodeKey: 'SF', fixtureOrder: 2,
      participants: [
        { kind: 'ENTRY', competitionSeasonEntryId: 'entry:2', seed: 2 },
        { kind: 'ENTRY', competitionSeasonEntryId: 'entry:3', seed: 3 },
      ],
    },
    {
      fixtureId: 'final', competitionSeasonId: 'edition:test', variantKey: 'MAIN', nodeKey: 'FINAL', fixtureOrder: 1,
      participants: [
        { kind: 'WINNER_OF_FIXTURE', fixtureId: 'sf1' },
        { kind: 'WINNER_OF_FIXTURE', fixtureId: 'sf2' },
      ],
    },
  ],
}

describe('Phase 1 virtual fixture resolver', () => {
  it('exposes only initial fixtures before any result exists', () => {
    expect(listReadyUncompletedWorldCompetitionFixturesV1(plan, []).map((fixture) => fixture.fixtureId)).toEqual(['sf1', 'sf2'])
    expect(resolveWorldCompetitionVirtualFixturesV1(plan, []).find((fixture) => fixture.fixtureId === 'final')?.ready).toBe(false)
  })

  it('resolves the final only after both predecessor winners exist', () => {
    const oneResult = [{ fixtureId: 'sf1', winnerEntryId: 'entry:1', loserEntryId: 'entry:4' }]
    expect(listReadyUncompletedWorldCompetitionFixturesV1(plan, oneResult).map((fixture) => fixture.fixtureId)).toEqual(['sf2'])

    const bothResults = [
      ...oneResult,
      { fixtureId: 'sf2', winnerEntryId: 'entry:3', loserEntryId: 'entry:2' },
    ]
    expect(listReadyUncompletedWorldCompetitionFixturesV1(plan, bothResults)).toEqual([
      {
        fixtureId: 'final',
        nodeKey: 'FINAL',
        fixtureOrder: 1,
        participantEntryIds: ['entry:1', 'entry:3'],
        ready: true,
        completed: false,
      },
    ])
  })

  it('rejects an outcome whose winner or loser was not in the fixture', () => {
    expect(() => resolveWorldCompetitionVirtualFixturesV1(plan, [
      { fixtureId: 'sf1', winnerEntryId: 'entry:99', loserEntryId: 'entry:4' },
    ])).toThrow('does not match resolved participants')
  })

  it('rejects outcomes for unknown fixtures', () => {
    expect(() => resolveWorldCompetitionVirtualFixturesV1(plan, [
      { fixtureId: 'missing', winnerEntryId: 'entry:1', loserEntryId: 'entry:4' },
    ])).toThrow('unknown fixture')
  })
})
