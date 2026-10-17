import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'
import { createPersonality } from '@/domain/personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from '@/domain/personality/SemanticPersonality'
import { applyPersonalityExperienceToWorld } from './PersonalityExperienceEvents'
import { applyMoraleEventToWorld } from './MoraleEvents'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

describe('PERSON50 verified experience journal', () => {
  const setup = () => {
    const base = createGameWorld(createValidGameWorldInput())
    const personId = base.userCoachId
    const personality = createPersonality({
      values: Object.fromEntries(SEMANTIC_PERSONALITY_DIMENSIONS.map(key => [key, 50])) as never,
    })
    return { world: updateGameWorld(base, {
      personalitiesByPersonId: { ...base.personalitiesByPersonId, [personId]: personality },
    }), personId }
  }
  it('changes only an observed dimension and persists its evidence through Save V4', () => {
    const { world, personId } = setup()
    const evidence = {
      id: 'observed:coach:praise:1', personId, kind: 'COACH_PRAISE', occurredOn: '2026-07-01',
      dimension: 'recognitionNeed', valence: 1 as const, intensity: 80,
    }
    const onDate = updateGameWorld(world, { currentDate: '2026-07-01' as typeof world.currentDate })
    const changed = applyPersonalityExperienceToWorld(onDate, evidence)
    expect(changed.personalitiesByPersonId[personId]!.values.recognitionNeed).toBe(52)
    expect(changed.personalityExperienceHistory).toHaveLength(1)
    expect(applyPersonalityExperienceToWorld(changed, evidence)).toBe(changed)
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(changed, '2026-07-01T12:00:00.000Z'))
    expect(reloaded.personalityExperienceHistory).toEqual(changed.personalityExperienceHistory)
    expect(reloaded.personalitiesByPersonId[personId]!.values.recognitionNeed).toBe(52)
    expect(reloaded.personalitiesByPersonId[personId]!.values.ambition).toBe(50)
  })
  it('uses an observed morale event as evidence only when explicitly annotated', () => {
    const { world, personId } = setup()
    const onDate = updateGameWorld(world, { currentDate: '2026-07-01' as typeof world.currentDate })
    const first = applyMoraleEventToWorld(onDate, {
      id: 'verified:team:1', personId, source: 'teamEvent', gameDate: onDate.currentDate,
      delta: 80, context: { observedPersonalityKind: 'TEAMMATE_SUPPORT', observedPersonalityDimension: 'empathy' },
    })
    expect(first.personalitiesByPersonId[personId]!.values.empathy).toBe(52)
    expect(first.personalityExperienceHistory).toHaveLength(1)
    const duplicate = applyMoraleEventToWorld(first, {
      id: 'verified:team:1', personId, source: 'teamEvent', gameDate: onDate.currentDate,
      delta: 80, context: { observedPersonalityKind: 'TEAMMATE_SUPPORT', observedPersonalityDimension: 'empathy' },
    })
    expect(duplicate).toBe(first)
    const legacy = applyMoraleEventToWorld(onDate, {
      id: 'legacy:team:2', personId, source: 'teamEvent', gameDate: onDate.currentDate, delta: 20, context: {},
    })
    expect(legacy.personalityExperienceHistory).toHaveLength(0)
    expect(legacy.personalitiesByPersonId[personId]!.values.empathy).toBe(50)
  })
  it('does not evolve from time alone, rejects unknown person and future evidence', () => {
    const { world, personId } = setup()
    expect(world.personalityExperienceHistory).toHaveLength(0)
    expect(world.personalitiesByPersonId[personId]!.values.recognitionNeed).toBe(50)
    expect(() => applyPersonalityExperienceToWorld(world, {
      id: 'future:event', personId, kind: 'COACH_PRAISE', occurredOn: '2999-01-01',
      dimension: 'recognitionNeed', valence: 1, intensity: 50,
    })).toThrow('after GameWorld date')
    expect(() => applyPersonalityExperienceToWorld(world, {
      id: 'other:event', personId: 'unknown-person', kind: 'COACH_PRAISE',
      occurredOn: '2020-01-01', dimension: 'recognitionNeed', valence: -1, intensity: 50,
    })).toThrow('Unknown PERSON')
  })
})
