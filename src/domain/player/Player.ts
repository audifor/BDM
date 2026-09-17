import type { CountryId, PersonId, PlayerId } from '@/domain/ids'
import { parseGameDate, type GameDate } from '@/domain/date'
import {
  requireBasketballPosition,
  requireGender,
  type BasketballPosition,
  type Gender,
} from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'
import { createDevelopmentProfile, type PlayerDevelopmentProfile } from './PlayerDevelopmentProfile'
import { deriveLegacyPotential, type PlayerPotential } from './PlayerPotential'
import {
  PLAYER_TRUTH_RATING_KEYS,
  PLAYER_TRUTH_TENDENCY_KEYS,
  type PlayerTruthRatings,
  type PlayerTruthTendencies,
} from './PlayerTruthCatalog'

/**
 * Compatibility surface for Player V2 consumers. These 35 signals are derived from the 80-rating
 * Player Truth and attached as non-enumerable properties. They are never persisted as truth.
 */
export const CANONICAL_RATING_KEYS = [
  'midRangeShooting',
  'threePointShooting',
  'freeThrowShooting',
  'rimFinishing',
  'contactFinishing',
  'dunking',
  'floater',
  'postScoring',
  'ballHandling',
  'ballSecurity',
  'firstStep',
  'changeOfDirection',
  'passing',
  'courtVision',
  'perimeterDefense',
  'interiorDefense',
  'screenNavigation',
  'defensiveAwareness',
  'steal',
  'rimProtection',
  'shotContest',
  'offensiveRebounding',
  'defensiveRebounding',
  'boxOut',
  'acceleration',
  'speed',
  'lateralAgility',
  'strength',
  'vertical',
  'stamina',
  'decisionMaking',
  'anticipation',
  'composure',
  'offBallAwareness',
  'discipline',
] as const
export type CanonicalRatingKey = typeof CANONICAL_RATING_KEYS[number]
export type LegacyCanonicalPlayerRatings = Readonly<Record<CanonicalRatingKey, number>>

/** Compatibility surface for the former 21-tendency runtime. */
export const TENDENCY_KEYS = [
  'drive',
  'attackContact',
  'dunkAttempt',
  'floaterAttempt',
  'postUp',
  'midRangeAttempt',
  'threePointAttempt',
  'pullUpAttempt',
  'catchAndShoot',
  'pickAndRollBallHandler',
  'pickAndRollRoll',
  'isolation',
  'creativePassing',
  'transitionPush',
  'cut',
  'offBallScreenUse',
  'crashOffensiveGlass',
  'helpDefense',
  'gambleForSteal',
  'switchDefense',
  'foulAggression',
] as const
export type TendencyKey = typeof TENDENCY_KEYS[number]
export type LegacyPlayerTendencies = Readonly<Record<TendencyKey, number>>

export type DominantHand = 'LEFT' | 'RIGHT'
export type DataProvenance = 'sourced' | 'generated' | 'migrated' | 'inferred'

/** V1 input only; never persisted as PlayerTruth. */
export interface LegacyPlayerRatings {
  readonly finishing: number
  readonly shooting: number
  readonly playmaking: number
  readonly perimeterDefense: number
  readonly interiorDefense: number
  readonly rebounding: number
  readonly athleticism: number
}

export const LEGACY_BASKETBALL_RATING_KEYS = [
  'finishing',
  'shooting',
  'playmaking',
  'perimeterDefense',
  'interiorDefense',
  'rebounding',
  'athleticism',
] as const

/** TEMPORARY legacy read surface. It is non-enumerable and therefore never persisted. */
export const BASKETBALL_RATING_KEYS = LEGACY_BASKETBALL_RATING_KEYS
export type BasketballRatingKey = typeof BASKETBALL_RATING_KEYS[number]

/**
 * Runtime Player Truth. Only the 80 exact World DB keys are enumerable/persisted. The 35-key V2
 * and 7-key V1 signals remain readable as non-enumerable compatibility projections.
 */
export type PlayerRatings = Readonly<
  PlayerTruthRatings & LegacyCanonicalPlayerRatings & LegacyPlayerRatings
>

/**
 * Runtime Player tendency truth. Only the 40 exact World DB keys are enumerable/persisted. The
 * former 21-key surface remains readable as non-enumerable compatibility projections.
 */
export type PlayerTendencies = Readonly<PlayerTruthTendencies & LegacyPlayerTendencies>

export interface Player {
  readonly id: PlayerId
  /** Canonical human root reference; legacy callers may omit it at the input boundary. */
  readonly personId?: PersonId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
  readonly basketball: BasketballProfile
  readonly bio: PlayerBio
  readonly development: PlayerDevelopmentProfile
  /** TEMPORARY derived compatibility view; not serialized. */
  readonly potential: PlayerPotential
}

