import { describe, expect, it } from 'vitest'

import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { instantiateWorldCompetitionFixedBracketV1 } from './WorldCompetitionFixedBracket'

const format = parseWorldCompetitionFormatDocument({
  schema_version: '1.0',
  competition_id: 'competition:cup',
  competition_season_id: 'edition:cup:2026',
  season_label: '2026',
  status: 'COMPLETE',
  variants: [{
    key: 'MAIN',
    entry_selection: { method: 'RANK_BASED', payload: { rank_from: 1, rank_to: 8 } },
    seeding: { scheme_type: 'FIXED', basis: [] },
    nodes: [
      {
        key: 'QF', node_type: 'ROUND', role: 'FINAL_EIGHT', team_count: 8,
        pairing: { type: 'FIXED_BRACKET', payload: { pairings: ['1_VS_8', '4_VS_5', '2_VS_7', '3_VS_6'] } },
        contest: { format_type: 'SINGLE_GAME', requires_winner: true },
      },
      {
        key: 'SF', node_type: 'ROUND', role: 'FINAL_EIGHT', team_count: 4,
        pairing: { type: 'FIXED_BRACKET', payload: { paths: ['WINNER_2_VS_7_VS_WINNER_3_VS_6', 'WINNER_4_VS_5_VS_WINNER_1_VS_8'] } },
        contest: { format_type: 'SINGLE_GAME', requires_winner: true },
      },
      { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SINGLE_GAME', requires_winner: true } },
    ],
    edges: [
      { from: 'QF', to: 'SF', selector: 'WINNER' },
      { from: 'SF', to: 'FINAL', selector: 'WINNER' },
    ],
  }],
  sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
})

const seededEntries = Array.from({ length: 8 }, (_, index) => ({ competitionSeasonEntryId: `entry:${index + 1}`, seed: index + 1 }))

describe('Phase 1 fixed bracket instantiator', () => {
  it('materializes explicit seed pairings, explicit semifinal paths and the unambiguous final', () => {
    const plan = instantiateWorldCompetitionFixedBracketV1(format, 'MAIN', seededEntries)
    expect(plan.fixtures).toHaveLength(7)
    expect(plan.fixtureIdsByNodeKey.QF).toHaveLength(4)
    expect(plan.fixtureIdsByNodeKey.SF).toHaveLength(2)
    expect(plan.fixtureIdsByNodeKey.FINAL).toHaveLength(1)

    expect(plan.fixtures[0]?.participants).toEqual([
      { kind: 'ENTRY', competitionSeasonEntryId: 'entry:1', seed: 1 },
      { kind: 'ENTRY', competitionSeasonEntryId: 'entry:8', seed: 8 },
    ])

    const qf27 = plan.fixtures.find((fixture) => fixture.nodeKey === 'QF' && fixture.participants[0]?.kind === 'ENTRY' && fixture.participants[0].seed === 2)
    const qf36 = plan.fixtures.find((fixture) => fixture.nodeKey === 'QF' && fixture.participants[0]?.kind === 'ENTRY' && fixture.participants[0].seed === 3)
    const firstSemi = plan.fixtures.find((fixture) => fixture.nodeKey === 'SF' && fixture.fixtureOrder === 1)
    expect(firstSemi?.participants).toEqual([
      { kind: 'WINNER_OF_FIXTURE', fixtureId: qf27?.fixtureId },
      { kind: 'WINNER_OF_FIXTURE', fixtureId: qf36?.fixtureId },
    ])

    const semis = plan.fixtures.filter((fixture) => fixture.nodeKey === 'SF')
    expect(plan.fixtures.find((fixture) => fixture.nodeKey === 'FINAL')?.participants).toEqual([
      { kind: 'WINNER_OF_FIXTURE', fixtureId: semis[0]?.fixtureId },
      { kind: 'WINNER_OF_FIXTURE', fixtureId: semis[1]?.fixtureId },
    ])
  })

  it('accepts the canonical dash-form matchups alias used by league playoff documents', () => {
    const dashFormat = parseWorldCompetitionFormatDocument({
      schema_version: '1.0', competition_id: 'competition:test', competition_season_id: 'edition:test', season_label: 'test', status: 'COMPLETE',
      variants: [{ key: 'MAIN', nodes: [
        { key: 'QF', node_type: 'ROUND', role: 'PLAYOFF', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '4-5', '2-7', '3-6'] } } },
      ], edges: [] }],
      sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
    })
    const plan = instantiateWorldCompetitionFixedBracketV1(dashFormat, 'MAIN', seededEntries)
    expect(plan.fixtureIdsByNodeKey.QF).toHaveLength(4)
  })

  it('fails rather than inventing a multi-fixture winner path', () => {
    const ambiguous = parseWorldCompetitionFormatDocument({
      schema_version: '1.0', competition_id: 'competition:test', competition_season_id: 'edition:test', season_label: 'test', status: 'COMPLETE',
      variants: [{ key: 'MAIN', nodes: [
        { key: 'R1', node_type: 'ROUND', role: 'PLAYOFF', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { pairings: ['1_VS_8', '2_VS_7', '3_VS_6', '4_VS_5'] } } },
        { key: 'R2', node_type: 'ROUND', role: 'PLAYOFF', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: {} } },
      ], edges: [{ from: 'R1', to: 'R2', selector: 'WINNER' }] }],
      sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
    })
    expect(() => instantiateWorldCompetitionFixedBracketV1(ambiguous, 'MAIN', seededEntries)).toThrow('incoming WINNER progression')
  })

  it('rejects missing or duplicate seeds', () => {
    expect(() => instantiateWorldCompetitionFixedBracketV1(format, 'MAIN', seededEntries.slice(0, 7))).toThrow('seed is not present')
    expect(() => instantiateWorldCompetitionFixedBracketV1(format, 'MAIN', [
      { competitionSeasonEntryId: 'entry:a', seed: 1 },
      { competitionSeasonEntryId: 'entry:b', seed: 1 },
    ])).toThrow('Duplicate competition seed')
  })
})
