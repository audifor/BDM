export const COACH_REPUTATION_DIMENSIONS = [
  'competitive',
  'development',
  'professional',
  'publicStanding',
] as const;

export type CoachReputationDimension = typeof COACH_REPUTATION_DIMENSIONS[number];

export const COACH_REPUTATION_MIN = 0;
export const COACH_REPUTATION_MAX = 1000;
export const COACH_REPUTATION_DEFAULT = 200;
export const TEAM_STRENGTH_EXPECTATION_DIVISOR = 100;
export const COACH_HOME_EXPECTATION_ADJUSTMENT = 0.05;
export const COACH_EXPECTATION_MIN = 0.15;
export const COACH_EXPECTATION_MAX = 0.85;

export type CoachReputationSource =
  | 'matchResult'
  | 'seasonAchievement'
  | 'professionalEvent'
  | 'developmentEvent'
  | 'publicEvent';
export type CoachReputationContext = { readonly kind: CoachReputationSource; readonly key: string };
export interface CoachReputationEvent {
  readonly id: string;
  readonly gameDate: string;
  readonly source: CoachReputationSource;
  readonly deltas: Readonly<Partial<Record<CoachReputationDimension, number>>>;
  readonly context: CoachReputationContext;
}
export interface CoachReputationProfile {
  readonly values: Readonly<Record<CoachReputationDimension, number>>;
  readonly events: readonly CoachReputationEvent[];
}

export type CoachMatchResult = 'win' | 'loss';
export interface CoachMatchExpectationInput {
  readonly coachTeamStrength: number;
  readonly opponentTeamStrength: number;
  readonly coachIsHome: boolean;
}
export interface CoachMatchReputationImpact {
  readonly surprise: number;
  readonly deltas: Readonly<Pick<Record<CoachReputationDimension, number>, 'competitive' | 'publicStanding'>>;
}
export type CoachReputationSeasonAchievement = 'champion';
export interface CoachReputationRequirement {
  readonly minimum?: Readonly<Partial<Record<CoachReputationDimension, number>>>;
}
export interface CoachReputationRequirementFailure {
  readonly dimension: CoachReputationDimension;
  readonly required: number;
  readonly actual: number;
}
export interface CoachReputationRequirementResult {
  readonly eligible: boolean;
  readonly unmet: readonly CoachReputationRequirementFailure[];
}

export function createDefaultCoachReputationProfile(): CoachReputationProfile {
  return { values: { competitive: 200, development: 200, professional: 200, publicStanding: 200 }, events: [] };
}

export function createCoachReputationProfile(profile: CoachReputationProfile): CoachReputationProfile {
  const values = {} as Record<CoachReputationDimension, number>;
  for (const dimension of COACH_REPUTATION_DIMENSIONS) {
    const value = profile.values[dimension];
    if (!Number.isFinite(value) || value < COACH_REPUTATION_MIN || value > COACH_REPUTATION_MAX) {
      throw new RangeError(`Invalid reputation value for ${dimension}`);
    }
    values[dimension] = value;
  }
  const eventIds = new Set<string>();
  const events = profile.events.map((event) => {
    if (!event.id.trim() || eventIds.has(event.id) || event.source !== event.context.kind || !event.context.key.trim()) {
      throw new RangeError('Invalid reputation event');
    }
    eventIds.add(event.id);
    for (const dimension of COACH_REPUTATION_DIMENSIONS) {
      if (event.deltas[dimension] !== undefined) assertFiniteNumber(event.deltas[dimension], `reputation event delta for ${dimension}`);
    }
    return { ...event, deltas: { ...event.deltas }, context: { ...event.context } };
  });
  return { values, events };
}

export function clampCoachReputationValue(value: number): number {
  assertFiniteNumber(value, 'reputation value');
  return Math.max(COACH_REPUTATION_MIN, Math.min(COACH_REPUTATION_MAX, value));
}

