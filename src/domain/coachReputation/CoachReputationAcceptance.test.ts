import { describe, expect, it } from 'vitest'

import {
  applyCoachReputationEvent,
  calculateMatchReputationImpact,
  COACH_REPUTATION_DIMENSIONS,
  createDefaultCoachReputationProfile,
  evaluateCoachReputationRequirement,
  getCoachReputationBand,
  getRecentCoachReputationEvents,
  type CoachReputationEvent,
  type CoachReputationSource,
} from './CoachReputation'

function event(id: string, source: CoachReputationSource = 'matchResult', deltas: CoachReputationEvent['deltas'] = { competitive: 1 }): CoachReputationEvent {
  return { id, gameDate: '2032-10-01', source, deltas, context: { kind: source, key: id } }
}

describe('Coach reputation final acceptance', () => {
  it('keeps every dimension independent across positive, negative, zero and multi-dimension deltas', () => {
    const base = createDefaultCoachReputationProfile()
    const positive = applyCoachReputationEvent(base, event('positive', 'matchResult', { competitive: 5 }))
    const negative = applyCoachReputationEvent(positive.ok ? positive.profile : base, event('negative', 'publicEvent', { publicStanding: -4 }))
    const zero = applyCoachReputationEvent(negative.ok ? negative.profile : base, event('zero', 'developmentEvent', { development: 0 }))
    const multi = applyCoachReputationEvent(zero.ok ? zero.profile : base, event('multi', 'professionalEvent', { development: 2, professional: 3 }))

    expect(multi).toMatchObject({ ok: true, applied: true, profile: { values: { competitive: 205, development: 202, professional: 203, publicStanding: 196 } } })
    expect(base).toEqual({ values: { competitive: 200, development: 200, professional: 200, publicStanding: 200 }, events: [] })
    expect(COACH_REPUTATION_DIMENSIONS).toEqual(['competitive', 'development', 'professional', 'publicStanding'])
  })

  it('clamps repeatedly at both boundaries and rejects all non-finite deltas', () => {
    const high = { ...createDefaultCoachReputationProfile(), values: { competitive: 999, development: 1, professional: 200, publicStanding: 200 } }
    const clamped = applyCoachReputationEvent(high, event('clamp', 'matchResult', { competitive: 10, development: -10 }))
    expect(clamped).toMatchObject({ ok: true, profile: { values: { competitive: 1000, development: 0 } } })
    if (!clamped.ok) return
    expect(applyCoachReputationEvent(clamped.profile, event('clamp-again', 'matchResult', { competitive: 10, development: -10 }))).toMatchObject({ profile: { values: { competitive: 1000, development: 0 } } })
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(applyCoachReputationEvent(createDefaultCoachReputationProfile(), event(`invalid-${invalid}`, 'matchResult', { competitive: invalid }))).toMatchObject({ ok: false, reason: 'invalidDelta' })
  })

  it('stores an immutable event copy, supports every source, and keeps duplicate semantics', () => {
    const original = event('copy', 'matchResult', { competitive: 2 })
    const result = applyCoachReputationEvent(createDefaultCoachReputationProfile(), original)
    expect(result).toMatchObject({ ok: true, applied: true })
    if (!result.ok || !result.applied) return
    ;(original.deltas as { competitive: number }).competitive = 99
    ;(original.context as { key: string }).key = 'changed'
    expect(result.profile.events[0]).toMatchObject({ deltas: { competitive: 2 }, context: { key: 'copy' } })
    expect(applyCoachReputationEvent(result.profile, event('copy', 'matchResult', { competitive: 3 }))).toMatchObject({ applied: false, reason: 'duplicateEvent' })
    expect(applyCoachReputationEvent(result.profile, event('same-content-different-id', 'matchResult', { competitive: 2 }))).toMatchObject({ applied: true })
    for (const source of ['matchResult', 'seasonAchievement', 'professionalEvent', 'developmentEvent', 'publicEvent'] as const) expect(applyCoachReputationEvent(createDefaultCoachReputationProfile(), event(source, source))).toMatchObject({ ok: true, applied: true })
    expect(applyCoachReputationEvent(createDefaultCoachReputationProfile(), { ...event('mismatch'), context: { kind: 'publicEvent', key: 'mismatch' } })).toMatchObject({ ok: false, reason: 'invalidContext' })
    expect(applyCoachReputationEvent(createDefaultCoachReputationProfile(), { ...event('invalid'), source: 'unknown' as CoachReputationSource, context: { kind: 'unknown' as CoachReputationSource, key: 'invalid' } })).toMatchObject({ ok: false, reason: 'invalidContext' })
  })

  it('creates independent default profiles and resolves every band boundary', () => {
    const first = createDefaultCoachReputationProfile()
    const second = createDefaultCoachReputationProfile()
    ;(first.values as { competitive: number }).competitive = 0
    ;(first.events as CoachReputationEvent[]).push(event('mutated'))
    expect(second).toEqual({ values: { competitive: 200, development: 200, professional: 200, publicStanding: 200 }, events: [] })
    for (const [value, band] of [[0, 'unknown'], [99, 'unknown'], [100, 'emerging'], [199, 'emerging'], [200, 'established'], [349, 'established'], [350, 'respected'], [499, 'respected'], [500, 'renowned'], [649, 'renowned'], [650, 'elite'], [799, 'elite'], [800, 'iconic'], [899, 'iconic'], [900, 'legendary'], [1000, 'legendary']] as const) expect(getCoachReputationBand(value)).toBe(band)
    expect(getCoachReputationBand(-1)).toBe('unknown')
    expect(getCoachReputationBand(1001)).toBe('legendary')
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(() => getCoachReputationBand(invalid)).toThrow(RangeError)
  })

  it('fully explains reputation requirements and rejects invalid minima', () => {
    const profile = { ...createDefaultCoachReputationProfile(), values: { competitive: 390, development: 250, professional: 350, publicStanding: 200 } }
    expect(evaluateCoachReputationRequirement(profile, { minimum: { competitive: 400, development: 300, professional: 300 } })).toEqual({ eligible: false, unmet: [{ dimension: 'competitive', required: 400, actual: 390 }, { dimension: 'development', required: 300, actual: 250 }] })
    expect(evaluateCoachReputationRequirement(profile, { minimum: { competitive: 390, development: 250, professional: 350 } })).toEqual({ eligible: true, unmet: [] })
    expect(evaluateCoachReputationRequirement(profile, {})).toEqual({ eligible: true, unmet: [] })
    for (const invalid of [-1, 1001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(() => evaluateCoachReputationRequirement(profile, { minimum: { competitive: invalid } })).toThrow(RangeError)
  })

  it('keeps recent-event sorting and limits immutable', () => {
    const profile = { ...createDefaultCoachReputationProfile(), events: [event('b'), { ...event('z'), gameDate: '2032-10-03' }, { ...event('a'), gameDate: '2032-10-01' }] }
    expect(getRecentCoachReputationEvents(profile, 0)).toEqual([])
    expect(getRecentCoachReputationEvents(profile, 1).map((item) => item.id)).toEqual(['z'])
    expect(getRecentCoachReputationEvents(profile, 2).map((item) => item.id)).toEqual(['z', 'a'])
    expect(getRecentCoachReputationEvents(profile, 10).map((item) => item.id)).toEqual(['z', 'a', 'b'])
    expect(profile.events.map((item) => item.id)).toEqual(['b', 'z', 'a'])
  })

  it('keeps match impacts confined to competitive and public standing', () => {
    expect(calculateMatchReputationImpact(.5, 'win').deltas).toEqual({ competitive: 6, publicStanding: 2 })
    expect(calculateMatchReputationImpact(.8, 'loss').deltas).toEqual({ competitive: -10, publicStanding: -3 })
  })
})
