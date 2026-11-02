import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { instantiateWorldCompetitionFixedBracketV1 } from './WorldCompetitionFixedBracket'
import { resolveWorldCompetitionVirtualFixturesV1 } from './WorldCompetitionVirtualFixtureResolver'
import documents from '@/data/worlddb-v2/additional-formats.json'

const format = parseWorldCompetitionFormatDocument(documents[0])
const entries = Array.from({ length: 16 }, (_, i) => ({ competitionSeasonEntryId: `team:${i + 1}`, seed: i + 1 }))
describe('numbered predecessor contests from format data', () => {
  it('preserves declared contest order through four rounds, including upsets', () => {
    const plan = instantiateWorldCompetitionFixedBracketV1(format, 'MAIN', entries)
    expect(plan.fixtures).toHaveLength(15)
    const outcomes = plan.fixtures.filter(f => f.nodeKey === 'ROUND_OF_16').map(f => {
      const [a, b] = f.participants
      if (a.kind !== 'ENTRY' || b.kind !== 'ENTRY') throw Error('Expected source seeds')
      return { fixtureId: f.fixtureId, winnerEntryId: b.competitionSeasonEntryId, loserEntryId: a.competitionSeasonEntryId }
    })
    const qf = resolveWorldCompetitionVirtualFixturesV1(plan, outcomes).readyFixtures.filter(f => f.nodeKey === 'QUARTERFINALS')
    expect(qf.map(f => f.participants.map(p => p.competitionSeasonEntryId))).toEqual([
      ['team:16', 'team:9'], ['team:15', 'team:10'], ['team:14', 'team:11'], ['team:13', 'team:12'],
    ])
    expect(qf[0]!.participants.map(p => p.seed)).toEqual([16, 9])
  })
  it.each(['WINNER_0-WINNER_8', 'WINNER_1-WINNER_99', 'WINNER_1-WINNER_1'])('rejects invalid references %s', pairing => {
    const raw = structuredClone(documents[0]!)
    // Supplemental NCAA championship formats widen the JSON literal union.
    // Mutate the existing NBB round payload without assuming every format has matchups.
    Object.assign(raw.variants[0]!.nodes.find(n => n.key === 'QUARTERFINALS')!.pairing!.payload!, { matchups: [pairing] })
    expect(() => instantiateWorldCompetitionFixedBracketV1(parseWorldCompetitionFormatDocument(raw), 'MAIN', entries)).toThrow(/predecessor fixture/)
  })
  it('does not infer a numbered path across multiple predecessor rounds', () => {
    const raw = structuredClone(documents[0]!)
    // Construct the invalid graph without mutating a JSON union's narrow edge array.
    const variant = raw.variants[0]!
    const invalid = { ...raw, variants: [
      { ...variant, edges: [...variant.edges, { from: 'CLASSIFICATION', to: 'QUARTERFINALS', selector: 'WINNER' }] },
    ] }
    expect(() => instantiateWorldCompetitionFixedBracketV1(parseWorldCompetitionFormatDocument(invalid), 'MAIN', entries)).toThrow(/one WINNER source/)
  })
})
