import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument, parseWorldCompetitionRuntimeBundle, NCAA_MEN_GAME_FORMAT, NCAA_WOMEN_GAME_FORMAT } from '@/domain/competition'
import membership from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import officialFormats from '@/data/worlddb-v2/competition-runtime.json'
import supplementalFormats from '@/data/worlddb-v2/additional-formats.json'
import publishedCatalog from '@/data/worlddb-v2/competitions.json'

const editions = [
  { gender: 'men', expected: 365, championship: 'edition:USA:ncaa-d1-men-championship:2026-27' },
  { gender: 'women', expected: 363, championship: 'edition:USA:ncaa-d1-women-championship:2026-27' },
] as const

const formats = [
  ...parseWorldCompetitionRuntimeBundle(officialFormats).competitionFormats,
  ...supplementalFormats.map(parseWorldCompetitionFormatDocument),
]
const formatByEdition = new Map(formats.map(format => [format.competitionSeasonId, format]))

describe('2026-27 real NCAA Division I men and women source catalog', () => {
  it('keeps the 365 mens and 363 womens real program identities and 32 conference affiliations separate', () => {
    expect(membership.season).toBe('2026-27')
    expect(membership.status).toBe('SECONDARY_DIRECTORY_MEMBERSHIP_PENDING_INDIVIDUAL_OFFICIAL_VERIFICATION')
    for (const edition of editions) {
      const cohort = membership.genders[edition.gender]
      expect(cohort.projectedNCAAPrograms).toBe(edition.expected)
      expect(cohort.teams).toHaveLength(edition.expected)
      expect(cohort.conferenceCount).toBe(32)
      expect(cohort.championshipFormatId).toBe(edition.championship)
      expect(new Set(cohort.teams.map(team => team.id)).size).toBe(edition.expected)
      expect(new Set(cohort.teams.map(team => team.conferenceId)).size).toBe(32)
      for (const program of cohort.teams) {
        expect(program.id).toMatch(new RegExp('^ncaa:2026-27:' + edition.gender + ':'))
        expect(program.name.trim().length).toBeGreaterThan(1)
        expect(program.conference.length).toBeGreaterThan(2)
        expect(program.sourceTeamUrl).toMatch(/^https:\/\//)
        expect(program.sourceConferenceUrl).toMatch(/^https:\/\//)
      }
    }
    expect(membership.provenance.sportSponsorshipCount).toContain('ncaa.org')
    // A historical PBM 353-club snapshot is not the present-day men or women cohort.
    expect(membership.genders.men.teams).not.toHaveLength(353)
    expect(membership.genders.women.teams).not.toHaveLength(353)
  })

  it('has distinct official 76-team 2027 championship formats with the required bracket progression', () => {
    for (const edition of editions) {
      const format = formatByEdition.get(edition.championship)
      expect(format, 'Missing real NCAA championship reference for ' + edition.gender).toBeDefined()
      expect(format?.status).toBe('COMPLETE')
      expect(format?.sources.some(source => source.type === 'OFFICIAL')).toBe(true)
      const variant = format!.variants[0]!
      expect(variant.entrySelection?.method).toBe('COMMITTEE_SELECTION')
      expect(variant.entrySelection?.payload.automatic_qualifiers).toBe(32)
      expect(variant.entrySelection?.payload.at_large).toBe(44)
      expect(variant.entrySelection?.payload.field_size).toBe(76)
      const stages = Object.fromEntries(variant.nodes.map(stage => [stage.key, stage]))
      for (const [key, count] of [['FIELD', 76], ['OPENING_ROUND', 24], ['FIRST_ROUND', 64], ['SECOND_ROUND', 32],
        ['SWEET_16', 16], ['ELITE_EIGHT', 8], ['FINAL_FOUR', 4], ['FINAL', 2]] as const) {
        expect(stages[key]?.teamCount).toBe(count)
      }
      const opening = stages['OPENING_ROUND']!
      expect(opening.pairing?.payload.automatic_qualifier_games).toBe(6)
      expect(opening.pairing?.payload.at_large_games).toBe(6)
      expect(opening.pairing?.payload.cross_class_pairing).toBe(false)
      expect(variant.edges.some(edge => edge.from === 'FIELD' && edge.to === 'FIRST_ROUND' && edge.selector === 'BYE' && edge.count === 52)).toBe(true)
      expect(variant.edges.some(edge => edge.from === 'OPENING_ROUND' && edge.to === 'FIRST_ROUND' && edge.selector === 'WINNER')).toBe(true)
    }
  })

  it('never transfers mens neutral opening sites or Detroit finals into womens tournament', () => {
    const men = formatByEdition.get(editions[0].championship)!.variants[0]!
    const women = formatByEdition.get(editions[1].championship)!.variants[0]!
    const stage = (nodes: typeof men.nodes, key: string) => nodes.find(node => node.key === key)!
    const menOpening = stage(men.nodes, 'OPENING_ROUND')
    const womenOpening = stage(women.nodes, 'OPENING_ROUND')
    expect(menOpening.hosting?.ruleType).toBe('NEUTRAL')
    expect(womenOpening.hosting?.ruleType).toBe('ASSIGNED_HOST')
    expect(womenOpening.hosting?.payload.site_type).toBe('CAMPUS')
    expect(womenOpening.hosting?.payload.dates).toEqual(['2027-03-17', '2027-03-18'])
    expect(stage(women.nodes, 'FIRST_ROUND').hosting?.ruleType).toBe('ASSIGNED_HOST')
    expect(stage(women.nodes, 'SECOND_ROUND').hosting?.ruleType).toBe('ASSIGNED_HOST')
    expect(stage(women.nodes, 'FINAL_FOUR').hosting?.payload.site).toContain('Columbus')
    expect(stage(women.nodes, 'FINAL').hosting?.payload.dates).toEqual(['2027-04-04'])
    expect(stage(men.nodes, 'FINAL_FOUR').pairing?.payload.site).toContain('Detroit')
    expect(stage(women.nodes, 'FINAL_FOUR').pairing?.payload.site).not.toContain('Detroit')
    expect(NCAA_MEN_GAME_FORMAT).not.toEqual(NCAA_WOMEN_GAME_FORMAT)
  })

  it('keeps new NCAA programs outside published PBM New Game until original-source and native acceptance', () => {
    expect(publishedCatalog).toHaveLength(4)
    expect(publishedCatalog.some(item => item.sourceCompetitionId === 'pbm:DYN_championnat:71')).toBe(false)
    expect(publishedCatalog.some(item => item.editionId === editions[1].championship)).toBe(false)
  })
})
