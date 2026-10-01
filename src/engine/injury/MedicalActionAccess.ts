import type { PlayerId } from '@/domain/ids'
import type { MedicalActionActor } from '@/domain/injury'
import type { GameWorld } from '@/domain/world'

export function canMedicalActorActForPlayer(world: GameWorld, playerId: PlayerId, actor: MedicalActionActor): boolean {
  const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(playerId))
  if (team === undefined) return false
  return actor.kind === 'USER'
    ? team.coachId === actor.coachId && actor.coachId === world.userCoachId
    : team.id === actor.teamId && team.coachId !== world.userCoachId
}
