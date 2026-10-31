import { createGameWorld, type GameWorld } from '@/domain/world'
import type { NcaaD1RealGender } from './NcaaD1Real2026Conferences'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import { createNcaaD1Real2026WorldSeed } from './NcaaD1Real2026WorldSeed'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'
import type { NcaaGeneratedSchedulePolicy } from '@/engine/competition/schedule'
import { ensureNcaaEligibility } from '@/engine/eligibility'
import { ensureNcaaAcademics } from '@/engine/academic'

export interface NcaaD1Real2026UniverseOptions {
  readonly seed: number
  readonly managedGender: NcaaD1RealGender
  readonly managedProgramId: string
  /** Only individually evidenced actual 2026-27 matches, for either category. */
  readonly sourcedFixtures?: readonly NcaaD1Real2026FixtureSource[]
  readonly generatedSchedules?: Readonly<Record<NcaaD1RealGender, NcaaGeneratedSchedulePolicy>>
}
export interface NcaaD1Real2026UniverseResult {
  readonly world: GameWorld
  readonly officialFixtureSourceByGameId: Readonly<Record<string, { readonly url: string; readonly kind: NcaaD1Real2026FixtureSource['evidenceKind'] }>>
  readonly formatCertification: 'BLOCKED_SEASONS_AND_TOURNAMENTS_NOT_CONNECTED'
  readonly membershipCertification: 'PENDING_PRIMARY_VERIFICATION'
}

/**
 * Unifies both real NCAA D1 2026-27 categories in ONE existing native GameWorld.
 * Both seasons coexist, with separate competitions, 64 conferences and
 * year/gender-scoped memberships. The user can manage either a male or a
 * female program while both sets of schools exist in the same sports universe.
 *
 * No random fixtures or round-robin seasons are fabricated. This is a source-
 * based roster and infrastructure bootstrap, NOT sporting certification.
 */
export function createNcaaD1Real2026Universe(options: NcaaD1Real2026UniverseOptions): NcaaD1Real2026UniverseResult {
  if (!Number.isSafeInteger(options.seed)) throw new RangeError('NCAA world requires deterministic integer seed')
  if (options.generatedSchedules !== undefined && (!options.generatedSchedules.men || !options.generatedSchedules.women)) throw new Error('Both NCAA categories require explicit generated schedules')
  const selected = buildNcaaD1Real2026ConferenceSnapshot(options.managedGender)
  if (!selected.teams.some(team => String(team.id) === options.managedProgramId)) {
    throw new Error('NCAA manager must choose an eligible 2026-27 program in their category')
  }

  const seeds = (['men', 'women'] as const).map(gender => {
    const membership = buildNcaaD1Real2026ConferenceSnapshot(gender)
    const team = gender === options.managedGender
      ? options.managedProgramId
      : membership.teams[0]!.id
    return createNcaaD1Real2026WorldSeed({
      gender,
      seed: options.seed,
      managedProgramId: team,
      ...(options.generatedSchedules === undefined
        ? { sourcedFixtures: (options.sourcedFixtures ?? []).filter(fixture => fixture.gender === gender) }
        : { generatedSchedule: options.generatedSchedules[gender], sourcedFixtures: (options.sourcedFixtures ?? []).filter(fixture => fixture.gender === gender) }),
    })
  })
  const [male, female] = seeds
  const worlds = [male!.world, female!.world]
  const all = <T>(read: (world: GameWorld) => readonly T[]): T[] => worlds.flatMap(read)
  const evidence = Object.assign({}, male!.sourceEvidenceByGameId, female!.sourceEvidenceByGameId)
  const countryById = new Map(all(world => Object.values(world.countries)).map(country => [country.id, country]))
  const world = ensureNcaaAcademics(ensureNcaaEligibility(createGameWorld({
    currentDate: male!.world.currentDate,
    currentSeasonId: options.managedGender === 'men' ? male!.world.currentSeasonId : female!.world.currentSeasonId,
    userCoachId: options.managedGender === 'men' ? male!.world.userCoachId : female!.world.userCoachId,
    countries: [...countryById.values()],
    coaches: all(w => Object.values(w.coaches)),
    players: all(w => Object.values(w.players)),
    teams: all(w => Object.values(w.teams)),
    competitions: all(w => Object.values(w.competitions)),
    ecosystems: all(w => Object.values(w.ecosystems)),
    conferences: all(w => Object.values(w.conferencesById)),
    conferenceMemberships: all(w => w.conferenceMemberships),
    seasons: all(w => Object.values(w.seasons)),
    games: all(w => Object.values(w.games)),
    staffPeople: all(w => Object.values(w.staffPeopleById)),
    teamStaffAssignments: all(w => Object.values(w.teamStaffAssignmentsById)),
    staffEmploymentByStaffId: Object.assign({}, male!.world.staffEmploymentByStaffId, female!.world.staffEmploymentByStaffId),
  })))
  if (Object.keys(world.teams).length !== 728 || Object.keys(world.conferencesById).length !== 64 ||
      world.conferenceMemberships.length !== 728 || Object.keys(world.seasons).length !== 2) {
    throw new Error('Real 2026-27 NCAA universe lost male/female teams, conferences or seasons')
  }
  return {
    world,
    officialFixtureSourceByGameId: evidence,
    formatCertification: 'BLOCKED_SEASONS_AND_TOURNAMENTS_NOT_CONNECTED',
    membershipCertification: 'PENDING_PRIMARY_VERIFICATION',
  }
}