export interface PlayerBio {
  readonly dateOfBirth: GameDate
  readonly heightCm: number
  readonly weightKg: number
  readonly wingspanCm: number
  readonly standingReachCm: number
  readonly dominantHand: DominantHand
  readonly measurementProvenance: Readonly<
    Record<'wingspanCm' | 'standingReachCm' | 'dominantHand', DataProvenance>
  >
}

export interface PlayerBioInput {
  dateOfBirth: GameDate | string
  heightCm: number
  weightKg: number
  wingspanCm?: number
  standingReachCm?: number
  dominantHand?: DominantHand
  measurementProvenance?: Partial<PlayerBio['measurementProvenance']>
}

export interface BasketballProfile {
  readonly primaryPosition: BasketballPosition
  readonly secondaryPositions?: readonly BasketballPosition[]
  readonly ratings: PlayerRatings
  readonly tendencies: PlayerTendencies
  readonly traitIds: readonly string[]
}

export interface CreatePlayerInput {
  id: PlayerId
  readonly personId?: PersonId
  firstName: string
  lastName: string
  gender: Gender
  nationalityId: CountryId
  basketball: {
    readonly primaryPosition: BasketballPosition
    readonly secondaryPositions?: readonly BasketballPosition[]
    readonly ratings:
      | PlayerRatings
      | PlayerTruthRatings
      | LegacyCanonicalPlayerRatings
      | LegacyPlayerRatings
    readonly tendencies?:
      | PlayerTendencies
      | PlayerTruthTendencies
      | LegacyPlayerTendencies
    readonly traitIds?: readonly string[]
  }
  bio: PlayerBioInput
  development?: PlayerDevelopmentProfile
  /** Legacy input accepted only at V1 boundaries. */
  potential?: PlayerPotential
}

export function createPlayer(input: CreatePlayerInput): Player {
  if (
    input.potential !== undefined
    && (!Number.isInteger(input.potential.ceiling)
      || input.potential.ceiling < 0
      || input.potential.ceiling > 100)
  ) {
    throw new RangeError('Player potential ceiling must be an integer from 0 to 100')
  }

  const ratings = normalizeRatings(input.id, input.basketball.ratings)
  const bio = validateBio(input.id, input.basketball.primaryPosition, input.bio)
  const tendencies = normalizeTendencies(
    input.id,
    input.basketball.primaryPosition,
    ratings,
    input.basketball.tendencies,
  )
  const player: Omit<Player, 'potential'> = {
    id: requireNonEmptyString(input.id, 'Player id') as PlayerId,
    personId: input.personId ?? (`person:player:${input.id}` as PersonId),
    firstName: requireNonEmptyString(input.firstName, 'Player first name'),
    lastName: requireNonEmptyString(input.lastName, 'Player last name'),
    gender: requireGender(input.gender),
    nationalityId: requireNonEmptyString(input.nationalityId, 'Player nationality id') as CountryId,
    basketball: {
      primaryPosition: requireBasketballPosition(input.basketball.primaryPosition),
      ...(input.basketball.secondaryPositions === undefined
        ? {}
        : { secondaryPositions: [...input.basketball.secondaryPositions].map(requireBasketballPosition) }),
      ratings,
      tendencies,
      traitIds: [...(input.basketball.traitIds ?? [])],
    },
    bio,
    development: createDevelopmentProfile(
      input.development ?? defaultDevelopmentProfile(ratings, input.potential?.ceiling),
    ),
  }
  Object.defineProperty(player, 'potential', {
    enumerable: false,
    value: deriveLegacyPotential(player.development),
  })
  return player as Player
}

function normalizeRatings(
  id: PlayerId,
  input: CreatePlayerInput['basketball']['ratings'],
): PlayerRatings {
  let truth: PlayerTruthRatings
  let legacy35: LegacyCanonicalPlayerRatings | undefined
  if (isPlayerTruthRatings(input)) {
    validatePlayerTruthRatings(input)
    truth = pickPlayerTruthRatings(input)
  } else if (isLegacyCanonicalRatings(input)) {
    validateLegacyCanonicalRatings(input)
    truth = migrateLegacyCanonicalRatingsToTruth(input)
    legacy35 = input
  } else {
    validateLegacyRatings(input)
    legacy35 = canonicalizeLegacyRatings35(id, input)
    truth = migrateLegacyCanonicalRatingsToTruth(legacy35)
  }
  return attachRatingCompatibility(truth, legacy35)
}

function normalizeTendencies(
  id: PlayerId,
  position: BasketballPosition,
  ratings: PlayerRatings,
  input: CreatePlayerInput['basketball']['tendencies'],
): PlayerTendencies {
  if (input === undefined) return generateDefaultTendencies(id, position, ratings)
  if (isPlayerTruthTendencies(input)) {
    validatePlayerTruthTendencies(input)
    return attachTendencyCompatibility(pickPlayerTruthTendencies(input))
  }
  validateLegacyTendencies(input)
  return attachTendencyCompatibility(migrateLegacyTendenciesToTruth(input))
}

