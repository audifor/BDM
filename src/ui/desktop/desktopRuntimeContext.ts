import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

export interface DesktopRuntimeContext {
  readonly coachName?: string
  readonly coachInitials?: string
  readonly controlledTeamName?: string
}

/** Desktop identity is derived from the active career, never from UI literals. */
export function resolveDesktopRuntimeContext(world: GameWorld): DesktopRuntimeContext {
  const coach = world.coaches[world.userCoachId]
  const team = getUserTeam(world)

  return {
    ...(coach === undefined
      ? {}
      : {
          coachName: `${coach.firstName} ${coach.lastName}`,
          coachInitials: `${coach.firstName[0] ?? ''}${coach.lastName[0] ?? ''}`.toUpperCase(),
        }),
    ...(team === undefined ? {} : { controlledTeamName: team.name }),
  }
}
