import { applyPersonalityExperienceToWorld } from './PersonalityExperienceEvents'
import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { updateGameWorld, type GameWorld } from './GameWorld'

export function applyMoraleEventToWorld(world: GameWorld, event: MoraleEvent): GameWorld {
  const profile = world.moraleByPersonId[event.personId]
  const personality = world.personalitiesByPersonId[event.personId]
  if (!profile || !personality) throw new Error(`Morale person does not exist: ${event.personId}`)
  const updated = applyMoraleEvent(profile, personality, event)
  if (updated === profile) return world
  const withMorale = updateGameWorld(world, { moraleByPersonId: { ...world.moraleByPersonId, [event.personId]: updated } })
  // Explicit evidence contract. Legacy events without these two validated
  // fields NEVER change PERSON personality. No fabricated historical facts.
  const kind = event.context.observedPersonalityKind
  const dimension = event.context.observedPersonalityDimension
  if (typeof kind !== 'string' || typeof dimension !== 'string') return withMorale
  return applyPersonalityExperienceToWorld(withMorale, {
    id: event.id,
    personId: event.personId,
    kind,
    dimension,
    occurredOn: event.gameDate,
    valence: event.delta > 0 ? 1 : -1,
    intensity: Math.max(1, Math.min(100, Math.abs(event.delta))),
  })
}
