import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addYears, type GameDate } from '@/domain/date'
import { createPersonality, generatePersonality } from '@/domain/personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from '@/domain/personality/SemanticPersonality'
import { OBSERVED_PERSONALITY_RULES, evolvePersonalityFromMoraleEvidence, validatePersonalityJournal } from '@/domain/personality/ObservedPersonalityEvolution'
import { applyMoraleEventToWorld, updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const make50 = () => createPersonality({ values: Object.fromEntries(
  SEMANTIC_PERSONALITY_DIMENSIONS.map((key) => [key, 50]),
) as never })
const event = (personId: string, date: GameDate, id: string, kind = 'COACH_PRAISE', delta = 67) => ({
  id, personId, gameDate: date, source: 'professionalInteraction' as const,
  delta, context: { personalityEventKind: kind },
})

describe('PERSON 23I real event journal through BDM', () => {
  it('matches the 76-kind PERSON 23K dictionary without dropping professional or advisory facts', () => {
    expect(OBSERVED_PERSONALITY_RULES).toHaveLength(76)
    expect(new Set(OBSERVED_PERSONALITY_RULES.map((entry) => entry.kind)).size).toBe(76)
    expect(new Set(OBSERVED_PERSONALITY_RULES.map((entry) => entry.code)).size).toBe(76)
    expect(OBSERVED_PERSONALITY_RULES.map((entry) => String(entry.kind))).not.toContain('TEAM_SCOUTING_REPORT')
    expect(OBSERVED_PERSONALITY_RULES.find((entry) => entry.kind === 'PROFESSIONAL_REVIEW'))
      .toMatchObject({ dimension: 'conscientiousness', minAge: 18, sources: ['professionalInteraction'] })
    expect(OBSERVED_PERSONALITY_RULES.find((entry) => entry.kind === 'RECOMMENDATION_ACCEPTED'))
      .toMatchObject({ dimension: 'recognitionNeed', minAge: 18 })
    expect(OBSERVED_PERSONALITY_RULES.find((entry) => entry.kind === 'RECOMMENDATION_REJECTED'))
      .toMatchObject({ dimension: 'frustrationTolerance', minAge: 18 })
  })

  it('rejects a source outside the canonical event family without changing personality', () => {
    const personality = make50()
    const mismatch = { ...event('person:test', '2026-10-01' as GameDate, 'event:bad-source', 'NEW_CONTRACT_SIGNED'), source: 'matchResult' as const }
    expect(() => evolvePersonalityFromMoraleEvidence(personality, 'person:test', '1990-01-01', [], mismatch))
      .toThrow('cannot come from')
    expect(personality.values.contractualCommitment).toBe(50)
  })

  it('changes exactly one score only when an observed event has been committed', () => {
    const base = createNewGame()
    const player = Object.values(base.players)[0]!
    const world = updateGameWorld(base, { personalitiesByPersonId: {
      ...base.personalitiesByPersonId, [player.id]: make50(),
    } })
    expect(Object.keys(world.personalityHistoryByPersonId)).toHaveLength(0)
    const applied = applyMoraleEventToWorld(world, event(player.id, world.currentDate, 'real:coach:praise:1'))
    expect(applied.moraleByPersonId[player.id]!.events).toHaveLength(1)
    const history = applied.personalityHistoryByPersonId[player.id]!
    expect(history).toHaveLength(1)
    expect(history[0]!.sourceEventId).toBe('real:coach:praise:1')
    expect(history[0]!.dimensionCode).toBe('recognitionNeed')
    expect(history[0]!.previousValue).toBe(50)
    expect(history[0]!.newValue).toBe(52)
    expect(applied.personalitiesByPersonId[player.id]!.values.recognitionNeed).toBe(52)
    expect(applied.personalitiesByPersonId[player.id]!.values.loyalty).toBe(50)
    expect(applyMoraleEventToWorld(applied, event(player.id, world.currentDate, 'real:coach:praise:1'))).toBe(applied)
    expect(world.personalitiesByPersonId[player.id]!.values.recognitionNeed).toBe(50)
  })

  it('survives V4 roundtrip exactly; old V4 without journal restores empty', () => {
    const base = createNewGame()
    const player = Object.values(base.players)[0]!
    const world = updateGameWorld(base, { personalitiesByPersonId: {
      ...base.personalitiesByPersonId, [player.id]: make50(),
    } })
    const applied = applyMoraleEventToWorld(world, event(player.id, world.currentDate, 'game:praise:2'))
    const save = serializeGameWorldV4(applied, '2032-10-01T00:00:00.000Z')
    expect(save.payload.personalityHistory).toHaveLength(1)
    const loaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(save)))
    expect(loaded.personalityHistoryByPersonId[player.id]).toEqual(applied.personalityHistoryByPersonId[player.id])
    expect(loaded.personalitiesByPersonId[player.id]).toEqual(applied.personalitiesByPersonId[player.id])
    expect(applyMoraleEventToWorld(loaded, event(player.id, world.currentDate, 'game:praise:2'))).toBe(loaded)
    const { personalityHistory: _priorJournal, ...legacyPayload } = save.payload
    expect(deserializeGameWorldV4({ ...save, payload: legacyPayload }).personalityHistoryByPersonId).toEqual({})
  })

  it('rejects tampered journals that lack an actual source, duplicate an ID, or change a score', () => {
    const base = createNewGame()
    const player = Object.values(base.players)[0]!
    const world = updateGameWorld(base, { personalitiesByPersonId: {
      ...base.personalitiesByPersonId, [player.id]: make50(),
    } })
    const applied = applyMoraleEventToWorld(world, event(player.id, world.currentDate, 'evidence:3'))
    const save = serializeGameWorldV4(applied, '2032-10-01T00:00:00.000Z')
    const record = save.payload.personalityHistory![0]!
    const saveWith = (history: unknown) => ({ ...save, payload: { ...save.payload, personalityHistory: history } })
    expect(() => deserializeGameWorldV4(saveWith([{ ...record, sourceEventId: 'made-up' }]))).toThrow('committed')
    expect(() => deserializeGameWorldV4(saveWith([{ ...record, newValue: 96 }]))).toThrow()
    expect(() => deserializeGameWorldV4(saveWith([record, record]))).toThrow()
  })

  it('does not change legacy profiles or untagged morale events', () => {
    const world = createNewGame()
    const player = Object.values(world.players)[0]!
    const result = applyMoraleEventToWorld(world, {
      id: 'ordinary:1', personId: player.id, source: 'matchResult',
      gameDate: world.currentDate, delta: 10, context: {},
    })
    expect(result.personalitiesByPersonId[player.id]).toEqual(world.personalitiesByPersonId[player.id])
    expect(Object.keys(result.personalityHistoryByPersonId)).toHaveLength(0)
    expect(generatePersonality('legacy').values).toHaveProperty('ambition')
  })

  it('simulates 30 years of verified evidence without duplicate effects', () => {
    const personality = make50()
    const dob = '1990-01-01'
    let state = { personality, history: [] as ReturnType<typeof validatePersonalityJournal> }
    for (let i = 0; i < 30; i++) {
      const date = addYears('2026-07-01' as GameDate, i)
      const proof = event('person:career', date, `recorded-season-event:${i}`)
      state = evolvePersonalityFromMoraleEvidence(state.personality, 'person:career', dob, state.history, proof)
    }
    expect(state.history).toHaveLength(30)
    expect(Object.keys(state.personality.values)).toHaveLength(50)
    expect(state.personality.values.recognitionNeed).toBe(100)
    const repeat = evolvePersonalityFromMoraleEvidence(state.personality, 'person:career', dob, state.history,
      event('person:career', addYears('2026-07-01' as GameDate, 29), 'recorded-season-event:29'))
    expect(repeat).toEqual(state)
    expect(validatePersonalityJournal(state.history, 'person:career', addYears('2026-07-01' as GameDate, 29)))
      .toHaveLength(30)
  })
})
