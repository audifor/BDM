import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'
import { NBA_EAST_FRANCHISE_NAMES, NBA_WEST_FRANCHISE_NAMES, pinNbaConferencesToSourceClubs } from './NbaConferenceSource'
import globalFormats from '@/data/worlddb-v2/global-formats.json'
import { teamIdFromString } from '@/domain/ids'
import { instantiateWorldCompetitionFixedBracketV1 } from '@/engine/competition/WorldCompetitionFixedBracket'

const format = parseWorldCompetitionFormatDocument(globalFormats.find(doc => doc.competition_id === 'competition:NAM:nba'))
const franchiseClubs = [...NBA_EAST_FRANCHISE_NAMES, ...NBA_WEST_FRANCHISE_NAMES].map((name, i) => ({
  id: `pbm:DYN_equipe:${326 + i}`, name,
}))
describe('NBA PBM conference identity pinning', () => {
  it('pins 30 original PBM IDs to East/West, independent of source ordering', () => {
    const pinned = pinNbaConferencesToSourceClubs(format, [...franchiseClubs].reverse())
    const regular = pinned.variants[0]!.nodes[0]!
    expect(regular.opponentScope?.payload.policy).toBe('BDM_PINNED_NBA_CONFERENCES')
    const groups = resolveWorldCompetitionGroups(regular, franchiseClubs.map(x => teamIdFromString(x.id)))
    expect(groups.map(group => group.length)).toEqual([15, 15])
    expect(new Set(groups.flat())).toEqual(new Set(franchiseClubs.map(x => x.id)))
    expect(format.variants[0]!.nodes[0]!.opponentScope?.payload.east_team_ids).toBeUndefined()
  })
  it('materializes distinct East and West Play-In, first round and NBA Finals brackets', () => {
    const pinned = pinNbaConferencesToSourceClubs(format, franchiseClubs)
    const entries = Array.from({ length: 30 }, (_, i) => ({
      competitionSeasonEntryId: `seed:${i + 1}`, seed: i + 1,
    }))
    const plan = instantiateWorldCompetitionFixedBracketV1(pinned, pinned.variants[0]!.key, entries)
    expect(plan.fixtureIdsByNodeKey['EAST_7_8']).toHaveLength(1)
    expect(plan.fixtureIdsByNodeKey['WEST_7_8']).toHaveLength(1)
    expect(plan.fixtureIdsByNodeKey['EAST_PLAY_IN_FINAL']).toHaveLength(1)
    expect(plan.fixtureIdsByNodeKey['WEST_PLAY_IN_FINAL']).toHaveLength(1)
    expect(plan.fixtureIdsByNodeKey['FIRST_ROUND']).toHaveLength(8)
    expect(plan.fixtureIdsByNodeKey['CONFERENCE_SEMIFINALS']).toHaveLength(4)
    expect(plan.fixtureIdsByNodeKey['CONFERENCE_FINALS']).toHaveLength(2)
    expect(plan.fixtureIdsByNodeKey['NBA_FINALS']).toHaveLength(1)
    expect(plan.fixtures).toHaveLength(20)
  })
  it('refuses missing or duplicated source clubs rather than inventing conference assignments', () => {
    expect(() => pinNbaConferencesToSourceClubs(format, franchiseClubs.slice(1))).toThrow('30 unique')
    expect(() => pinNbaConferencesToSourceClubs(format, franchiseClubs.map((club, i) => i === 2 ? { ...club, name: 'Unknown Team' } : club))).toThrow('unresolved')
    expect(() => pinNbaConferencesToSourceClubs(format, franchiseClubs.map((club, i) => i === 2 ? { ...club, name: franchiseClubs[0]!.name } : club))).toThrow('duplicated')
  })
})
