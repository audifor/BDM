import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { evolvePersonalityForObservedMoraleEvent } from '@/domain/personality/ObservedPersonalityEvolution'
import { updateGameWorld, type GameWorld } from './GameWorld'

/** Resolve the REAL PERSON's DOB through existing profile links.
 * Never infer birth from an estimated age or a default game date.
 */
function dateOfBirthForProfile(world: GameWorld, profileId: string) {
  const player = world.players[profileId as keyof typeof world.players]
  const staff = world.staffPeopleById[profileId as keyof typeof world.staffPeopleById]
  const coach = world.coaches[profileId as keyof typeof world.coaches]
  const personId = player?.personId ?? staff?.personId ?? coach?.personId
  const root = personId === undefined
    ? undefined
    : world.personsById[personId as keyof typeof world.personsById]
  return root?.dateOfBirth ?? player?.bio.dateOfBirth ?? staff?.identity.dateOfBirth
}

export function applyMoraleEventToWorld(world: GameWorld, event: MoraleEvent): GameWorld {
  const profile = world.moraleByPersonId[event.personId]
  const personality = world.personalitiesByPersonId[event.personId]
  if (!profile || !personality) throw new Error(`Morale person does not exist: ${event.personId}`)
  const updated = applyMoraleEvent(profile, personality, event)
  // MoraleEvent.id is already the canonical evidence/Save V4 deduplication key.
  // Replays must never apply the same experience to personality twice.
  if (updated === profile) return world

  const experience = evolvePersonalityForObservedMoraleEvent(
    personality, event, dateOfBirthForProfile(world, event.personId),
  )
  const moraleWithProvenance = experience.provenance === undefined
    ? updated
    : {
        ...updated,
        events: updated.events.map((item) => item.id === event.id
          ? { ...item, context: { ...item.context, ...experience.provenance } }
          : item),
      }
  return updateGameWorld(world, {
    moraleByPersonId: { ...world.moraleByPersonId, [event.personId]: moraleWithProvenance },
    ...(experience.personality === personality ? {} : {
      personalitiesByPersonId: {
        ...world.personalitiesByPersonId,
        [event.personId]: experience.personality,
      },
    }),
  })
}
