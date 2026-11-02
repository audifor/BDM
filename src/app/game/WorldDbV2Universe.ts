import { attachWorldDbCompetitionRuntime, updateGameWorld, type GameWorld } from '@/domain/world'
import { createInitialCoachRpgProfile } from '@/domain/coachRpg'
import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { buildWorldDbV2, type WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import type { UserCoachCreationInput } from './UserCoachCreator'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import { worldDbV2Competition } from './WorldDbV2Competitions'
import { bindWorldDbV2SimulatedTiers } from './WorldDbV2TierBindings'
import { createNcaaD1Real2026Universe } from './NcaaD1Real2026Universe'
import { ncaaD1Real2026GameplayPolicy } from './NcaaD1Real2026GeneratedPolicy'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'
import officialNcaa2026 from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'

const WORLD_DB_RUNTIME_KEYS = new Set(['schemaVersion', 'currentDate', 'currentSeasonId', 'userCoachId', 'worldDbCompetitionRuntime'])

const headCoachPreference = (entity: WorldDbV2Snapshot['people'][number]) => Math.max(...['coach', 'assistant_coach', 'offense_coach', 'defense_coach'].map(role => Number(entity.reference_data[`job_preference_${role}`] ?? 0)))
const isHeadCoach = (entity: WorldDbV2Snapshot['people'][number]) => entity.source_table === 'DYN_person'
  && headCoachPreference(entity) > Number(entity.reference_data.job_preference_chairman ?? 0)

/** Appoints each original unemployed WorldDB coach at most once across a composite universe. */
function allocateMissingOriginalHeadCoaches(snapshots: readonly WorldDbV2Snapshot[]): WorldDbV2Snapshot[] {
  const allocated = snapshots.map(snapshot => ({ ...snapshot, people: [...snapshot.people], freeStaff: [...(snapshot.freeStaff ?? [])] }))
  const available = new Map<string, WorldDbV2Snapshot['people'][number]>()
  for (const snapshot of allocated) for (const person of snapshot.freeStaff ?? []) available.set(person.entity_id, person)
  const assigned = new Set<string>()
  for (const snapshot of allocated) {
    for (const club of snapshot.clubs) {
      if (snapshot.people.some(person => person.parent_id === club.entity_id && isHeadCoach(person))) continue
      const candidate = [...available.values()].filter(isHeadCoach).sort((a, b) => a.entity_id.localeCompare(b.entity_id))[0]
      if (candidate === undefined) continue
      available.delete(candidate.entity_id)
      assigned.add(candidate.entity_id)
      snapshot.people.push({ ...candidate, parent_id: club.entity_id })
    }
  }
  if (assigned.size === 0) return allocated
  return allocated.map(snapshot => ({ ...snapshot, freeStaff: (snapshot.freeStaff ?? []).filter(person => !assigned.has(person.entity_id)) }))
}

/** Merges independent source projections before the shared GameWorld clock starts. */
export function mergeGameWorlds(base: GameWorld, supplemental: GameWorld): GameWorld {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(supplemental)) {
    if (WORLD_DB_RUNTIME_KEYS.has(key)) continue
    const current = merged[key]
    if (Array.isArray(value)) {
      merged[key] = [...new Map([...(current as readonly unknown[]), ...value].map(item => [JSON.stringify(item), item])).values()]
    } else if (typeof value === 'object' && value !== null) {
      const collection = { ...(current as object) } as Record<string, unknown>
      for (const [id, entity] of Object.entries(value)) {
        if (id in collection && JSON.stringify(collection[id]) !== JSON.stringify(entity)) throw new Error(`Conflicting WorldDB identity: ${key}/${id}`)
        collection[id] = entity
      }
      merged[key] = collection
    }
  }
  return updateGameWorld(merged as unknown as GameWorld, {})
}

export async function createWorldDbV2Universe(sourceRoot: string, startDate: string, seed: string, teamId: string, competitionIds: readonly string[], userCoachCreation?: UserCoachCreationInput): Promise<GameWorld> {
  if (!competitionIds.length || new Set(competitionIds).size !== competitionIds.length) throw new Error('Select distinct active competitions')
  competitionIds.forEach(id => worldDbV2Competition(id))
  const snapshots: WorldDbV2Snapshot[] = []
  for (const id of competitionIds) snapshots.push(await buildWorldDbV2(sourceRoot, startDate, seed, id, competitionIds))
  return createWorldDbV2UniverseFromSnapshots(snapshots, teamId, userCoachCreation)
}

/** Opt-in candidate path for the private PBM batch. Not a NEW GAME publication.
 * Each source ID must have an explicitly provided, matching configuration and
 * the candidate's runtime format; no fallback to another league's rules.
 */
export interface WorldDbV2CandidateUniverseOptions {
  readonly configurations: readonly (ReturnType<typeof worldDbV2Competition> & { readonly formatProvenance?: string })[]
  readonly runtimeBundle: WorldCompetitionRuntimeBundle
}

/** Assemble the certified projections once, before the one world clock starts.
 * No IDs are namespaced again: shared PBM identities must agree or creation fails.
 * All subsequent simulation and persistence use the ordinary GameWorld boundaries.
 */
