import programs from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import { createConference, createConferenceMembership, type Conference, type ConferenceMembership } from '@/domain/conference'
import { conferenceIdFromString, ecosystemIdFromString, seasonIdFromString, teamIdFromString, type TeamId } from '@/domain/ids'

export type NcaaD1RealGender = 'men' | 'women'

export interface NcaaD1RealConferenceSeasonSnapshot {
  readonly gender: NcaaD1RealGender
  readonly edition: '2026-27'
  readonly sourceStatus: 'SECONDARY_DIRECTORY_MEMBERSHIP_PENDING_INDIVIDUAL_OFFICIAL_VERIFICATION'
  readonly ecosystemId: ReturnType<typeof ecosystemIdFromString>
  readonly seasonId: ReturnType<typeof seasonIdFromString>
  readonly conferences: readonly Conference[]
  readonly memberships: readonly ConferenceMembership[]
  readonly teams: readonly { id: TeamId; name: string; gender: 'male' | 'female'; conferenceId: Conference['id']; sourceTeamUrl: string }[]
}

/** An edition-scoped projection of the current real-world SCHOOL identities.
 *
 * This creates BDM's existing Conference/ConferenceMembership entities, NOT a
 * synthetic competition or an official game schedule. 32 conferences are
 * grouped by contemporary affiliation; no 353-program historical PBM cohort
 * is ever assigned 2026-27 affiliations.
 *
 * Source directory identities must still be checked against primary member
 * evidence before the 2026-27 NCAA seasons are enabled in NEW GAME.
 */
export function buildNcaaD1Real2026ConferenceSnapshot(gender: NcaaD1RealGender): NcaaD1RealConferenceSeasonSnapshot {
  if (programs.season !== '2026-27') throw new Error('NCAA source catalog belongs to another edition')
  if (programs.status !== 'SECONDARY_DIRECTORY_MEMBERSHIP_PENDING_INDIVIDUAL_OFFICIAL_VERIFICATION') {
    throw new Error('NCAA real-world membership provenance changed without review')
  }
  const cohort = programs.genders[gender]
  const count = gender === 'men' ? 365 : 363
  if (cohort.teams.length !== count || cohort.projectedNCAAPrograms !== count || cohort.conferenceCount !== 32) {
    throw new Error('NCAA Division I 2026-27 gender-specific participation count mismatch')
  }
  const ecosystemId = ecosystemIdFromString('ecosystem:USA:ncaa-d1-' + gender)
  const seasonId = seasonIdFromString('season:USA:ncaa-d1-' + gender + ':2026-27')
  const confNames = new Map<string, string>()
  const teamIds = new Set<string>()
  const teams: NcaaD1RealConferenceSeasonSnapshot['teams'][number][] = []
  const memberships: ConferenceMembership[] = []
  for (const source of cohort.teams) {
    if (!source.id.startsWith('ncaa:2026-27:' + gender + ':')) throw new Error('NCAA program has wrong gender or edition: ' + source.id)
    if (!source.name || !source.conference || !source.conferenceId || !source.sourceTeamUrl.startsWith('https://')) {
      throw new Error('NCAA program is missing an original contemporary source identity')
    }
    if (teamIds.has(source.id)) throw new Error('NCAA program identity occurs twice: ' + source.id)
    teamIds.add(source.id)
    const name = confNames.get(source.conferenceId)
    if (name !== undefined && name !== source.conference) throw new Error('NCAA conference ID has conflicting sourced names: ' + source.conferenceId)
    confNames.set(source.conferenceId, source.conference)
    const conferenceId = conferenceIdFromString('conference:USA:ncaa-d1-' + gender + ':2026-27:' + source.conferenceId)
    const id = teamIdFromString(source.id)
    teams.push({ id, name: source.name, gender: gender === 'men' ? 'male' : 'female', conferenceId, sourceTeamUrl: source.sourceTeamUrl })
    memberships.push(createConferenceMembership({ teamId: id, conferenceId, seasonId }))
  }
  if (confNames.size !== 32) throw new Error('NCAA D1 requires 32 named conferences for the requested gender and edition')
  const conferences = [...confNames].sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, name]) => createConference({
      id: conferenceIdFromString('conference:USA:ncaa-d1-' + gender + ':2026-27:' + slug),
      ecosystemId, name,
    }))
  return {
    gender, edition: '2026-27', sourceStatus: programs.status,
    ecosystemId, seasonId, conferences, memberships, teams,
  }
}
