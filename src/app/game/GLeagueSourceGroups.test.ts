import { describe, expect, it } from 'vitest'
import { teamIdFromString } from '@/domain/ids'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import globalFormats from '@/data/worlddb-v2/global-formats.json'
import { GLEAGUE_2026_FRANCHISE_NAMES, pinGLeagueSourceMemberships } from './GLeagueSourceGroups'

const format = parseWorldCompetitionFormatDocument(globalFormats.find(f => f.competition_id === 'competition:NAM:gleague'))
const clubs = GLEAGUE_2026_FRANCHISE_NAMES.map((name, i) => ({
  id: `pbm:DYN_equipe:${120000 + i}`, name,
}))

describe('G League 2026-27 identity and two-phase format', () => {
  it('pins all 31 original IDs in the real 8-8-8-7 regions and 16-15 conferences', () => {
    const pinned = pinGLeagueSourceMemberships(format, [...clubs].reverse())
    const regular = pinned.variants[0]!.nodes.find(n => n.role === 'REGULAR_SEASON')!
    const tipoff = pinned.variants[0]!.nodes.find(n => n.key === 'TIP_OFF_TOURNAMENT')!
    const ids = clubs.map(club => teamIdFromString(club.id))
    const regions = resolveWorldCompetitionGroups(tipoff, ids)
    const conferences = resolveWorldCompetitionGroups(regular, ids)
    expect(regions.map(group => group.length)).toEqual([8, 8, 8, 7])
    expect(conferences.map(group => group.length)).toEqual([16, 15])
    expect(new Set(regions.flat())).toEqual(new Set(ids))
    expect(new Set(conferences.flat())).toEqual(new Set(ids))
    expect(regular.pairing?.payload.games_per_team).toBe(36)
    expect(tipoff.pairing?.payload.games_per_team).toBe(14)
    expect(format.variants[0]!.nodes[0]!.opponentScope?.payload.east_team_ids).toBeUndefined()
  })
  it('preserves relocated PBM franchise aliases without rewriting their IDs', () => {
    const renamed = clubs.map(c => c.name === 'Coachella Valley Lakers'
      ? { ...c, name: 'South Bay Lakers' } : c.name === 'Laketown Squadron'
        ? { ...c, name: 'Birmingham Squadron' } : c)
    expect(pinGLeagueSourceMemberships(format, renamed).competitionId).toBe('competition:NAM:gleague')
  })
  it('rejects unknown, missing, duplicated or incorrectly reassigned clubs', () => {
    expect(() => pinGLeagueSourceMemberships(format, clubs.slice(1))).toThrow(/31 unique/)
    expect(() => pinGLeagueSourceMemberships(format, clubs.map((club, i) => i === 3 ? { ...club, name: 'Unknown Team' } : club))).toThrow(/reconciled/)
    expect(() => pinGLeagueSourceMemberships(format, clubs.map((club, i) => i === 3 ? { ...club, name: clubs[0]!.name } : club))).toThrow(/reconciled/)
  })
})
