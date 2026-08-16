import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { updateGameWorld, type GameWorld } from './GameWorld'

export function applyMoraleEventToWorld(world: GameWorld, event: MoraleEvent): GameWorld {
  const profile = world.moraleByPersonId[event.personId]
  const personality = world.personalitiesByPersonId[event.personId]
  if (!profile || !personality) throw new Error(`Morale person does not exist: ${event.personId}`)
  const updated = applyMoraleEvent(profile, personality, event)
  if (updated === profile) return world
  return updateGameWorld(world, { moraleByPersonId: { ...world.moraleByPersonId, [event.personId]: updated } })
}
