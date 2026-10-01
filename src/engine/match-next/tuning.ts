/**
 * Model parameters of the offensive decision model that are physical / tactical calibrations rather than rules.
 * They live in one place so the robustness audit (BT3A) can sweep them: a well-behaved model answers a modest change
 * with a modest change. `withTuning` is for audits and tests only; the engine itself never mutates the values.
 */
export interface MatchNextTuning {
  /** Ticks (0.1 s) a defender needs to react to a pass before closing out: the defensive-quality knob of the audit. */
  readonly closeoutReactionTicks: number
  /** Points a half-court possession is worth when the offense keeps working. */
  readonly continuationValuePoints: number
  /** Value of a ball screen before player quality (option value of keeping every read open). */
  readonly screenBaseValuePoints: number
  /** Softness of the choice between options: 0 = always the best, larger = closer options are chosen more often. */
  readonly decisionTemperaturePoints: number
  /** Value of a shot per usage point over/under 50 (who is the team's shooter). */
  readonly usageValuePerPoint: number
  /** Make probability of a finish at the rim before contest, and how much the nearest defender's contest takes away. */
  readonly rimBaseMakeProbability: number
  readonly rimContestPenalty: number
  /** Weights (1 = the model as is) of the block risk and of the free-throw value inside a shot's expected points. */
  readonly blockRiskWeight: number
  readonly foulDrawWeight: number
  /** Fraction of the value of continuing the possession that a handler credits to holding the ball. */
  readonly holdDiscount: number
  /** Multipliers of the value of each family of options (audits only). */
  readonly shootValueScale: number
  readonly driveValueScale: number
  readonly passValueScale: number
  /** Weight of the putback quality penalty (0 = no penalty, 1 = as is). */
  readonly putbackQualityWeight: number
  /** Fraction of his top speed at which a NON-assigned defender is believed to help close out a pass (BT2 believed 0.4 for everyone). */
  readonly helpCloseoutBelief: number
  /** BT4G/H: chance scale of getting past the on-ball defender (base) and the make-probability scale of a pull-up / floater. */
  readonly driveBeatBase: number
  readonly pullUpBaseFactor: number
  readonly floaterBaseFactor: number
  /** 1 = a driver may stop and shoot when the lane closes (pull-up / floater); 0 = drives always go to the rim. */
  readonly driveStopEnabled: number
  /** 1 = without a numbers advantage the team brings the ball up in control (handler jogs, the rest run); 0 = always at the BT2 speeds. */
  readonly controlledAdvance: number
  /** Make probability of a three before rating, contest and distance. */
  readonly threeBaseMakeProbability: number
  /** BT4S tendency: how each point of usage over 50 tilts the handler toward attacking (drive) and away from passing. */
  readonly usageDrivePerPoint: number
  readonly usagePassPerPoint: number
  /** Scale of the whistle probability of contact judged between guarding bodies away from shots and drives (BT4J). */
  readonly episodeFoulScale: number
  /** BT4.1 experiment: extra worth of waiting for a better look while the shot clock still allows several. */
  readonly waitPremium: number
  /** BT4.1: ticks a receiver needs to gather per m/s of his speed at the catch, and per metre of defender pressure under 2 m. */
  readonly catchGatherTicksPerMps: number
  readonly catchPressureTicksPerMeter: number
  /** BT4.1: how far from his own man the weak-side help defender may sag toward the rim, before the man's shooting threat shortens it. */
  readonly helpSagMaxMeters: number
  readonly helpSagBaseMeters: number
  /** BT4.1 movement: scale of the legacy acceleration/braking limits (1 = as the profile says), and the turning grip as a share of braking (0 = legacy single vector limit). */
  readonly movementAgility: number
  readonly lateralGripFactor: number
  /** BT4.1 switches (1 = on): probing dribble while reading, a teammate offering himself to a stuck handler, carrying the ball up from the backcourt whatever the phase. */
  readonly probeEnabled: number
  readonly offerEnabled: number
  readonly backcourtCarryEnabled: number
  /** Where waiting pays: 0 = anywhere, 1 = whenever there is no live transition, 2 = only once the offense is settled. */
  readonly waitGateMode: number
  /** Referee strictness: scales every whistle probability of the contact model (1 = the calibrated tolerances). */
  readonly refereeScale: number
  /** BT4.2: 1 = a stopped transition stays a transition until the carrier is in the frontcourt (whatever started it); 0 = only after a made basket. */
  readonly transitionHoldsUntilFrontcourt: number
  /** BT4.2: 1 = the handler may pass off a set screen to a teammate who is better placed (PnR reads); 0 = only when he is trapped. */
  readonly passOffScreen: number
  /** BT4.2: 1 = a contained drive is valued with the patience premium (the handler can keep working), 0 = at the plain continuation value. */
  readonly driveContainedPremium: number
  /** BT4.2: the patience premium is full above (end + 14) seconds on the shot clock and gone at `end` seconds. */
  readonly waitPremiumEndSeconds: number
  /** BT4.2: a defender counts as being on his spot when he is within this distance of the position his responsibility gives him. */
  readonly defenseSetRadiusMeters: number
  /** BT4.2: how much the passer's vision changes the worth he sees in his teammates' looks (spread between vision 0 and 100, centred on vision 50). */
  readonly passSightSpread: number
  /** BT4.2 marking: a defender (not on the ball) never takes a spot farther from his basket than the ball plus this margin; 0 = off. */
  readonly goalSideMarginMeters: number
  /** BT4.2: 1 = a defender with far to go runs facing where he runs (turned, not backpedalling at full speed); 0 = always facing the ball. */
  readonly defenderTravelFacing: number
  /** BT4.2: top speed a player keeps when he moves directly away from where he faces (backpedal); 1 = no penalty. Sideways costs half of the loss. */
  readonly backpedalSpeedFactor: number
}

