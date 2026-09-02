import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * Wave 5C — Organizational Culture.
 *
 * World Database alignment: ORGANIZATION is the eventual owner of Culture. The runtime does not yet
 * have a canonical Organization aggregate, so a `StaffCultureState` is keyed by an opaque
 * `scopeKey` string which — for this wave only — is exactly the `TeamId` of the employing Team.
 * This mirrors the Team-as-Organization-proxy adapter documented on `StaffHumanContext`
 * (`@/domain/staffHumanState`): a temporary resolution adapter, never a `Team === Organization`
 * assumption baked into the engine. A future World Database bootstrap can re-point `scopeKey`
 * resolution at a real Organization id without touching the Culture progression pipeline.
 *
 * Culture is NOT a second Personality block and NOT a second Human State block. The 14 dimensions
 * below are ORGANIZATION-level norms ("how this organization works"), a different semantic layer
 * from the 8 PERSON-level `PERSONALITY_DIMENSIONS` ("who this person is"), the 11 PERSON-in-a-job
 * `STAFF_HUMAN_STATE_DIMENSIONS` ("how this person is doing"), and the 8 dyadic
 * `RELATIONSHIP_DIMENSION_KEYS` ("how these two people work together"). Some dimension NAMES are
 * intentionally shared with those other vocabularies (e.g. `adaptability`/`competitiveness` also
 * name Personality traits, `collaboration` also names a Relationship facet) because the plain
 * English word is the correct one at both layers — vocabulary uniqueness was never the goal; the
 * canonical 14-name catalog is.
 */

/** 14 canonical Organizational Culture dimensions. Integer 0-100, 50 = neutral/unformed. */
export const STAFF_CULTURE_DIMENSIONS = [
  'autonomy',
  'hierarchy',
  'collaboration',
  'accountability',
  'communicationOpenness',
  'innovation',
  'adaptability',
  'developmentOrientation',
  'analyticsOrientation',
  'performanceIntensity',
  'stability',
  'longTermOrientation',
  'discipline',
  'competitiveness',
] as const
export type StaffCultureDimension = typeof STAFF_CULTURE_DIMENSIONS[number]

export type StaffCultureValues = Readonly<Record<StaffCultureDimension, number>>

export interface StaffCultureState {
  /** Opaque organization scope key. For this wave, exactly the employing `TeamId` — see module doc comment. */
  readonly scopeKey: string
  /** Where the organization's real signals currently point — recomputed each weekly tick, never hand-authored. */
  readonly target: StaffCultureValues
  /** Where the lived culture actually is — moves toward `target` slowly (culture has inertia). */
  readonly current: StaffCultureValues
  readonly lastEvaluatedOn: GameDate
}

/** Self-contained clamp so `staffCulture` never depends on the Human State module's clamp. Integer 0-100, non-finite -> neutral 50. */
export function clampCultureValue(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function clampCultureValues(values: StaffCultureValues): StaffCultureValues {
  const clamped: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) clamped[dimension] = clampCultureValue(values[dimension])
  return clamped
}

/** Neutral, unformed culture — used for an organization with no Staff at all. Never a crash, never NaN. */
export function neutralCultureValues(): StaffCultureValues {
  const neutral: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) neutral[dimension] = 50
  return neutral
}

export function createStaffCultureState(input: StaffCultureState): StaffCultureState {
  return {
    scopeKey: requireNonEmptyString(input.scopeKey, 'Staff culture scope key'),
    target: clampCultureValues(input.target),
    current: clampCultureValues(input.current),
    lastEvaluatedOn: parseGameDate(input.lastEvaluatedOn),
  }
}
