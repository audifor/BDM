import type { Player } from '@/domain/player'
import { TRAINING_CATALOG, isPositionEligible, type TrainingDefinition, type TrainingIntensity } from '@/domain/training'
import type { StaffPerson, StaffProfessionalAttributeKey } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

/**
 * Bounded deterministic heuristics that translate a delegated Staff decision into an effective
 * Training choice, per docs/STAFF_SYSTEM_V2.md §14.2: "the plan content itself... is still chosen
 * deterministically by a bounded heuristic reading the holder's attributes, not invented
 * free-form." Every candidate comes from the existing `TRAINING_CATALOG`/`TrainingIntensity`
 * model — nothing here invents a module, rating, or intensity level outside it.
 *
 * Quality bounds variance in two places:
 * - definition/intensity SELECTION: higher `qualityScore` narrows the candidate pool toward the
 *   single best-scoring option; lower quality widens it to a seeded pick among several reasonable
 *   options (see `seededPickFromTop`);
 * - development STIMULUS magnitude once a definition is chosen: higher quality narrows the
 *   multiplier band toward 1.0; lower quality widens it, always within a hard-clamped range (see
 *   `delegatedStimulusMultiplier`).
 * Neither ever lets a poor decision be arbitrarily bad — the candidate pool is always pre-filtered
 * to definitions that are actually applicable, and the stimulus multiplier is always clamped.
 */

/** Attribute weights used to score a TrainingDefinition's category fit for a coaching-family Staff member. Bounded, centralized — not a duplicate of STAFF_ROLE_REGISTRY, this scores content choice, not role proficiency. */
const CATEGORY_ATTRIBUTE_WEIGHTS: Readonly<Record<TrainingDefinition['category'], Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>>> = {
  shooting: { playerDevelopment: 0.6, coaching: 0.4 },
  finishing: { playerDevelopment: 0.6, coaching: 0.4 },
  ballHandling: { playerDevelopment: 0.6, coaching: 0.4 },
  playmaking: { playerDevelopment: 0.5, tacticalKnowledge: 0.5 },
  defense: { tacticalKnowledge: 0.5, coaching: 0.5 },
  rebounding: { coaching: 0.5, discipline: 0.5 },
  physical: { discipline: 0.6, motivation: 0.4 },
  recovery: { discipline: 0.5, communication: 0.5 },
  tactical: { tacticalKnowledge: 0.7, leadership: 0.3 },
}

/** How many top-ranked candidates are eligible for the seeded pick at a given quality. Bounded 1..4 — never unbounded, never a fully random choice regardless of quality. */
function candidatePoolSize(qualityScore: number): number {
  if (qualityScore >= 80) return 1
  if (qualityScore >= 60) return 2
  if (qualityScore >= 35) return 3
  return 4
}

function scoreDefinitionForStaff(definition: TrainingDefinition, staff: StaffPerson): number {
  const weights = CATEGORY_ATTRIBUTE_WEIGHTS[definition.category]
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + staff.professional.attributes[key as StaffProfessionalAttributeKey] * weight!, 0)
}

/** Ranks candidates by staff fit (desc), tie-broken by definition id (asc) for full determinism. */
function rankByStaffFit(candidates: readonly TrainingDefinition[], staff: StaffPerson): readonly TrainingDefinition[] {
  return [...candidates].sort((a, b) => scoreDefinitionForStaff(b, staff) - scoreDefinitionForStaff(a, staff) || a.id.localeCompare(b.id))
}

/** How much a definition addresses a player's weakest ratings — bigger gap-from-max on targeted ratings = more "needed". */
function scoreDefinitionForPlayerNeed(definition: TrainingDefinition, player: Player): number {
  if (definition.effects.targetRatings.length === 0) return 0
  return definition.effects.targetRatings.reduce((sum, key) => sum + (100 - player.basketball.ratings[key]), 0) / definition.effects.targetRatings.length
}

function rankByPlayerNeed(candidates: readonly TrainingDefinition[], player: Player): readonly TrainingDefinition[] {
  return [...candidates].sort((a, b) => scoreDefinitionForPlayerNeed(b, player) - scoreDefinitionForPlayerNeed(a, player) || a.id.localeCompare(b.id))
}