function validateBio(
  id: PlayerId,
  position: BasketballPosition,
  bio: PlayerBioInput,
): PlayerBio {
  const heightCm = requireFiniteInRange(bio.heightCm, 'Player heightCm', 120, 250)
  const weightKg = requireFiniteInRange(bio.weightKg, 'Player weightKg', 30, 250)
  const wingspanCm = bio.wingspanCm
    ?? generatedMeasurement(id, position, heightCm, 'wingspanCm')
  const standingReachCm = bio.standingReachCm
    ?? generatedMeasurement(id, position, heightCm, 'standingReachCm')
  if (wingspanCm < 120 || wingspanCm > 280 || standingReachCm < 150 || standingReachCm > 310) {
    throw new RangeError('Player measurements are outside supported bounds')
  }
  const dominantHand = bio.dominantHand ?? (seed(id, 'dominantHand') % 10 === 0 ? 'LEFT' : 'RIGHT')
  if (dominantHand !== 'LEFT' && dominantHand !== 'RIGHT') {
    throw new RangeError('Player dominantHand must be LEFT or RIGHT')
  }
  const defaults: PlayerBio['measurementProvenance'] = {
    wingspanCm: bio.wingspanCm === undefined ? 'generated' : 'inferred',
    standingReachCm: bio.standingReachCm === undefined ? 'generated' : 'inferred',
    dominantHand: bio.dominantHand === undefined ? 'generated' : 'inferred',
  }
  return {
    dateOfBirth: parseGameDate(bio.dateOfBirth),
    heightCm,
    weightKg,
    wingspanCm,
    standingReachCm,
    dominantHand,
    measurementProvenance: { ...defaults, ...bio.measurementProvenance },
  }
}

function validatePlayerTruthRatings(ratings: PlayerTruthRatings): void {
  const enumerableKeys = Object.keys(ratings)
  if (
    enumerableKeys.length !== PLAYER_TRUTH_RATING_KEYS.length
    || enumerableKeys.some((key) => !(PLAYER_TRUTH_RATING_KEYS as readonly string[]).includes(key))
  ) {
    throw new RangeError('Player truth ratings must contain exactly the 80 canonical World DB keys')
  }
  for (const key of PLAYER_TRUTH_RATING_KEYS) {
    requireFiniteInRange(ratings[key], `Player ${key}`, 1, 100)
  }
}

function validateLegacyCanonicalRatings(ratings: LegacyCanonicalPlayerRatings): void {
  for (const key of CANONICAL_RATING_KEYS) {
    requireFiniteInRange(ratings[key], `Player ${key}`, 1, 100)
  }
}

function validateLegacyRatings(ratings: LegacyPlayerRatings): void {
  for (const key of LEGACY_BASKETBALL_RATING_KEYS) {
    const value = ratings[key]
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new RangeError(`Legacy player ${key} must be an integer from 0 to 100`)
    }
  }
}

function validatePlayerTruthTendencies(tendencies: PlayerTruthTendencies): void {
  const enumerableKeys = Object.keys(tendencies)
  if (
    enumerableKeys.length !== PLAYER_TRUTH_TENDENCY_KEYS.length
    || enumerableKeys.some((key) => !(PLAYER_TRUTH_TENDENCY_KEYS as readonly string[]).includes(key))
  ) {
    throw new RangeError('Player truth tendencies must contain exactly the 40 canonical World DB keys')
  }
  for (const key of PLAYER_TRUTH_TENDENCY_KEYS) {
    requireFiniteInRange(tendencies[key], `Player tendency ${key}`, 1, 100)
  }
}

function validateLegacyTendencies(tendencies: LegacyPlayerTendencies): void {
  for (const key of TENDENCY_KEYS) {
    requireFiniteInRange(tendencies[key], `Player tendency ${key}`, 1, 100)
  }
}

