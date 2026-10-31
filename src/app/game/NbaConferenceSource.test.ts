import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'
import { NBA_EAST_FRANCHISE_NAMES, NBA_WEST_FRANCHISE_NAMES, pinNbaConferencesToSourceClubs } from './NbaConferenceSource'
import globalFormats from '@/data/worlddb-v2/global-formats.json'
import { teamIdFromString } from '@/domain/ids'

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
  it('refuses missing or duplicated source clubs rather than inventing conference assignments', () => {
    expect(() => pinNbaConferencesToSourceClubs(format, franchiseClubs.slice(1))).toThrow('30 unique')
    expect(() => pinNbaConferencesToSourceClubs(format, franchiseClubs.map((club, i) => i === 2 ? { ...club, name: 'Unknown Team' } : club))).toThrow('unresolved')
    expect(() => pinNbaConferencesToSourceClubs(format, franchiseClubs.map((club, i) => i === 2 ? { ...club, name: franchiseClubs[0]!.name } : club))).toThrow('duplicated')
  })
})
