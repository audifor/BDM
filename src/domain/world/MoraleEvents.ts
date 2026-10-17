import { evolvePersonalityFromMoraleEvidence } from '@/domain/personality/ObservedPersonalityEvolution'
import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { updateGameWorld, type GameWorld } from './GameWorld'

/** A real, recorded BDM interaction may evolve PERSON personality if explicitly
 * annotated with a canonical observed event kind. Ordinary legacy events do not.
 * Atomic world update includes morale, personality and an append-only journal.
 */
export function applyMoraleEventToWorld(world: GameWorld, event: MoraleEvent): GameWorld {
  const profile = world.moraleByPersonId[event.personId]
  const personality = world.personalitiesByPersonId[event.personId]
  if (!profile || !personality) throw new Error(`Morale person does not exist: ${event.personId}`)
  const updated = applyMoraleEvent(profile, personality, event)
  if (updated === profile) return world
  if (event.context.personalityEventKind === undefined) {
    return updateGameWorld(world, { moraleByPersonId: { ...world.moraleByPersonId, [event.personId]: updated } })
  }
  if (event.gameDate > world.currentDate) throw new RangeError('Observed personality evidence cannot occur after current game date')
  const profilePersonId = world.players[event.personId]?.personId
    ?? world.staffPeopleById[event.personId]?.personId
    ?? world.coaches[event.personId]?.personId
  const born = (profilePersonId === undefined ? undefined : world.personsById[profilePersonId]?.dateOfBirth)
    ?? world.players[event.personId]?.bio.dateOfBirth
    ?? world.staffPeopleById[event.personId]?.identity.dateOfBirth
  const history = world.personalityHistoryByPersonId[event.personId] ?? []
  const evolved = evolvePersonalityFromMoraleEvidence(personality, event.personId, born, history, event)
  if (evolved.personality === personality && evolved.history === history) {
    return updateGameWorld(world, { moraleByPersonId: { ...world.moraleByPersonId, [event.personId]: updated } })
  }
  return updateGameWorld(world, {
    moraleByPersonId: { ...world.moraleByPersonId, [event.personId]: updated },
    personalitiesByPersonId: { ...world.personalitiesByPersonId, [event.personId]: evolved.personality },
    personalityHistoryByPersonId: { ...world.personalityHistoryByPersonId, [event.personId]: evolved.history },
  })
}
