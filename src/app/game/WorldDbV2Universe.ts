import { attachWorldDbCompetitionRuntime, updateGameWorld, type GameWorld } from '@/domain/world'
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

/** Assemble the certified projections once, before the one world clock starts.
 * No IDs are namespaced again: shared PBM identities must agree or creation fails.
 * All subsequent simulation and persistence use the ordinary GameWorld boundaries.
 */
export async function createWorldDbV2UniverseFromSnapshots(
  snapshots: readonly WorldDbV2Snapshot[], teamId: string, userCoachCreation?: UserCoachCreationInput,
): Promise<GameWorld> {
  if (!snapshots.length) throw new Error('Select at least one active competition')
  const first = snapshots[0]!
  const ids = snapshots.map(snapshot => worldDbV2Competition(snapshot.competitions[0]?.entity_id).sourceCompetitionId)
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
  let world = await createWorldDbV2GameFromSnapshot(primary, teamId, userCoachCreation)
  for (const snapshot of snapshots) {
    if (snapshot === primary) continue
    const imported = await createWorldDbV2GameFromSnapshot(snapshot, snapshot.clubs[0]!.entity_id)
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