function requireFiniteInRange(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be finite from ${minimum} to ${maximum}`)
  }
  return value
}

function isPlayerTruthRatings(
  value: CreatePlayerInput['basketball']['ratings'],
): value is PlayerTruthRatings | PlayerRatings {
  return 'FREE_THROW' in value
}

function isLegacyCanonicalRatings(
  value: CreatePlayerInput['basketball']['ratings'],
): value is LegacyCanonicalPlayerRatings {
  return 'midRangeShooting' in value
}

function isPlayerTruthTendencies(
  value: NonNullable<CreatePlayerInput['basketball']['tendencies']>,
): value is PlayerTruthTendencies | PlayerTendencies {
  return 'SHOT_FREQUENCY' in value
}

function seed(id: string, key: string): number {
  let state = 2166136261
  for (const part of `${id}:${key}`) {
    state = Math.imul(state ^ part.charCodeAt(0), 16777619)
  }
  return state >>> 0
}

function variation(id: string, key: string): number {
  return seed(id, key) % 13 - 6
}

/** V1 seven-signal migration directly into the current 80-rating Player Truth. */
export function canonicalizeLegacyRatings(id: PlayerId, legacy: LegacyPlayerRatings): PlayerRatings {
  validateLegacyRatings(legacy)
  const legacy35 = canonicalizeLegacyRatings35(id, legacy)
  return attachRatingCompatibility(migrateLegacyCanonicalRatingsToTruth(legacy35), legacy35)
}

function canonicalizeLegacyRatings35(
  id: PlayerId,
  legacy: LegacyPlayerRatings,
): LegacyCanonicalPlayerRatings {
  const base: Record<CanonicalRatingKey, number> = {
    midRangeShooting: legacy.shooting,
    threePointShooting: legacy.shooting,
    freeThrowShooting: legacy.shooting,
    rimFinishing: legacy.finishing,
    contactFinishing: legacy.finishing,
    dunking: legacy.finishing,
    floater: legacy.finishing,
    postScoring: legacy.finishing,
    ballHandling: legacy.playmaking,
    ballSecurity: legacy.playmaking,
    firstStep: legacy.playmaking,
    changeOfDirection: legacy.athleticism,
    passing: legacy.playmaking,
    courtVision: legacy.playmaking,
    perimeterDefense: legacy.perimeterDefense,
    interiorDefense: legacy.interiorDefense,
    screenNavigation: legacy.perimeterDefense,
    defensiveAwareness: (legacy.perimeterDefense + legacy.interiorDefense) / 2,
    steal: legacy.perimeterDefense,
    rimProtection: legacy.interiorDefense,
    shotContest: legacy.perimeterDefense,
    offensiveRebounding: legacy.rebounding,
    defensiveRebounding: legacy.rebounding,
    boxOut: legacy.rebounding,
    acceleration: legacy.athleticism,
    speed: legacy.athleticism,
    lateralAgility: legacy.athleticism,
    strength: legacy.athleticism,
    vertical: legacy.athleticism,
    stamina: legacy.athleticism,
    decisionMaking: legacy.playmaking,
    anticipation: (legacy.perimeterDefense + legacy.interiorDefense) / 2,
    composure: (legacy.finishing + legacy.shooting) / 2,
    offBallAwareness: legacy.playmaking,
    discipline: legacy.interiorDefense,
  }
  return Object.fromEntries(
    CANONICAL_RATING_KEYS.map((key) => [
      key,
      clamp(base[key] + (key === 'perimeterDefense' || key === 'interiorDefense' ? 0 : variation(id, key))),
    ]),
  ) as LegacyCanonicalPlayerRatings
}

export function migrateLegacyCanonicalRatingsToTruth(
  legacy: LegacyCanonicalPlayerRatings,
): PlayerTruthRatings {
  validateLegacyCanonicalRatings(legacy)
  const average2 = (a: number, b: number) => average(a, b)
  const average3 = (a: number, b: number, c: number) => average(a, b, c)
  return {
    FREE_THROW: legacy.freeThrowShooting,
    SHORT_MIDRANGE: legacy.midRangeShooting,
    LONG_MIDRANGE: legacy.midRangeShooting,
    MIDRANGE_PULLUP: average3(legacy.midRangeShooting, legacy.ballHandling, legacy.composure),
    THREE_POINT_STATIC: legacy.threePointShooting,
    THREE_POINT_PULLUP: legacy.threePointShooting,
    DEEP_SHOOTING: legacy.threePointShooting,
    MOVEMENT_SHOOTING: legacy.threePointShooting,
    CONTESTED_SHOOTING: average2(legacy.threePointShooting, legacy.composure),
    SHOT_TOUCH: average3(legacy.midRangeShooting, legacy.freeThrowShooting, legacy.floater),
    RIM_FINISHING: legacy.rimFinishing,
    CONTACT_FINISHING: legacy.contactFinishing,
    FINISHING_THROUGH_LENGTH: legacy.contactFinishing,
    OFF_HAND_FINISHING: legacy.rimFinishing,
    DUNKING: legacy.dunking,
    VERTICAL_FINISHING: average2(legacy.dunking, legacy.vertical),
    ACROBATIC_FINISHING: legacy.floater,
    POST_FINISHING: legacy.postScoring,
    FOUL_DRAWING: legacy.contactFinishing,
    CLOSE_TOUCH: average2(legacy.rimFinishing, legacy.floater),
    BALL_CONTROL: legacy.ballHandling,
    DRIBBLE_SECURITY: legacy.ballSecurity,
    CHANGE_OF_DIRECTION: legacy.changeOfDirection,
    CHANGE_OF_PACE: average2(legacy.firstStep, legacy.ballHandling),
    DRIVE_CREATION: legacy.firstStep,
    PRESSURE_HANDLING: average3(legacy.ballHandling, legacy.ballSecurity, legacy.composure),
    OPEN_COURT_HANDLING: average2(legacy.ballHandling, legacy.speed),
    DRIBBLE_SEPARATION: average2(legacy.ballHandling, legacy.changeOfDirection),
    BODY_CONTROL_WITH_BALL: average3(legacy.ballHandling, legacy.changeOfDirection, legacy.composure),
    PASSING_ACCURACY: legacy.passing,
    PASSING_VISION: legacy.courtVision,
    PASSING_TIMING: average2(legacy.passing, legacy.decisionMaking),
    LIVE_DRIBBLE_PASSING: average2(legacy.passing, legacy.ballHandling),
    PICK_AND_ROLL_PLAYMAKING: average3(legacy.passing, legacy.courtVision, legacy.ballHandling),
    SHORT_ROLL_PLAYMAKING: average2(legacy.passing, legacy.postScoring),
    POST_PLAYMAKING: average2(legacy.passing, legacy.postScoring),
    TRANSITION_PLAYMAKING: average3(legacy.passing, legacy.courtVision, legacy.speed),
    ADVANTAGE_CREATION: average3(legacy.firstStep, legacy.courtVision, legacy.decisionMaking),
    ADVANTAGE_EXPLOITATION: average3(legacy.passing, legacy.courtVision, legacy.decisionMaking),
    OFF_BALL_MOVEMENT: legacy.offBallAwareness,
    CUTTING: average2(legacy.offBallAwareness, legacy.rimFinishing),
    SCREENING: average2(legacy.strength, legacy.offBallAwareness),
    SCREEN_USAGE: average2(legacy.offBallAwareness, legacy.decisionMaking),
    SPACING: average2(legacy.offBallAwareness, legacy.threePointShooting),
    OFFENSIVE_POSITIONING: legacy.offBallAwareness,
    RELOCATION: average2(legacy.offBallAwareness, legacy.threePointShooting),
    ROLL_GRAVITY: average2(legacy.rimFinishing, legacy.strength),
    POINT_OF_ATTACK_DEFENSE: legacy.perimeterDefense,
    LATERAL_DEFENSE: average2(legacy.perimeterDefense, legacy.lateralAgility),
    SCREEN_NAVIGATION_DEFENSE: legacy.screenNavigation,
    POST_DEFENSE: legacy.interiorDefense,
    RIM_PROTECTION: legacy.rimProtection,
    SHOT_CONTEST: legacy.shotContest,
    STEAL_ABILITY: legacy.steal,
    DEFLECTION_ABILITY: average2(legacy.steal, legacy.perimeterDefense),
    HELP_DEFENSE: legacy.defensiveAwareness,
    DEFENSIVE_ROTATION: legacy.defensiveAwareness,
    DEFENSIVE_POSITIONING: legacy.defensiveAwareness,
    OFFENSIVE_REBOUNDING: legacy.offensiveRebounding,
    DEFENSIVE_REBOUNDING: legacy.defensiveRebounding,
    SPEED: legacy.speed,
    ACCELERATION: legacy.acceleration,
    AGILITY: legacy.lateralAgility,
    STRENGTH: legacy.strength,
    VERTICAL_LEAP: legacy.vertical,
    EXPLOSIVENESS: average2(legacy.acceleration, legacy.vertical),
    BALANCE: average2(legacy.strength, legacy.lateralAgility),
    STAMINA: legacy.stamina,
    ENDURANCE: legacy.stamina,
    BODY_CONTROL: average3(legacy.lateralAgility, legacy.strength, legacy.composure),
    DECISION_MAKING: legacy.decisionMaking,
    ANTICIPATION: legacy.anticipation,
    OFFENSIVE_AWARENESS: legacy.offBallAwareness,
    DEFENSIVE_AWARENESS: legacy.defensiveAwareness,
    SPATIAL_AWARENESS: average3(legacy.courtVision, legacy.offBallAwareness, legacy.defensiveAwareness),
    CONCENTRATION: average2(legacy.discipline, legacy.composure),
    REACTION_SPEED: average2(legacy.anticipation, legacy.lateralAgility),
    COMPOSURE: legacy.composure,
    ADAPTABILITY: average2(legacy.decisionMaking, legacy.composure),
    DISCIPLINE: legacy.discipline,
  }
}

export function legacyCanonicalRatingSignals(
  ratings: PlayerTruthRatings | PlayerRatings,
): LegacyCanonicalPlayerRatings {
  return {
    midRangeShooting: average(ratings.SHORT_MIDRANGE, ratings.LONG_MIDRANGE),
    threePointShooting: average(ratings.THREE_POINT_STATIC, ratings.THREE_POINT_PULLUP),
    freeThrowShooting: ratings.FREE_THROW,
    rimFinishing: ratings.RIM_FINISHING,
    contactFinishing: ratings.CONTACT_FINISHING,
    dunking: ratings.DUNKING,
    floater: ratings.ACROBATIC_FINISHING,
    postScoring: ratings.POST_FINISHING,
    ballHandling: ratings.BALL_CONTROL,
    ballSecurity: ratings.DRIBBLE_SECURITY,
    firstStep: ratings.DRIVE_CREATION,
    changeOfDirection: ratings.CHANGE_OF_DIRECTION,
    passing: ratings.PASSING_ACCURACY,
    courtVision: ratings.PASSING_VISION,
    perimeterDefense: ratings.POINT_OF_ATTACK_DEFENSE,
    interiorDefense: ratings.POST_DEFENSE,
    screenNavigation: ratings.SCREEN_NAVIGATION_DEFENSE,
    defensiveAwareness: ratings.DEFENSIVE_AWARENESS,
    steal: ratings.STEAL_ABILITY,
    rimProtection: ratings.RIM_PROTECTION,
    shotContest: ratings.SHOT_CONTEST,
    offensiveRebounding: ratings.OFFENSIVE_REBOUNDING,
    defensiveRebounding: ratings.DEFENSIVE_REBOUNDING,
    boxOut: average(ratings.OFFENSIVE_REBOUNDING, ratings.DEFENSIVE_REBOUNDING),
    acceleration: ratings.ACCELERATION,
    speed: ratings.SPEED,
    lateralAgility: ratings.AGILITY,
    strength: ratings.STRENGTH,
    vertical: ratings.VERTICAL_LEAP,
    stamina: ratings.STAMINA,
    decisionMaking: ratings.DECISION_MAKING,
    anticipation: ratings.ANTICIPATION,
    composure: ratings.COMPOSURE,
    offBallAwareness: ratings.OFFENSIVE_AWARENESS,
    discipline: ratings.DISCIPLINE,
  }
}

/** Explicit, pure V1 compatibility projection. It is never stored on PlayerTruth. */
export function legacyRatingSignals(ratings: PlayerRatings): LegacyPlayerRatings {
  const legacy = CANONICAL_RATING_KEYS.every((key) => Object.hasOwn(ratings, key))
    ? ratings as LegacyCanonicalPlayerRatings
    : legacyCanonicalRatingSignals(ratings)
  return {
    finishing: average(
      legacy.rimFinishing,
      legacy.contactFinishing,
      legacy.dunking,
      legacy.floater,
      legacy.postScoring,
    ),
    shooting: average(
      legacy.midRangeShooting,
      legacy.threePointShooting,
      legacy.freeThrowShooting,
    ),
    playmaking: average(
      legacy.ballHandling,
      legacy.ballSecurity,
      legacy.firstStep,
      legacy.passing,
      legacy.courtVision,
    ),
    perimeterDefense: average(
      legacy.perimeterDefense,
      legacy.screenNavigation,
      legacy.steal,
      legacy.shotContest,
      legacy.defensiveAwareness,
    ),
    interiorDefense: average(
      legacy.interiorDefense,
      legacy.rimProtection,
      legacy.defensiveAwareness,
      legacy.discipline,
    ),
    rebounding: average(
      legacy.offensiveRebounding,
      legacy.defensiveRebounding,
      legacy.boxOut,
    ),
    athleticism: average(
      legacy.acceleration,
      legacy.speed,
      legacy.lateralAgility,
      legacy.changeOfDirection,
      legacy.strength,
      legacy.vertical,
      legacy.stamina,
    ),
  }
}

function attachRatingCompatibility(truth: PlayerTruthRatings, sourceLegacy35?: LegacyCanonicalPlayerRatings): PlayerRatings {
  const ratings = { ...truth } as Record<string, number>
  const legacy35 = sourceLegacy35 ?? legacyCanonicalRatingSignals(truth)
  const temporary = ratings as unknown as PlayerRatings
  const legacy7 = legacyRatingSignalsFrom35(legacy35)
  defineNonEnumerableSignals(ratings, legacy35)
  defineNonEnumerableSignals(ratings, legacy7 as unknown as Readonly<Record<string, number>>)
  return temporary
}

function legacyRatingSignalsFrom35(ratings: LegacyCanonicalPlayerRatings): LegacyPlayerRatings {
  return {
    finishing: average(
      ratings.rimFinishing,
      ratings.contactFinishing,
      ratings.dunking,
      ratings.floater,
      ratings.postScoring,
    ),
    shooting: average(
      ratings.midRangeShooting,
      ratings.threePointShooting,
      ratings.freeThrowShooting,
    ),
    playmaking: average(
      ratings.ballHandling,
      ratings.ballSecurity,
      ratings.firstStep,
      ratings.passing,
      ratings.courtVision,
    ),
    perimeterDefense: average(
      ratings.perimeterDefense,
      ratings.screenNavigation,
      ratings.steal,
      ratings.shotContest,
      ratings.defensiveAwareness,
    ),
    interiorDefense: average(
      ratings.interiorDefense,
      ratings.rimProtection,
      ratings.defensiveAwareness,
      ratings.discipline,
    ),
    rebounding: average(
      ratings.offensiveRebounding,
      ratings.defensiveRebounding,
      ratings.boxOut,
    ),
    athleticism: average(
      ratings.acceleration,
      ratings.speed,
      ratings.lateralAgility,
      ratings.changeOfDirection,
      ratings.strength,
      ratings.vertical,
      ratings.stamina,
    ),
  }
}

function pickPlayerTruthRatings(ratings: PlayerTruthRatings): PlayerTruthRatings {
  return Object.fromEntries(
    PLAYER_TRUTH_RATING_KEYS.map((key) => [key, ratings[key]]),
  ) as unknown as PlayerTruthRatings
}

function defineNonEnumerableSignals(
  target: Record<string, number>,
  signals: Readonly<Record<string, number>>,
): void {
  for (const [key, value] of Object.entries(signals)) {
    if (Object.hasOwn(target, key)) continue
    Object.defineProperty(target, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value,
    })
  }
}

export function generateDefaultTendencies(
  id: PlayerId,
  position: BasketballPosition,
  ratings: PlayerRatings,
): PlayerTendencies {
  const legacy = generateLegacyTendencies(id, position, ratings)
  return attachTendencyCompatibility(migrateLegacyTendenciesToTruth(legacy))
}

function generateLegacyTendencies(
  id: PlayerId,
  position: BasketballPosition,
  ratings: PlayerRatings,
): LegacyPlayerTendencies {
  const big = position === 'PF' || position === 'C'
  const wing = position === 'SG' || position === 'SF'
  const raw = Object.fromEntries(
    TENDENCY_KEYS.map((key) => [key, 50 + variation(id, `tendency:${key}`)]),
  ) as Record<TendencyKey, number>
  raw.drive += (ratings.firstStep + ratings.rimFinishing - 100) * 0.18
  raw.threePointAttempt += (ratings.threePointShooting - 50) * 0.28 + (wing ? 7 : 0)
  raw.pickAndRollBallHandler += (ratings.passing + ratings.courtVision - 100) * 0.2
  raw.creativePassing += (ratings.courtVision - 50) * 0.25
  raw.crashOffensiveGlass += (ratings.offensiveRebounding - 50) * 0.25 + (big ? 8 : 0)
  raw.pickAndRollRoll += big ? 12 : -4
  raw.helpDefense += (ratings.defensiveAwareness - 50) * 0.2
  raw.gambleForSteal += (ratings.steal - 50) * 0.2
  raw.foulAggression += (50 - ratings.discipline) * 0.16
  return Object.fromEntries(
    TENDENCY_KEYS.map((key) => [key, clamp(raw[key])]),
  ) as LegacyPlayerTendencies
}

export function migrateLegacyTendenciesToTruth(
  legacy: LegacyPlayerTendencies,
): PlayerTruthTendencies {
  validateLegacyTendencies(legacy)
  return {
    SHOT_FREQUENCY: average(
      legacy.drive,
      legacy.midRangeAttempt,
      legacy.threePointAttempt,
    ),
    RIM_ATTEMPT_FREQUENCY: average(legacy.drive, legacy.dunkAttempt),
    MIDRANGE_FREQUENCY: legacy.midRangeAttempt,
    THREE_POINT_FREQUENCY: legacy.threePointAttempt,
    DEEP_THREE_FREQUENCY: legacy.threePointAttempt,
    PULLUP_FREQUENCY: legacy.pullUpAttempt,
    CATCH_AND_SHOOT_FREQUENCY: legacy.catchAndShoot,
    CONTESTED_SHOT_WILLINGNESS: legacy.isolation,
    TRANSITION_ATTACK_FREQUENCY: legacy.transitionPush,
    DRIVE_FREQUENCY: legacy.drive,
    DUNK_ATTEMPT_FREQUENCY: legacy.dunkAttempt,
    ACROBATIC_FINISH_FREQUENCY: legacy.floaterAttempt,
    FOUL_SEEKING_FREQUENCY: legacy.attackContact,
    POST_UP_FREQUENCY: legacy.postUp,
    ISOLATION_FREQUENCY: legacy.isolation,
    PICK_AND_ROLL_HANDLER_FREQUENCY: legacy.pickAndRollBallHandler,
    PICK_AND_ROLL_ROLL_FREQUENCY: legacy.pickAndRollRoll,
    PICK_AND_POP_FREQUENCY: legacy.pickAndRollRoll,
    CUT_FREQUENCY: legacy.cut,
    OFF_BALL_SCREEN_USAGE: legacy.offBallScreenUse,
    ON_BALL_SCREENING_FREQUENCY: legacy.pickAndRollRoll,
    RELOCATION_FREQUENCY: legacy.catchAndShoot,
    PASS_FIRST_BIAS: legacy.creativePassing,
    ADVANTAGE_PASS_FREQUENCY: legacy.creativePassing,
    SKIP_PASS_FREQUENCY: legacy.creativePassing,
    LOB_PASS_FREQUENCY: legacy.creativePassing,
    RISKY_PASS_FREQUENCY: legacy.creativePassing,
    LIVE_DRIBBLE_PASS_FREQUENCY: legacy.creativePassing,
    OFFENSIVE_REBOUND_CRASH: legacy.crashOffensiveGlass,
    TRANSITION_RUNOUT: legacy.transitionPush,
    ON_BALL_PRESSURE: legacy.helpDefense,
    GAMBLE_FOR_STEALS: legacy.gambleForSteal,
    PASSING_LANE_GAMBLE: legacy.gambleForSteal,
    HELP_AGGRESSIVENESS: legacy.helpDefense,
    ROTATION_AGGRESSIVENESS: legacy.helpDefense,
    RIM_CONTEST_FREQUENCY: legacy.helpDefense,
    FOUL_AGGRESSIVENESS: legacy.foulAggression,
    SWITCH_WILLINGNESS: legacy.switchDefense,
    PHYSICALITY_TENDENCY: legacy.attackContact,
    PACE_PUSH_TENDENCY: legacy.transitionPush,
  }
}

export function legacyTendencySignals(
  tendencies: PlayerTruthTendencies | PlayerTendencies,
): LegacyPlayerTendencies {
  return {
    drive: tendencies.DRIVE_FREQUENCY,
    attackContact: tendencies.PHYSICALITY_TENDENCY,
    dunkAttempt: tendencies.DUNK_ATTEMPT_FREQUENCY,
    floaterAttempt: tendencies.ACROBATIC_FINISH_FREQUENCY,
    postUp: tendencies.POST_UP_FREQUENCY,
    midRangeAttempt: tendencies.MIDRANGE_FREQUENCY,
    threePointAttempt: tendencies.THREE_POINT_FREQUENCY,
    pullUpAttempt: tendencies.PULLUP_FREQUENCY,
    catchAndShoot: tendencies.CATCH_AND_SHOOT_FREQUENCY,
    pickAndRollBallHandler: tendencies.PICK_AND_ROLL_HANDLER_FREQUENCY,
    pickAndRollRoll: tendencies.PICK_AND_ROLL_ROLL_FREQUENCY,
    isolation: tendencies.ISOLATION_FREQUENCY,
    creativePassing: tendencies.RISKY_PASS_FREQUENCY,
    transitionPush: tendencies.PACE_PUSH_TENDENCY,
    cut: tendencies.CUT_FREQUENCY,
    offBallScreenUse: tendencies.OFF_BALL_SCREEN_USAGE,
    crashOffensiveGlass: tendencies.OFFENSIVE_REBOUND_CRASH,
    helpDefense: tendencies.HELP_AGGRESSIVENESS,
    gambleForSteal: tendencies.GAMBLE_FOR_STEALS,
    switchDefense: tendencies.SWITCH_WILLINGNESS,
    foulAggression: tendencies.FOUL_AGGRESSIVENESS,
  }
}

function attachTendencyCompatibility(truth: PlayerTruthTendencies): PlayerTendencies {
  const tendencies = { ...truth } as Record<string, number>
  defineNonEnumerableSignals(tendencies, legacyTendencySignals(truth))
  return tendencies as unknown as PlayerTendencies
}

function pickPlayerTruthTendencies(tendencies: PlayerTruthTendencies): PlayerTruthTendencies {
  return Object.fromEntries(
    PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, tendencies[key]]),
  ) as unknown as PlayerTruthTendencies
}

function generatedMeasurement(
  id: PlayerId,
  position: BasketballPosition,
  height: number,
  key: 'wingspanCm' | 'standingReachCm',
): number {
  const spread = seed(id, key) % 13 - 4
  return key === 'wingspanCm'
    ? height + spread
    : Math.round(height * 0.91 + (position === 'C' ? 10 : position === 'PF' ? 7 : 3) + spread)
}

function defaultDevelopmentProfile(
  ratings: PlayerRatings,
  legacyCeiling?: number,
): PlayerDevelopmentProfile {
  const avg = PLAYER_TRUTH_RATING_KEYS.reduce((sum, key) => sum + ratings[key], 0)
    / PLAYER_TRUTH_RATING_KEYS.length
  const ceiling = legacyCeiling ?? avg
  return {
    developmentStage: 'prime',
    growthRate: 50,
    declineSensitivity: 50,
    ceilings: {
      shooting: ceiling,
      finishing: ceiling,
      creation: ceiling,
      passing: ceiling,
      defense: ceiling,
      rebounding: ceiling,
      physical: ceiling,
      mental: ceiling,
    },
  }
}

function average(...values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function clamp(value: number): number {
  return Math.max(1, Math.min(100, value))
}