export const DEFAULT_MATCH_NEXT_TUNING: MatchNextTuning = Object.freeze({
  closeoutReactionTicks: 2,
  continuationValuePoints: 1.10,
  screenBaseValuePoints: 1.4,
  decisionTemperaturePoints: 0.15,
  usageValuePerPoint: 0.004,
  rimBaseMakeProbability: 0.64,
  rimContestPenalty: 0.26,
  blockRiskWeight: 1,
  foulDrawWeight: 1,
  holdDiscount: 0.95,
  shootValueScale: 1,
  driveValueScale: 1,
  passValueScale: 1.12,
  putbackQualityWeight: 0.5,
  helpCloseoutBelief: 0,
  driveBeatBase: 0.05,
  pullUpBaseFactor: 0.95,
  floaterBaseFactor: 1.0,
  driveStopEnabled: 1,
  controlledAdvance: 1,
  threeBaseMakeProbability: 0.36,
  usageDrivePerPoint: 0.003,
  usagePassPerPoint: 0.003,
  episodeFoulScale: 1.7,
  waitPremium: 2.0,
  catchGatherTicksPerMps: 0.8,
  catchPressureTicksPerMeter: 2,
  helpSagMaxMeters: 99,
  helpSagBaseMeters: 5.4,
  movementAgility: 1,
  lateralGripFactor: 1.2,
  probeEnabled: 1,
  offerEnabled: 1,
  backcourtCarryEnabled: 1,
  waitGateMode: 3,
  refereeScale: 1,
  transitionHoldsUntilFrontcourt: 1,
  passOffScreen: 1,
  driveContainedPremium: 0,
  waitPremiumEndSeconds: 6,
  defenseSetRadiusMeters: 4.5,
  passSightSpread: 0.8,
  goalSideMarginMeters: 1.5,
  defenderTravelFacing: 1,
  backpedalSpeedFactor: 0.6,
})

let active: MatchNextTuning = DEFAULT_MATCH_NEXT_TUNING

export function tuning(): MatchNextTuning {
  return active
}

export function withTuning<T>(overrides: Partial<MatchNextTuning>, run: () => T): T {
  const previous = active
  active = Object.freeze({ ...previous, ...overrides })
  try {
    return run()
  } finally {
    active = previous
  }
}
