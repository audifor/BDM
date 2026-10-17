import { applyPersonalityExperience, type PersonalityExperience } from '@/domain/personality/PersonalityExperience'
import { updateGameWorld, type GameWorld } from './GameWorld'

/** Only an explicit fact from gameplay authorizes a personality change. */
export function applyPersonalityExperienceToWorld(world: GameWorld, event: PersonalityExperience): GameWorld {
  if (event.occurredOn > world.currentDate) throw new RangeError('Personality event is after GameWorld date')
  const personality = world.personalitiesByPersonId[event.personId]
  if (personality === undefined) throw new RangeError('Unknown PERSON personality identity')
  const result = applyPersonalityExperience(personality, world.personalityExperienceHistory, event)
  if (result.personality === personality) return world
  return updateGameWorld(world, {
    personalitiesByPersonId: { ...world.personalitiesByPersonId, [event.personId]: result.personality },
    personalityExperienceHistory: result.history,
  })
}
