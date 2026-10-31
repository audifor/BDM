import officialAsun from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import programs from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import { createNcaaD1Real2026WorldSeed, type NcaaD1Real2026NativeSeed } from './NcaaD1Real2026WorldSeed'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'

export interface NcaawSourceCorpus {
  readonly season: '2026-27'
  readonly gender: 'women'
  readonly sourceQuality: 'SECONDARY_DIRECTORY_UNVERIFIED_NOT_OFFICIAL'
  readonly summary: { readonly programsRequested: 363; readonly programsWithSourcePages: number; readonly conferenceCount: 32; readonly distinctD1Games: number }
  readonly sourcePages: readonly { readonly programId: string; readonly sourceTeamUrl: string }[]
  readonly fixtures: readonly {
    readonly gameId: string
    readonly gender: 'women'
    readonly date: string
    readonly homeProgramId: string
    readonly awayProgramId: string
    readonly sourceUrl: string
    readonly evidenceKind: 'SECONDARY_DIRECTORY'
  }[]
}
export interface Ncaaw2026Coverage {
  readonly sourcedGames: number
  readonly officialAsunGames: number
  readonly otherUnverifiedGames: number
  readonly distinctProgramsWithGames: number
  readonly womenConferences: 32
  readonly officialFullSeasonCertification: false
}
export interface Ncaaw2026PreparedCalendar {
  readonly fixtures: readonly NcaaD1Real2026FixtureSource[]
  readonly coverage: Ncaaw2026Coverage
}
const womenIds = new Set(programs.genders.women.teams.map(team => team.id))
const byDatePair = (g: Pick<NcaaD1Real2026FixtureSource, 'date' | 'homeProgramId' | 'awayProgramId'>) =>
  [g.date, ...[g.homeProgramId, g.awayProgramId].sort()].join('|')

/** Uses ALL current school listings, not a random sample or generic RR.
 * An independent directory is never labeled official. The 56 actual ASUN
 * conference games replace overlapping secondary records with primary proof.
 */
export function prepareNcaaw2026RealCalendar(corpus: NcaawSourceCorpus): Ncaaw2026PreparedCalendar {
  if (corpus.gender !== 'women' || corpus.season !== '2026-27' ||
      corpus.sourceQuality !== 'SECONDARY_DIRECTORY_UNVERIFIED_NOT_OFFICIAL' ||
      corpus.summary.programsRequested !== 363 || corpus.summary.programsWithSourcePages !== 363 ||
      corpus.summary.conferenceCount !== 32 || corpus.sourcePages.length !== 363 ||
      corpus.summary.distinctD1Games !== corpus.fixtures.length ||
      womenIds.size !== 363 || new Set(corpus.sourcePages.map(p => p.programId)).size !== 363 ||
      corpus.sourcePages.some(p => !womenIds.has(p.programId))) {
    throw new Error('NCAAW 2026-27 requires all 363 real school schedules and 32 conferences')
  }
  const fixtures = new Map<string, NcaaD1Real2026FixtureSource>()
  const ids = new Set<string>()
  for (const game of corpus.fixtures) {
    if (game.gender !== 'women' || game.evidenceKind !== 'SECONDARY_DIRECTORY' ||
        !womenIds.has(game.homeProgramId) || !womenIds.has(game.awayProgramId) ||
        !game.gameId || ids.has(game.gameId) ||
        !game.sourceUrl.startsWith('https://www.ncaawomensbasketball.com/womens-college-basketball/game/')) {
      throw new Error('NCAAW secondary source has invalid identity, provenance or duplicated event')
    }
    ids.add(game.gameId)
    const key = byDatePair(game)
    if (fixtures.has(key)) throw new Error('NCAAW secondary events conflict for the same date and schools')
    fixtures.set(key, game)
  }
  const verifiedAsun = officialAsun.fixtures.filter(g => g.gender === 'women')
  if (verifiedAsun.length !== 56) throw new Error('NCAAW ASUN official 56-game conference calendar missing')
  for (const game of verifiedAsun) {
    if (!game.corroboratingSourceUrl || game.evidenceKind !== 'CONFERENCE_OFFICIAL' ||
        !womenIds.has(game.homeProgramId) || !womenIds.has(game.awayProgramId)) {
      throw new Error('NCAAW official ASUN fixture lacks two separate primary team schedule sources')
    }
    fixtures.set(byDatePair(game), game as NcaaD1Real2026FixtureSource)
  }
  const dated = [...fixtures.values()].sort((a, b) => a.date.localeCompare(b.date)
    || a.homeProgramId.localeCompare(b.homeProgramId) || a.awayProgramId.localeCompare(b.awayProgramId))
  const playedBy = new Set<string>()
  for (const game of dated) {
    if (game.date < '2026-10-01' || game.date > '2027-06-30' ||
        game.homeProgramId === game.awayProgramId) throw new Error('NCAAW game has invalid date or identical teams')
    // Preserve the actual published calendar without inventing same-day game conflicts.
    for (const team of [game.homeProgramId, game.awayProgramId]) {
      const key = game.date + ':' + team
      if (playedBy.has(key)) throw new Error('NCAAW program scheduled twice on same day: ' + key)
      playedBy.add(key)
    }
  }
  const participantIds = new Set(dated.flatMap(g => [g.homeProgramId, g.awayProgramId]))
  return {
    fixtures: dated,
    coverage: {
      sourcedGames: dated.length,
      officialAsunGames: 56,
      otherUnverifiedGames: dated.length - 56,
      distinctProgramsWithGames: participantIds.size,
      womenConferences: 32,
      officialFullSeasonCertification: false,
    },
  }
}

/** Full native NCAA women's school population, with only observable real
 * fixtures. Does not claim tournaments/committee selections are certified. */
export function createNcaaw2026RealWorld(corpus: NcaawSourceCorpus, seed: number, managedProgramId: string):
  NcaaD1Real2026NativeSeed & { readonly calendarCoverage: Ncaaw2026Coverage } {
  const calendar = prepareNcaaw2026RealCalendar(corpus)
  if (calendar.coverage.distinctProgramsWithGames !== 363) {
    throw new Error('NCAAW cannot start a complete sourced 363-program world with absent school games')
  }
  const result = createNcaaD1Real2026WorldSeed({
    gender: 'women', seed, managedProgramId, sourcedFixtures: calendar.fixtures,
  })
  return { ...result, calendarCoverage: calendar.coverage }
}
