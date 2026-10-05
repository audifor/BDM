/**
 * WSR1 BACKGROUND model parameter contract. Values are produced by the calibration (scripts/world-sim/wsr1Fit.ts) from the FAST
 * reference corpus and stored, versioned, in backgroundModelV1.ts. Runtime never calibrates.
 */

/** Team-vs-team feature names (offense `o_*` against defense `d_*`, plus context). */
export const RATE_FEATURES = [
  'o_shoot', 'o_rim', 'o_create', 'o_secure', 'o_pass', 'o_reb', 'o_height', 'o_usage', 'o_star', 'o_bench', 'o_fatigue',
  'd_poa', 'd_int', 'd_mob', 'd_steal', 'd_reb', 'd_height', 'd_bench',
  'o_tempo', 'o_ballMovement', 'o_ballScreen', 'o_offBall', 'o_interior', 'o_isolation', 'o_crash', 'o_familiarity',
  'd_tempo', 'd_pressure', 'd_help', 'd_dropDepth', 'd_familiarity',
  'home', 'shotClock', 'o_planBench', 'periodLength',
] as const
export type RateFeature = typeof RATE_FEATURES[number]

/** y = intercept + sum(coefficient x feature), clamped to [min, max]. `residualSd` is the per-team-game residual of the fit. */
export interface LinearRate {
  readonly intercept: number
  readonly coefficients: Readonly<Partial<Record<RateFeature, number>>>
  readonly min: number
  readonly max: number
  readonly residualSd: number
}

export const TEAM_RATES = [
  /** Possessions per minute played. */
  'pace',
  /** Turnovers per possession. */
  'turnover',
  /** Free-throw trips that are not and-ones, per possession. */
  'freeThrowTrip',
  /** Offensive rebounds per missed field goal. */
  'offensiveRebound',
  /** Assists per made field goal. */
  'assist',
  /** And-ones per made field goal. */
  'andOne',
  /** Defense's steals per offensive turnover. */
  'stealShare',
  /** Defense's blocks per missed two-point attempt. */
  'block',
  /** Defensive fouls that give no free throws, per opponent possession. */
  'nonShootingFoul',
  /** Share of the team's minutes played by the bench (FAST's realised rotation). */
  'benchShare',
] as const
export type TeamRate = typeof TEAM_RATES[number]

/** Player features used to share a team's events among its players (each centered on the team's minutes-weighted mean, /10). */
export const PLAYER_FEATURES = ['usage', 'rimAttack', 'shooting', 'creation', 'ballSecurity', 'passing', 'pointOfAttack', 'interiorDefense', 'mobility', 'steal', 'rebounding', 'height', 'creatorGap'] as const
export type PlayerFeature = typeof PLAYER_FEATURES[number]

/** weight_i = minutes_i x exp(sum(beta x z_i)): a multinomial share of the team's events. */
export interface Allocation { readonly betas: Readonly<Partial<Record<PlayerFeature, number>>> }

export const ALLOCATIONS = ['fieldGoal', 'freeThrowTrip', 'offensiveRebound', 'defensiveRebound', 'assist', 'turnover', 'steal', 'block', 'foul'] as const
export type AllocationKind = typeof ALLOCATIONS[number]

/**
 * Shooter-level features: his level (mean of shooting, rim attack, creation, usage) and style tilts (shooting minus rim attack, creation
 * minus level), height, his canonical lineup roles (Match Next OffensiveRoles, starters), his team's intent and the opposing defense.
 */
export const SHOT_FEATURES = [
  'p_level', 'p_shootTilt', 'p_createTilt', 'p_height', 'p_fatigue', 'p_starter',
  'r_primary', 'r_secondary', 'r_spacer', 'r_movement', 'r_cutter', 'r_screener', 'r_roller', 'r_popper', 'r_interior',
  't_interior', 't_ballMovement', 't_tempo', 't_offBall', 't_ballScreen', 't_isolation',
  'd_int', 'd_poa', 'd_mob', 'd_height', 'd_help', 'd_dropDepth', 'd_pressure', 'home',
] as const
export type ShotFeature = typeof SHOT_FEATURES[number]
export interface ShotEquation { readonly intercept: number; readonly coefficients: Readonly<Partial<Record<ShotFeature, number>>> }

/** Per-minute action rates (FAST action starts and other load events that box scores do not count). */
export const ACTION_RATES = ['drive', 'screen', 'passAction', 'closeout', 'passReleased', 'defResp', 'looseRecovered'] as const
export type ActionRate = typeof ACTION_RATES[number]
export interface PlayerLinearRate { readonly intercept: number; readonly coefficients: Readonly<Partial<Record<PlayerFeature | 'started', number>>> }

export interface BackgroundModelParams {
  readonly version: string
  readonly provenance: { readonly reference: string; readonly matches: number; readonly teamGames: number; readonly playerGames: number; readonly fittedAt: string; readonly method: string }
  readonly rates: Readonly<Record<TeamRate, LinearRate>>
  readonly allocations: Readonly<Record<AllocationKind, Allocation>>
  /**
   * Shots, bottom-up: a shooter chosen by the fieldGoal share, his zone by a multinomial logit (mid-range is the reference) and his make
   * probability by a logistic regression per zone, all on SHOT_FEATURES (his own skills, his team's intent, the opposing defense).
   */
  readonly shotChoice: { readonly rim: ShotEquation; readonly three: ShotEquation }
  readonly shotMake: { readonly rim: ShotEquation; readonly mid: ShotEquation; readonly three: ShotEquation }
  /** Free throws per non-and-one trip: probabilities of 1, 2 and 3 free throws. */
  readonly tripSize: { readonly one: number; readonly two: number; readonly three: number }
  /** Share of turnovers that are offensive fouls. */
  readonly offensiveFoulShare: number
  /**
   * Minutes: the team's bench share is the fitted `benchShare` rate; within the starters and within the bench, minutes follow the plan;
   * game-to-game noise has sd = sdIntercept + sdSlope x planned minutes (per 40 minutes). Overtime weight = plan^overtimeExponent.
   */
  readonly minutes: {
    readonly sdIntercept: number
    readonly sdSlope: number
    /** Foul trouble: minutes (per 40) a player loses per personal foul above (limit - 3), handed to team-mates. */
    readonly foulTroubleMinutesPerFoul: number
    readonly overtimeExponent: number
  }
  /** Actions per court minute that box scores do not count (load and development inputs). */
  readonly actionRates: Readonly<Record<ActionRate, PlayerLinearRate>>
  /** Pass interceptions among steals, and shot actions started per field-goal attempt (FAST load events not in box scores). */
  readonly interceptionShareOfSteals: number
  readonly shotActionsPerAttempt: number
  /** Match-session fatigue change: a x court minutes + b x bench minutes + c x event load (FAST session units). */
  readonly fatigue: { readonly perCourtMinute: number; readonly perBenchMinute: number; readonly perEventLoad: number }
}
