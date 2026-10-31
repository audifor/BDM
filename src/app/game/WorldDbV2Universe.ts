import { attachWorldDbCompetitionRuntime, updateGameWorld, type GameWorld } from '@/domain/world'
import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { buildWorldDbV2, type WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import type { UserCoachCreationInput } from './UserCoachCreator'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import { worldDbV2Competition } from './WorldDbV2Competitions'

export async function createWorldDbV2Universe(sourceRoot: string, startDate: string, seed: string, teamId: string, competitionIds: readonly string[], userCoachCreation?: UserCoachCreationInput): Promise<GameWorld> {
  if (!competitionIds.length || new Set(competitionIds).size !== competitionIds.length) throw new Error('Select distinct active competitions')
  competitionIds.forEach(id => worldDbV2Competition(id))
  const snapshots: WorldDbV2Snapshot[] = []
  for (const id of competitionIds) snapshots.push(await buildWorldDbV2(sourceRoot, startDate, seed, id))
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
    const merged: Record<string, unknown> = { ...world }
    for (const [key, value] of Object.entries(imported)) {
      if (['schemaVersion', 'currentDate', 'currentSeasonId', 'userCoachId', 'worldDbCompetitionRuntime'].includes(key)) continue
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
    const runtime = world.worldDbCompetitionRuntime!
    world = attachWorldDbCompetitionRuntime(updateGameWorld(merged as unknown as GameWorld, {}), {
      ...runtime,
      competitionSeasonIds: [...runtime.competitionSeasonIds, ...imported.worldDbCompetitionRuntime!.competitionSeasonIds],
    })
  }
  return attachWorldDbCompetitionRuntime(world, {
    ...world.worldDbCompetitionRuntime!,
    worldDbV2: { ...world.worldDbCompetitionRuntime!.worldDbV2!, activeCompetitionIds: ids },
  })
}
