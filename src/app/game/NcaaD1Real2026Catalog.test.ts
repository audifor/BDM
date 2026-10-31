import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument, parseWorldCompetitionRuntimeBundle, NCAA_MEN_GAME_FORMAT, NCAA_WOMEN_GAME_FORMAT } from '@/domain/competition'
import membership from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import officialFormats from '@/data/worlddb-v2/competition-runtime.json'
import supplementalFormats from '@/data/worlddb-v2/additional-formats.json'
import publishedCatalog from '@/data/worlddb-v2/competitions.json'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import { reconcileNcaaD1Real2026MenConferenceFormats } from './NcaaD1Real2026MenReferences'
import sourceFixtureSample from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import { projectNcaaD1Real2026Fixtures, type NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'

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

  it('projects 728 sourced real programs into existing NCAA Conference and season membership domain entities', () => {
    const men = buildNcaaD1Real2026ConferenceSnapshot('men')
    const women = buildNcaaD1Real2026ConferenceSnapshot('women')
    expect(men.conferences).toHaveLength(32)
    expect(women.conferences).toHaveLength(32)
    expect(men.memberships).toHaveLength(365)
    expect(women.memberships).toHaveLength(363)
    expect(men.teams).toHaveLength(365)
    expect(women.teams).toHaveLength(363)
    expect(new Set(men.memberships.map(m => m.teamId)).size).toBe(365)
    expect(new Set(women.memberships.map(m => m.teamId)).size).toBe(363)
    expect(men.memberships.every(m => m.seasonId === men.seasonId)).toBe(true)
    expect(women.memberships.every(m => m.seasonId === women.seasonId)).toBe(true)
    expect(men.memberships.every(m => men.conferences.some(c => c.id === m.conferenceId))).toBe(true)
    expect(women.memberships.every(m => women.conferences.some(c => c.id === m.conferenceId))).toBe(true)
    expect(men.teams.every(t => t.gender === 'male')).toBe(true)
    expect(women.teams.every(t => t.gender === 'female')).toBe(true)
    expect(men.teams.every(t => t.id.startsWith('ncaa:2026-27:men:'))).toBe(true)
    expect(women.teams.every(t => t.id.startsWith('ncaa:2026-27:women:'))).toBe(true)
    expect(men.ecosystemKind).toBe('ncaaLike')
    expect(women.ecosystemKind).toBe('ncaaLike')
    expect(men.gameFormat).toEqual(NCAA_MEN_GAME_FORMAT)
    expect(women.gameFormat).toEqual(NCAA_WOMEN_GAME_FORMAT)
    expect(men.seasonId).not.toBe(women.seasonId)
    expect(men.ecosystemId).not.toBe(women.ecosystemId)
    expect(men.sourceStatus).toContain('PENDING_INDIVIDUAL_OFFICIAL_VERIFICATION')
  })

  it('reconciles 32 documented 2026-27 mens conference formats to exactly 365 actual sourced programs', () => {
    const rows = reconcileNcaaD1Real2026MenConferenceFormats()
    expect(rows).toHaveLength(32)
    expect(rows.reduce((sum, row) => sum + row.sourceClubCount, 0)).toBe(365)
    expect(rows.every(row => row.documentedClubCount === row.sourceClubCount)).toBe(true)
    expect(new Set(rows.map(row => row.referenceEditionId)).size).toBe(32)
    const count = (referenceId: string) => rows.find(row => row.referenceFormatId.endsWith(':' + referenceId + ':regular-season'))?.sourceClubCount
    expect(count('asun')).toBe(8)
    expect(count('horizon')).toBe(12)
    expect(count('mac')).toBe(12)
    expect(count('nec')).toBe(9)
    const men = membership.genders.men.teams
    expect(men.filter(team => team.name === 'West Florida Argonauts' && team.conferenceId === 'atlantic-sun-conference')).toHaveLength(1)
    expect(men.filter(team => team.name === 'Northern Illinois Huskies' && team.conferenceId === 'horizon-league')).toHaveLength(1)
    expect(men.some(team => team.name === 'Saint Francis Red Wolves')).toBe(false)
    expect(membership.provenance.officialMembershipCorrections).toHaveLength(3)
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

  it('projects separately sourced 2026-27 real ASUN men and women fixtures into existing Game and conference classification', () => {
    expect(sourceFixtureSample.coverage).toBe('PARTIAL_OFFICIALLY_ANNOUNCED_GAMES_ONLY')
    const sources = sourceFixtureSample.fixtures as NcaaD1Real2026FixtureSource[]
    const men = projectNcaaD1Real2026Fixtures('men', sources.filter(source => source.gender === 'men'))
    const women = projectNcaaD1Real2026Fixtures('women', sources.filter(source => source.gender === 'women'))
    expect(men.games).toHaveLength(1)
    expect(women.games).toHaveLength(1)
    expect(men.games[0]?.classification).toBe('conference')
    expect(women.games[0]?.classification).toBe('conference')
    expect(men.games[0]?.date).toBe('2027-01-07')
    expect(women.games[0]?.date).toBe('2027-01-09')
    expect(men.games[0]?.status).toBe('scheduled')
    expect(women.games[0]?.status).toBe('scheduled')
    expect(men.games[0]?.competitionId).not.toBe(women.games[0]?.competitionId)
    expect(men.games[0]?.seasonId).not.toBe(women.games[0]?.seasonId)
    expect(Object.keys(men.evidenceByGameId)).toHaveLength(1)
    expect(Object.keys(women.evidenceByGameId)).toHaveLength(1)
  })

  it('rejects unverified, duplicated, cross-gender or wrong-edition NCAA source fixtures', () => {
    const m = sourceFixtureSample.fixtures[0]! as NcaaD1Real2026FixtureSource
    const w = sourceFixtureSample.fixtures[1]! as NcaaD1Real2026FixtureSource
    expect(() => projectNcaaD1Real2026Fixtures('men', [w])).toThrow(/gender/)
    expect(() => projectNcaaD1Real2026Fixtures('men', [m, m])).toThrow(/Duplicate/)
    expect(() => projectNcaaD1Real2026Fixtures('men', [{ ...m, date: '2018-01-07' }])).toThrow(/another edition/)
    expect(() => projectNcaaD1Real2026Fixtures('men', [{ ...m, sourceUrl: 'https:\/\/example.com/fake' }])).toThrow(/primary source/)
    expect(() => projectNcaaD1Real2026Fixtures('men', [{ ...m, awayProgramId: w.awayProgramId }])).toThrow(/outside/)
  })

  it('keeps new NCAA programs outside published PBM New Game until original-source and native acceptance', () => {
    expect(publishedCatalog).toHaveLength(4)
    expect(publishedCatalog.some(item => item.sourceCompetitionId === 'pbm:DYN_championnat:71')).toBe(false)
    expect(publishedCatalog.some(item => item.editionId === editions[1].championship)).toBe(false)
  })
})
