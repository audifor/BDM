import { parseGameDate, type GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'

export type ClubStrategicMode = 'CONTEND' | 'COMPETE' | 'DEVELOP' | 'REBUILD' | 'SELL' | 'SURVIVE'
export type ClubStrategicReason =
  | 'FINANCIAL_STRESS'
  | 'TITLE_WINDOW'
  | 'AGING_CORE'
  | 'YOUNG_CORE'
  | 'OWNER_PRESSURE'
  | 'BOARD_PRESSURE'
  | 'GOVERNANCE_PRESSURE'
  | 'UNDERPERFORMING'
  | 'OVERPERFORMING'
  | 'RELEGATION_RISK'
  | 'PROMOTION_OPPORTUNITY'
  | 'CONTRACT_EXPIRY_CLUSTER'
  | 'STRONG_FUTURE_POSITION'
  | 'ROSTER_DEPTH_RISK'

export type ClubStrategicHorizon = 'NOW' | 'NEAR_TERM' | 'LONG_TERM'
export type ClubFinancialPosture = 'UNKNOWN' | 'HEALTHY' | 'CONSTRAINED' | 'STRESSED'
export type ClubRiskTolerance = 'LOW' | 'MODERATE' | 'HIGH'
export type ClubRetentionPosture = 'PROTECT_CORE' | 'SELECTIVE' | 'OPEN'
export type ClubAcquisitionAggression = 'LOW' | 'MODERATE' | 'HIGH'
export type ClubSellingWillingness = 'LOW' | 'MODERATE' | 'HIGH'

/** Accepted club direction and the small amount of memory needed for review inertia. */
export interface ClubStrategicState {
  readonly teamId: TeamId
  readonly mode: ClubStrategicMode
  readonly horizon: ClubStrategicHorizon
  readonly financialPosture: ClubFinancialPosture
  readonly riskTolerance: ClubRiskTolerance
  readonly developmentEmphasis: number
  readonly retentionPosture: ClubRetentionPosture
  readonly acquisitionAggression: ClubAcquisitionAggression
  readonly sellingWillingness: ClubSellingWillingness
  readonly establishedOn: GameDate
  readonly lastReviewedOn: GameDate
  readonly transitionReason: ClubStrategicReason | 'INITIAL_ASSESSMENT'
}

const MODES: readonly ClubStrategicMode[] = ['CONTEND', 'COMPETE', 'DEVELOP', 'REBUILD', 'SELL', 'SURVIVE']
const REASONS: readonly (ClubStrategicReason | 'INITIAL_ASSESSMENT')[] = ['FINANCIAL_STRESS', 'TITLE_WINDOW', 'AGING_CORE', 'YOUNG_CORE', 'OWNER_PRESSURE', 'BOARD_PRESSURE', 'GOVERNANCE_PRESSURE', 'UNDERPERFORMING', 'OVERPERFORMING', 'RELEGATION_RISK', 'PROMOTION_OPPORTUNITY', 'CONTRACT_EXPIRY_CLUSTER', 'STRONG_FUTURE_POSITION', 'ROSTER_DEPTH_RISK', 'INITIAL_ASSESSMENT']

export function createClubStrategicState(input: ClubStrategicState): ClubStrategicState {
  if (!input.teamId || input.lastReviewedOn < input.establishedOn || !Number.isInteger(input.developmentEmphasis) || input.developmentEmphasis < 0 || input.developmentEmphasis > 100) throw new RangeError('Club strategic state is invalid')
  if (!MODES.includes(input.mode) || !['NOW', 'NEAR_TERM', 'LONG_TERM'].includes(input.horizon) || !['UNKNOWN', 'HEALTHY', 'CONSTRAINED', 'STRESSED'].includes(input.financialPosture) || !['LOW', 'MODERATE', 'HIGH'].includes(input.riskTolerance) || !['PROTECT_CORE', 'SELECTIVE', 'OPEN'].includes(input.retentionPosture) || !['LOW', 'MODERATE', 'HIGH'].includes(input.acquisitionAggression) || !['LOW', 'MODERATE', 'HIGH'].includes(input.sellingWillingness) || !REASONS.includes(input.transitionReason)) throw new TypeError('Club strategic posture is invalid')
  const establishedOn = parseGameDate(input.establishedOn)
  const lastReviewedOn = parseGameDate(input.lastReviewedOn)
  if (lastReviewedOn < establishedOn) throw new RangeError('Club strategic review predates its establishment')
  return Object.freeze({ ...input, establishedOn, lastReviewedOn })
}
