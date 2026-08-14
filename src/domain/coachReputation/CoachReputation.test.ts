import { describe, expect, it } from 'vitest';
import {
  applyCoachReputationEvent,
  calculateCoachMatchExpectation,
  calculateMatchReputationImpact,
  COACH_REPUTATION_DIMENSIONS,
  createDefaultCoachReputationProfile,
  evaluateCoachReputationRequirement,
  getCoachReputationBand,
  getCoachSeasonAchievementReputationDeltas,
  getRecentCoachReputationEvents,
} from './CoachReputation';

const event = (id = 'e', gameDate = '2030-01-01') => ({
  id, gameDate, source: 'matchResult' as const, deltas: { competitive: 10 }, context: { kind: 'matchResult' as const, key: 'x' },
});

describe('Coach reputation core', () => {
  it('has four independent default dimensions', () => {
    expect(COACH_REPUTATION_DIMENSIONS).toEqual(['competitive', 'development', 'professional', 'publicStanding']);
    expect(createDefaultCoachReputationProfile()).toEqual({ values: { competitive: 200, development: 200, professional: 200, publicStanding: 200 }, events: [] });
  });

  it('applies, clamps and deduplicates immutable events', () => {
    const profile = createDefaultCoachReputationProfile();
    const result = applyCoachReputationEvent(profile, { ...event(), deltas: { competitive: 10000, professional: -10000 } });
    expect(result).toMatchObject({ ok: true, applied: true });
    if (!result.ok || !result.applied) return;
    expect(result.profile.values).toMatchObject({ competitive: 1000, professional: 0 });
    expect(applyCoachReputationEvent(result.profile, event())).toMatchObject({ applied: false, reason: 'duplicateEvent' });
    expect(profile.events).toEqual([]);
  });

  it('rejects invalid inputs and resolves bands', () => {
    expect(applyCoachReputationEvent(createDefaultCoachReputationProfile(), { ...event(' ') })).toMatchObject({ ok: false, reason: 'invalidEventId' });
    expect(applyCoachReputationEvent(createDefaultCoachReputationProfile(), { ...event(), context: { kind: 'publicEvent', key: 'x' } })).toMatchObject({ ok: false, reason: 'invalidContext' });
    expect(() => calculateCoachMatchExpectation({ coachTeamStrength: NaN, opponentTeamStrength: 50, coachIsHome: true })).toThrow(RangeError);
    expect(() => evaluateCoachReputationRequirement(createDefaultCoachReputationProfile(), { minimum: { competitive: 1001 } })).toThrow(RangeError);
    expect(getCoachReputationBand(0)).toBe('unknown');
    expect(getCoachReputationBand(100)).toBe('emerging');
    expect(getCoachReputationBand(900)).toBe('legendary');
  });
});

describe('Coach reputation calculations', () => {
  it('calculates home, away and bounded match expectations', () => {
    expect(calculateCoachMatchExpectation({ coachTeamStrength: 50, opponentTeamStrength: 50, coachIsHome: true })).toBe(0.55);
    expect(calculateCoachMatchExpectation({ coachTeamStrength: 50, opponentTeamStrength: 50, coachIsHome: false })).toBe(0.45);
    expect(calculateCoachMatchExpectation({ coachTeamStrength: 100, opponentTeamStrength: 0, coachIsHome: true })).toBe(0.85);
    expect(calculateCoachMatchExpectation({ coachTeamStrength: 0, opponentTeamStrength: 100, coachIsHome: false })).toBe(0.15);
  });

  it('calculates match impact solely from result surprise', () => {
    expect(calculateMatchReputationImpact(0.5, 'win')).toEqual({ surprise: 0.5, deltas: { competitive: 6, publicStanding: 2 } });
    expect(calculateMatchReputationImpact(0.5, 'loss')).toEqual({ surprise: -0.5, deltas: { competitive: -6, publicStanding: -2 } });
    expect(calculateMatchReputationImpact(0.2, 'win')).toEqual({ surprise: 0.8, deltas: { competitive: 10, publicStanding: 3 } });
    expect(calculateMatchReputationImpact(0.8, 'loss')).toEqual({ surprise: -0.8, deltas: { competitive: -10, publicStanding: -3 } });
    expect(calculateMatchReputationImpact(0.2, 'win').deltas.competitive).toBeGreaterThan(calculateMatchReputationImpact(0.8, 'win').deltas.competitive);
    expect(Math.abs(calculateMatchReputationImpact(0.8, 'loss').deltas.competitive)).toBeGreaterThan(Math.abs(calculateMatchReputationImpact(0.2, 'loss').deltas.competitive));
  });

  it('defines the champion achievement only', () => {
    expect(getCoachSeasonAchievementReputationDeltas('champion')).toEqual({ competitive: 40, publicStanding: 20 });
  });

  it('evaluates minimum reputation requirements', () => {
    const profile = { ...createDefaultCoachReputationProfile(), values: { competitive: 390, development: 200, professional: 350, publicStanding: 200 } };
    expect(evaluateCoachReputationRequirement(profile, { minimum: { competitive: 400, professional: 300 } })).toEqual({ eligible: false, unmet: [{ dimension: 'competitive', required: 400, actual: 390 }] });
    expect(evaluateCoachReputationRequirement(profile, { minimum: { competitive: 390, professional: 350 } })).toEqual({ eligible: true, unmet: [] });
    expect(evaluateCoachReputationRequirement(profile, {})).toEqual({ eligible: true, unmet: [] });
  });

  it('returns immutable recent events by date, then ascending id, respecting limits', () => {
    const profile = { ...createDefaultCoachReputationProfile(), events: [event('b', '2030-01-02'), event('z', '2030-01-03'), event('a', '2030-01-02')] };
    expect(getRecentCoachReputationEvents(profile, 0)).toEqual([]);
    expect(getRecentCoachReputationEvents(profile, 1).map(({ id }) => id)).toEqual(['z']);
    expect(getRecentCoachReputationEvents(profile, 10).map(({ id }) => id)).toEqual(['z', 'a', 'b']);
    expect(profile.events.map(({ id }) => id)).toEqual(['b', 'z', 'a']);
  });
});
