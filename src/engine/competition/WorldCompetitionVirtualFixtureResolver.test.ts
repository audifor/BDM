import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { instantiateWorldCompetitionFixedBracketV1 } from './WorldCompetitionFixedBracket'
import { resolveWorldCompetitionVirtualFixturesV1, selectWorldCompetitionHigherSeedV1 } from './WorldCompetitionVirtualFixtureResolver'

const format = parseWorldCompetitionFormatDocument({
  schema_version: '1.0',
  competition_id: 'competition:test',
  competition_season_id: 'edition:test:2026',
  season_label: '2026',
  status: 'COMPLETE',
  variants: [{
    key: 'MAIN',
    nodes: [
      { key: 'SF', node_type: 'ROUND', role: 'PLAYOFF', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: { pairings: ['1_VS_4', '2_VS_3'] } }, contest: { format_type: 'SINGLE_GAME', requires_winner: true } },
      { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SINGLE_GAME', requires_winner: true } },
    ],
    edges: [{ from: 'SF', to: 'FINAL', selector: 'WINNER' }],
  }],
  sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
})

const plan = instantiateWorldCompetitionFixedBracketV1(format, 'MAIN', [1, 2, 3, 4].map((seed) => ({ competitionSeasonEntryId: `entry:${seed}`, seed })))
const semis = plan.fixtures.filter((fixture) => fixture.nodeKey === 'SF')
const final = plan.fixtures.find((fixture) => fixture.nodeKey === 'FINAL')!

describe('WorldCompetitionVirtualFixtureResolver v2', () => {
  it('exposes initial contests, then resolves the final with original seeds preserved', () => {
    const initial = resolveWorldCompetitionVirtualFixturesV1(plan, [])
    expect(initial.readyFixtures.map((fixture) => fixture.fixtureId)).toEqual(semis.map((fixture) => fixture.fixtureId))

    const oneDone = resolveWorldCompetitionVirtualFixturesV1(plan, [
      { fixtureId: semis[0]!.fixtureId, winnerEntryId: 'entry:4', loserEntryId: 'entry:1' },
    ])
    expect(oneDone.readyFixtures.map((fixture) => fixture.fixtureId)).toEqual([semis[1]!.fixtureId])

    const bothDone = resolveWorldCompetitionVirtualFixturesV1(plan, [
      { fixtureId: semis[0]!.fixtureId, winnerEntryId: 'entry:4', loserEntryId: 'entry:1' },
      { fixtureId: semis[1]!.fixtureId, winnerEntryId: 'entry:2', loserEntryId: 'entry:3' },
    ])
    expect(bothDone.readyFixtures).toHaveLength(1)
    expect(bothDone.readyFixtures[0]?.fixtureId).toBe(final.fixtureId)
    expect(bothDone.readyFixtures[0]?.participants).toEqual([
      { competitionSeasonEntryId: 'entry:4', seed: 4 },
      { competitionSeasonEntryId: 'entry:2', seed: 2 },
    ])
    expect(selectWorldCompetitionHigherSeedV1(bothDone.readyFixtures[0]!.participants)).toEqual({ competitionSeasonEntryId: 'entry:2', seed: 2 })
  })

  it('rejects impossible outcomes and downstream outcomes before participants resolve', () => {
    expect(() => resolveWorldCompetitionVirtualFixturesV1(plan, [
      { fixtureId: semis[0]!.fixtureId, winnerEntryId: 'entry:99', loserEntryId: 'entry:1' },
    ])).toThrow('do not match')

    expect(() => resolveWorldCompetitionVirtualFixturesV1(plan, [
      { fixtureId: final.fixtureId, winnerEntryId: 'entry:1', loserEntryId: 'entry:2' },
    ])).toThrow('before participants are resolved')
  })

  it('rejects duplicate outcomes and unknown fixture ids', () => {
    const outcome = { fixtureId: semis[0]!.fixtureId, winnerEntryId: 'entry:1', loserEntryId: 'entry:4' }
    expect(() => resolveWorldCompetitionVirtualFixturesV1(plan, [outcome, outcome])).toThrow('Duplicate virtual fixture outcome')
    expect(() => resolveWorldCompetitionVirtualFixturesV1(plan, [{ fixtureId: 'missing', winnerEntryId: 'entry:1', loserEntryId: 'entry:4' }])).toThrow('unknown fixture')
  })
})