function seededPickFromTop(ranked: readonly TrainingDefinition[], qualityScore: number, seed: string): TrainingDefinition {
  const poolSize = Math.min(candidatePoolSize(qualityScore), ranked.length)
  if (poolSize <= 1) return ranked[0]!
  const random = new SeededRandomSource(hashStringToSeed(`${seed}:definition`))
  return ranked[random.nextInt(0, poolSize - 1)]!
}

/**
 * Effective team-session definition when `createTeamTrainingPlan` is delegated. Candidates are
 * every catalog definition applicable to a team session (`scope !== 'individual'`), ranked by the
 * holder's category-relevant professional attributes.
 */
export function effectiveTeamDefinition(staff: StaffPerson, qualityScore: number, seed: string): TrainingDefinition {
  const candidates = TRAINING_CATALOG.filter((definition) => definition.scope !== 'individual')
  return seededPickFromTop(rankByStaffFit(candidates, staff), qualityScore, seed)
}

/**
 * Effective individual-session definition when `assignIndividualDevelopment` is delegated.
 * Candidates are every catalog definition applicable to an individual session
 * (`scope !== 'team'`) that the player is position-eligible for, ranked by how much the
 * definition addresses the player's weakest targeted ratings — "stronger development coach
 * produces better individual development recommendations" per the Wave 1 issue brief table.
 */
export function effectiveIndividualDefinition(player: Player, qualityScore: number, seed: string): TrainingDefinition {
  const candidates = TRAINING_CATALOG.filter((definition) => definition.scope !== 'team' && isPositionEligible(definition, player.basketball.primaryPosition))
  return seededPickFromTop(rankByPlayerNeed(candidates, player), qualityScore, seed)
}

/**
 * Bounded, deterministic development-stimulus variance multiplier for the delegated plan path
 * (docs/STAFF_SYSTEM_V2.md §14.2: "higher quality narrows variance toward an idealized plan;
 * lower quality widens it"). Applies ONLY to `developmentStimulusByPlayerId` — never to fatigue,
 * morale, cohesion, or `injuryRiskWeight` (those remain exactly as computed from
 * `intensity`/`TrainingDefinition.effects`, unaffected by plan quality).
 *
 * Band width scales linearly with `(100 - qualityScore)`:
 * - qualityScore 100 -> band ±MIN_BAND (multiplier stays within ~1.0 ± 0.02)
 * - qualityScore 0   -> band ±MAX_BAND (multiplier stays within ~1.0 ± 0.15)
 *
 * The multiplier is always clamped to [MULTIPLIER_FLOOR, MULTIPLIER_CEILING] regardless of band
 * math, so a poor decision can never produce an absurd stimulus swing — a wide band still only
 * ever samples within [0.85, 1.15].
 */
const MIN_BAND = 0.02
const MAX_BAND = 0.15
const MULTIPLIER_FLOOR = 0.85
const MULTIPLIER_CEILING = 1.15

export function delegatedStimulusMultiplier(qualityScore: number, seed: string): number {
  const band = MIN_BAND + ((100 - qualityScore) / 100) * (MAX_BAND - MIN_BAND)
  const random = new SeededRandomSource(hashStringToSeed(`${seed}:stimulus`))
  const raw = 1 + random.nextFloat(-band, band)
  return Math.max(MULTIPLIER_FLOOR, Math.min(MULTIPLIER_CEILING, raw))
}

const INTENSITY_ORDER: readonly TrainingIntensity[] = ['light', 'normal', 'high']

/**
 * Effective intensity when `determineIntensity` is delegated. Quality biases toward `normal`
 * (the measured, sustainable choice): high quality always yields `normal`; lower quality has a
 * bounded, seeded chance of drifting one step to `light` or `high` — never an unbounded or
 * arbitrary intensity, and never a new intensity level outside the existing model.
 */
export function effectiveIntensity(qualityScore: number, seed: string): TrainingIntensity {
  if (qualityScore >= 70) return 'normal'
  const random = new SeededRandomSource(hashStringToSeed(`${seed}:intensity`))
  const driftChance = (70 - qualityScore) / 100
  if (!random.chance(driftChance)) return 'normal'
  return random.chance(0.5) ? INTENSITY_ORDER[0]! : INTENSITY_ORDER[2]!
}
