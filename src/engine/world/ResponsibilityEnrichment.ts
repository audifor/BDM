import { responsibilityIdForTeam, RESPONSIBILITY_KINDS, responsibilityDefinition } from '@/domain/responsibility'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * Backfills one Responsibility row per (team, RESPONSIBILITY_KIND) pair at its `defaultMode`
 * ('userControlled', vacant) for every team missing it. Pure, idempotent, no-ops when nothing is
 * missing — mirrors `ensureStaffStructure`. A no-op change in observable game behavior: nothing
 * consumes `responsibilitiesById` yet in Wave 1.
 */
export function ensureResponsibilityStructure(world: GameWorld): GameWorld {
  const additions = Object.values(world.teams).flatMap((team) =>
    RESPONSIBILITY_KINDS.filter((kind) => world.responsibilitiesById[responsibilityIdForTeam(team.id, kind)] === undefined).map((kind) => ({
      id: responsibilityIdForTeam(team.id, kind),
      teamId: team.id,
      kind,
      mode: responsibilityDefinition(kind).defaultMode,
    })),
  )
  if (!additions.length) return world
  return updateGameWorld(world, { responsibilities: [...Object.values(world.responsibilitiesById), ...additions] })
}
