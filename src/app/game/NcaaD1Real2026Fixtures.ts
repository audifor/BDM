import { parseGameDate } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { competitionIdFromString, gameIdFromString } from '@/domain/ids'
import { classifyNcaaGame } from '@/engine/competition/schedule'
import { buildNcaaD1Real2026ConferenceSnapshot, type NcaaD1RealGender } from './NcaaD1Real2026Conferences'

/** Input boundary for source-dated NCAA fixtures; primary and secondary provenance are distinct.
 *
 * One fixture must cite its announcing school/conference. Never invent a
 * game to fill an incomplete schedule. The domain's existing conference
 * classifier determines whether each sourced game counts in standings.
 */
export interface NcaaD1Real2026FixtureSource {
  readonly gender: NcaaD1RealGender
  readonly date: string
  readonly homeProgramId: string
  readonly awayProgramId: string
  /** True only when the cited schedule explicitly identifies a neutral site. */
  readonly neutralSite?: boolean
  readonly sourceUrl: string
  /** Second independent official institution entry for cross-confirmed fixtures. */
  readonly corroboratingSourceUrl?: string
  readonly evidenceKind: 'CONFERENCE_OFFICIAL' | 'SCHOOL_OFFICIAL' | 'NCAA_OFFICIAL' | 'SECONDARY_DIRECTORY'
}

export interface NcaaD1Real2026FixtureProjection {
  readonly games: readonly Game[]
  readonly evidenceByGameId: Readonly<Record<string, { readonly url: string; readonly kind: NcaaD1Real2026FixtureSource['evidenceKind']; readonly corroboratingSourceUrl?: string }>>
}

/** Materializes only documented fixtures in the existing Game canonical model.
 * It intentionally does not assert that the complete conference calendars,
 * tournament qualification or player registrations have been imported.
 */
export function projectNcaaD1Real2026Fixtures(
  gender: NcaaD1RealGender,
  fixtures: readonly NcaaD1Real2026FixtureSource[],
): NcaaD1Real2026FixtureProjection {
  const snapshot = buildNcaaD1Real2026ConferenceSnapshot(gender)
  const known = new Set(snapshot.teams.map(team => String(team.id)))
  const seen = new Set<string>()
  const evidenceByGameId: Record<string, { readonly url: string; readonly kind: NcaaD1Real2026FixtureSource['evidenceKind']; readonly corroboratingSourceUrl?: string }> = {}
  const competitionId = competitionIdFromString('competition:USA:ncaa-d1-' + gender + ':regular-season')
  const games = fixtures.map(fixture => {
    if (fixture.gender !== gender) throw new Error('NCAA fixture gender and program membership must match')
    if (!known.has(fixture.homeProgramId) || !known.has(fixture.awayProgramId)) {
      throw new Error('NCAA fixture has a team outside the actual 2026-27 gender-specific Division I population')
    }
    const date = parseGameDate(fixture.date)
    if (date < '2026-07-01' || date > '2027-06-30') throw new Error('NCAA source fixture belongs to another edition')
    if (fixture.homeProgramId === fixture.awayProgramId) throw new Error('NCAA fixture requires distinct teams')
    let host: string
    try { host = new URL(fixture.sourceUrl).hostname.toLowerCase() } catch { throw new Error('NCAA fixture requires a verifiable official source URL') }
    const secondary = fixture.evidenceKind === 'SECONDARY_DIRECTORY'
    if (secondary) {
      // Never silently promote a third-party listing to officially
      // corroborated evidence or borrow official confirmation status.
      if (host !== 'www.ncaawomensbasketball.com' ||
          !fixture.sourceUrl.startsWith('https://www.ncaawomensbasketball.com/womens-college-basketball/game/')) {
        throw new Error('NCAA third-party fixture must retain its restricted secondary-directory provenance')
      }
    } else if (!fixture.sourceUrl.startsWith('https://') || !(
      host === 'ncaa.org' || host.endsWith('.ncaa.org')
      || host.endsWith('.edu') || host.endsWith('.edu.au')
      || host === 'asunsports.org' || host === 'necsports.com' || host === 'www.bigten.org' || host === 'bigten.org' || host === 'pac-12.com' || host === 'mvc-sports.com' || host === 'www.bigeast.com' || host === 'bigeast.com' || host === 'bigsouthsports.com' || host === 'admin.big12sports.com' || host === 'admin.atlantic10.com' || host === 'theamerican.org'
      || host === 'unfospreys.com'
    )) throw new Error('NCAA fixture source must be an authorized university, conference or NCAA primary source')
    if (secondary && fixture.corroboratingSourceUrl !== undefined) {
      throw new Error('NCAA secondary directory cannot claim independent official corroboration')
    }
    if (fixture.corroboratingSourceUrl !== undefined) {
      if (!fixture.corroboratingSourceUrl.startsWith('https://asunsports.org/schedule.aspx?schedule=') ||
          fixture.corroboratingSourceUrl === fixture.sourceUrl) {
        throw new Error('NCAA corroborating schedule must identify a different official conference team schedule')
      }
    }
    const key = [date, ...[fixture.homeProgramId, fixture.awayProgramId].sort()].join('|')
    if (seen.has(key)) throw new Error('Duplicate NCAA fixture with the same clubs and date')
    seen.add(key)
    const id = gameIdFromString('game:USA:ncaa-d1-' + gender + ':2026-27:' + key)
    const classification = classifyNcaaGame(snapshot.memberships, {
      seasonId: snapshot.seasonId,
      homeTeamId: fixture.homeProgramId as Game['homeTeamId'],
      awayTeamId: fixture.awayProgramId as Game['awayTeamId'],
    })
    const game = createGame({
      id, seasonId: snapshot.seasonId, competitionId,
      homeTeamId: fixture.homeProgramId as Game['homeTeamId'],
      awayTeamId: fixture.awayProgramId as Game['awayTeamId'],
      ...(fixture.neutralSite === undefined ? {} : { neutralSite: fixture.neutralSite }),
      date, status: 'scheduled', result: null, stakes: 'regular',
      classification, competitionStageKey: 'REGULAR_SEASON',
    })
    evidenceByGameId[id] = { url: fixture.sourceUrl, kind: fixture.evidenceKind,
      ...(fixture.corroboratingSourceUrl === undefined ? {} : { corroboratingSourceUrl: fixture.corroboratingSourceUrl }),
    }
    return game
  })
  games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return { games, evidenceByGameId }
}