export async function createWorldDbV2UniverseFromSnapshots(
  snapshots: readonly WorldDbV2Snapshot[], teamId: string, userCoachCreation?: UserCoachCreationInput,
  candidates?: WorldDbV2CandidateUniverseOptions,
): Promise<GameWorld> {
  if (!snapshots.length) throw new Error('Select at least one active competition')
  snapshots = allocateMissingOriginalHeadCoaches(snapshots)
  const first = snapshots[0]!
  const resolveConfig = (snapshot: WorldDbV2Snapshot) => {
    const sourceId = snapshot.competitions[0]?.entity_id
    if (!candidates) return worldDbV2Competition(sourceId)
    const config = candidates.configurations.find(c => c.sourceCompetitionId === sourceId)
    if (!config) throw new Error('Missing explicit candidate competition configuration: ' + sourceId)
    if (config.formatProvenance === 'GENERATED_SIMULATION'
      && !candidates.runtimeBundle.competitionFormats.some(f =>
        f.competitionSeasonId === config.editionId && f.competitionId === config.nativeCompetitionId)) {
      throw new Error('Generated candidate lacks matching runtime format: ' + sourceId)
    }
    return config
  }
  const ids = snapshots.map(snapshot => resolveConfig(snapshot).sourceCompetitionId)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate active competition')
  for (const snapshot of snapshots) {
    if (snapshot.manifest.master.sha256 !== first.manifest.master.sha256
      || snapshot.manifest.configuration.start_date !== first.manifest.configuration.start_date
      || snapshot.manifest.configuration.seed !== first.manifest.configuration.seed) {
      throw new Error('Active competitions must share master, date and seed')
    }
  }
  const primary = snapshots.find(snapshot => snapshot.clubs.some(club => club.entity_id === teamId))
  if (!primary) throw new Error('Selected club is not in an active competition')
  let world = await createWorldDbV2GameFromSnapshot(
    primary, teamId, userCoachCreation, resolveConfig(primary), candidates?.runtimeBundle,
  )
  for (const snapshot of snapshots) {
    if (snapshot === primary) continue
    const imported = await createWorldDbV2GameFromSnapshot(
      snapshot, snapshot.clubs[0]!.entity_id, undefined, resolveConfig(snapshot), candidates?.runtimeBundle,
    )
    const merged = mergeGameWorlds(world, imported)
    const runtime = world.worldDbCompetitionRuntime!
    world = attachWorldDbCompetitionRuntime(merged, {
      ...runtime,
      competitionSeasonIds: [...runtime.competitionSeasonIds, ...imported.worldDbCompetitionRuntime!.competitionSeasonIds],
    })
  }
  if (snapshots.some(snapshot => { const config = resolveConfig(snapshot); return config.formatProvenance === 'GENERATED_SIMULATION' || config.simulationPolicy === true })) {
    world = bindWorldDbV2SimulatedTiers(world, snapshots, new Map(snapshots.map(snapshot => [snapshot.competitions[0]!.entity_id, resolveConfig(snapshot).nativeCompetitionId])))
  }
  return attachWorldDbCompetitionRuntime(world, {
    ...world.worldDbCompetitionRuntime!,
    worldDbV2: { ...world.worldDbCompetitionRuntime!.worldDbV2!, activeCompetitionIds: ids },
  })
}

/**
 * Adds both real-program NCAA categories to the same GameWorld used by the
 * selected WorldDB competitions. The NCAA source remains the existing
 * category-aware bootstrap; this function only composes its projections.
 */
export async function createWorldDbV2UniverseWithNcaa(
  sourceRoot: string,
  startDate: string,
  seed: string,
  teamId: string,
  competitionIds: readonly string[],
  userCoachCreation?: UserCoachCreationInput,
  ncaaSeed = 202627,
): Promise<GameWorld> {
  if (new Set(competitionIds).size !== competitionIds.length) throw new Error('Select distinct active competitions')
  const womenTeam = teamId.includes(':women:')
  const gender = womenTeam ? 'women' : 'men'
  const genderSnapshot = buildNcaaD1Real2026ConferenceSnapshot(gender)
  const managedProgramId = genderSnapshot.teams.some(team => String(team.id) === teamId)
    ? teamId
    : String(buildNcaaD1Real2026ConferenceSnapshot('men').teams[0]!.id)
  const ncaaBase = createNcaaD1Real2026Universe({
    seed: ncaaSeed,
    managedGender: gender,
    managedProgramId,
    sourcedFixtures: officialNcaa2026.fixtures as readonly NcaaD1Real2026FixtureSource[],
    generatedSchedules: { men: ncaaD1Real2026GameplayPolicy('men', ncaaSeed), women: ncaaD1Real2026GameplayPolicy('women', ncaaSeed) },
  }).world
  const ncaa = updateGameWorld(ncaaBase, { coachRpgProfilesByCoachId: {
    ...ncaaBase.coachRpgProfilesByCoachId,
    [ncaaBase.userCoachId]: ncaaBase.coachRpgProfilesByCoachId[ncaaBase.userCoachId] ?? createInitialCoachRpgProfile(),
  } })
  if (competitionIds.length === 0) {
    if (!teamId.startsWith('ncaa:')) throw new Error('A WorldDB competition or an NCAA program is required')
    return ncaa
  }
  const snapshots: WorldDbV2Snapshot[] = []
  for (const id of competitionIds) snapshots.push(await buildWorldDbV2(sourceRoot, startDate, seed, id, competitionIds))
  const pbmTeamId = snapshots.find(snapshot => snapshot.clubs.some(club => club.entity_id === teamId))?.clubs.find(club => club.entity_id === teamId)?.entity_id
    ?? snapshots[0]!.clubs[0]!.entity_id
  const pbm = await createWorldDbV2UniverseFromSnapshots(snapshots, pbmTeamId, teamId.startsWith('ncaa:') ? undefined : userCoachCreation)
  const world = teamId.startsWith('ncaa:') ? mergeGameWorlds(ncaa, pbm) : mergeGameWorlds(pbm, ncaa)
  const runtime = pbm.worldDbCompetitionRuntime
  if (runtime?.worldDbV2 === undefined) return world
  return attachWorldDbCompetitionRuntime(world, {
    ...runtime,
    worldDbV2: { ...runtime.worldDbV2, activeCompetitionIds: competitionIds },
  })
}
