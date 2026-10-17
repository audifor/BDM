import { createInitialCoachRpgProfile } from '@/domain/coachRpg'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/** Repair only missing user RPG state. Never overwrite XP, skill ranks, perks or progression. */
export function ensureUserCoachRpgProfile(world: GameWorld): GameWorld {
  if (world.coaches[world.userCoachId] === undefined || world.coachRpgProfilesByCoachId[world.userCoachId] !== undefined) return world
  return updateGameWorld(world, {
    coachRpgProfilesByCoachId: {
      ...world.coachRpgProfilesByCoachId,
      [world.userCoachId]: createInitialCoachRpgProfile(),
    },
  })
}