export function calculateCoachMatchExpectation({
  coachTeamStrength,
  opponentTeamStrength,
  coachIsHome,
}: CoachMatchExpectationInput): number {
  assertFiniteNumber(coachTeamStrength, 'coach team strength');
  assertFiniteNumber(opponentTeamStrength, 'opponent team strength');
  const rawExpectation = 0.5 + (coachTeamStrength - opponentTeamStrength) / TEAM_STRENGTH_EXPECTATION_DIVISOR;
  const homeAdjustment = coachIsHome ? COACH_HOME_EXPECTATION_ADJUSTMENT : -COACH_HOME_EXPECTATION_ADJUSTMENT;
  return Math.max(COACH_EXPECTATION_MIN, Math.min(COACH_EXPECTATION_MAX, rawExpectation + homeAdjustment));
}

export function calculateMatchReputationImpact(
  expectedWinProbability: number,
  result: CoachMatchResult,
): CoachMatchReputationImpact {
  assertFiniteNumber(expectedWinProbability, 'expected win probability');
  if (expectedWinProbability < 0 || expectedWinProbability > 1) throw new RangeError('Expected win probability must be between 0 and 1');
  const surprise = (result === 'win' ? 1 : 0) - expectedWinProbability;
  return { surprise, deltas: { competitive: Math.round(surprise * 12), publicStanding: Math.round(surprise * 4) } };
}

export function getCoachSeasonAchievementReputationDeltas(
  achievement: CoachReputationSeasonAchievement,
): Readonly<Pick<Record<CoachReputationDimension, number>, 'competitive' | 'publicStanding'>> {
  if (achievement !== 'champion') throw new RangeError('Unknown coach reputation season achievement');
  return { competitive: 40, publicStanding: 20 };
}

export function evaluateCoachReputationRequirement(
  profile: CoachReputationProfile,
  requirement: CoachReputationRequirement,
): CoachReputationRequirementResult {
  const unmet: CoachReputationRequirementFailure[] = [];
  for (const dimension of COACH_REPUTATION_DIMENSIONS) {
    const minimum = requirement.minimum?.[dimension];
    if (minimum === undefined) continue;
    if (!Number.isFinite(minimum) || minimum < COACH_REPUTATION_MIN || minimum > COACH_REPUTATION_MAX) {
      throw new RangeError(`Invalid minimum reputation for ${dimension}`);
    }
    const actual = profile.values[dimension];
    assertFiniteNumber(actual, `actual reputation for ${dimension}`);
    if (actual < minimum) unmet.push({ dimension, required: minimum, actual });
  }
  return { eligible: unmet.length === 0, unmet };
}

export function getRecentCoachReputationEvents(profile: CoachReputationProfile, limit: number): readonly CoachReputationEvent[] {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('Event limit must be a non-negative integer');
  return [...profile.events]
    .sort((left, right) => right.gameDate.localeCompare(left.gameDate) || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function applyCoachReputationEvent(profile: CoachReputationProfile, event: CoachReputationEvent) {
  if (!event.id.trim()) return { ok: false as const, reason: 'invalidEventId' };
  if (event.source !== event.context.kind) return { ok: false as const, reason: 'invalidContext' };
  if (profile.events.some((existingEvent) => existingEvent.id === event.id)) {
    return { ok: true as const, applied: false as const, reason: 'duplicateEvent', profile };
  }
  const values = { ...profile.values };
  for (const dimension of COACH_REPUTATION_DIMENSIONS) {
    const delta = event.deltas[dimension] ?? 0;
    if (!Number.isFinite(delta)) return { ok: false as const, reason: 'invalidDelta' };
    values[dimension] = clampCoachReputationValue(values[dimension] + delta);
  }
  return { ok: true as const, applied: true as const, profile: { values, events: [...profile.events, event] } };
}

export function getCoachReputationBand(value: number) {
  value = clampCoachReputationValue(value);
  return value < 100 ? 'unknown' : value < 200 ? 'emerging' : value < 350 ? 'established' : value < 500 ? 'respected' : value < 650 ? 'renowned' : value < 800 ? 'elite' : value < 900 ? 'iconic' : 'legendary';
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`Invalid ${name}`);
}
