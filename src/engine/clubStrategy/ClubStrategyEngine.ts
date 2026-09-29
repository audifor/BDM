import { addDays, type GameDate } from '@/domain/date'
import { calculateAge } from '@/domain/player/PlayerAge'
import { getPlayerContractStatus } from '@/domain/contract/PlayerContract'
import { getJobSecurity } from '@/domain/board'
import { createClubStrategicState, type ClubStrategicMode, type ClubStrategicReason, type ClubStrategicState, type ClubStrategicHorizon, type ClubFinancialPosture, type ClubRiskTolerance, type ClubRetentionPosture, type ClubAcquisitionAggression, type ClubSellingWillingness } from '@/domain/clubStrategy'
import { calculateSeasonStandings } from '@/domain/season/calculateStandings'
import type { TeamId } from '@/domain/ids'
import { getFinancialHealthSnapshot } from '@/domain/finance/FinancialHealth'
import { updateGameWorld, type GameWorld } from '@/domain/world'

export const CLUB_STRATEGY_REVIEW_HORIZON_DAYS = 90
const SEVERE_FINANCE_INDICATORS = new Set(['LIQUIDITY_SHORTFALL', 'OVERDUE_PAYABLES', 'UNFUNDED_DEBT_MATURITY', 'REGULATORY_BREACH'])

export interface ClubStrategicAssessment {
  readonly teamId: TeamId
  readonly acceptedMode: ClubStrategicMode | null
  readonly candidateMode: ClubStrategicMode
  readonly reasons: readonly ClubStrategicReason[]
  readonly competitivePressure: 'UNKNOWN' | 'LOW' | 'MODERATE' | 'HIGH'
  readonly financialPressure: 'UNKNOWN' | 'LOW' | 'MODERATE' | 'HIGH'
  readonly boardPressure: 'LOW' | 'MODERATE' | 'HIGH'
  readonly governancePressure: 'LOW' | 'MODERATE' | 'HIGH'
  readonly rosterAverageAge: number | null
  readonly expiringContractCount: number
  readonly lastReviewedOn: GameDate | null
  readonly nextReviewOn: GameDate | null
  readonly reviewEligible: boolean
}

export type ClubStrategyReviewTrigger = 'SCHEDULED' | 'PRESEASON' | 'MAJOR_FINANCIAL_SHOCK' | 'GOVERNANCE_CHANGE' | 'MAJOR_ROSTER_CHANGE' | 'CONTRACT_CHANGE' | 'COMPETITION_CHECKPOINT'

export interface ReviewClubStrategyOptions {
  readonly trigger?: ClubStrategyReviewTrigger
}

export function assessClubStrategy(world: GameWorld, teamId: TeamId): ClubStrategicAssessment {
  const team = world.teams[teamId]
  if (!team) throw new RangeError(`Unknown Team ${teamId}`)
  const reasons: ClubStrategicReason[] = []
  const activeSeasons = Object.values(world.seasons).filter((season) => {
    const competition = world.competitions[season.competitionId]
    const participants = season.participantTeamIds ?? competition?.participantTeamIds ?? []
    return participants.includes(teamId) && season.startDate <= world.currentDate && season.endDate >= world.currentDate
  }).sort((a, b) => a.id.localeCompare(b.id))
  const performance = activeSeasons.map((season) => {
    const standings = calculateSeasonStandings(world, season.id)
    const standing = standings.find((row) => row.teamId === teamId)
    return standing && standing.played > 0 && standings.length > 0 ? { percentile: (standing.position - 1) / Math.max(1, standings.length - 1), position: standing.position, size: standings.length } : undefined
  }).filter((value): value is NonNullable<typeof value> => value !== undefined)
  const competitivePressure = performance.length === 0 ? 'UNKNOWN' : performance.some((row) => row.percentile <= 0.15 || row.percentile >= 0.8) ? 'HIGH' : 'MODERATE'
  const averagePercentile = performance.length ? performance.reduce((sum, row) => sum + row.percentile, 0) / performance.length : null
  if (averagePercentile !== null && averagePercentile <= 0.15) reasons.push('OVERPERFORMING')
  if (averagePercentile !== null && averagePercentile >= 0.8) reasons.push('UNDERPERFORMING')
  if (averagePercentile !== null && averagePercentile <= 0.15) reasons.push('TITLE_WINDOW')

  const ages = team.rosterPlayerIds.flatMap((playerId) => {
    const player = world.players[playerId]
    const personId = player?.personId
    const person = personId ? world.personsById[personId] : undefined
    return person?.dateOfBirth ? [calculateAge(person.dateOfBirth, world.currentDate)] : []
  })
  const rosterAverageAge = ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null
  if (rosterAverageAge !== null && rosterAverageAge <= 25 && ages.length >= 5) reasons.push('YOUNG_CORE')
  if (rosterAverageAge !== null && rosterAverageAge >= 30 && ages.length >= 5) reasons.push('AGING_CORE')
  if (team.rosterPlayerIds.length < 5) reasons.push('ROSTER_DEPTH_RISK')

  const expiringContractCount = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId && getPlayerContractStatus(contract, world.currentDate) === 'active' && contract.term.expiresOn <= addDays(world.currentDate, 365)).length
  if (expiringContractCount >= 3 && expiringContractCount / Math.max(1, team.rosterPlayerIds.length) >= 0.3) reasons.push('CONTRACT_EXPIRY_CLUSTER')

  const governance = activeGovernanceObjectives(world, teamId)
  const governancePressure = governance.length === 0 ? 'LOW' : governance.some((objective) => objective.importance >= 75) ? 'HIGH' : 'MODERATE'
  if (governance.length > 0) reasons.push('GOVERNANCE_PRESSURE')
  const board = world.boardStatesByTeamId[teamId]
  const jobSecurity = board === undefined ? undefined : getJobSecurity(board)
  const boardPressure = jobSecurity === undefined ? 'LOW' : jobSecurity === 'critical' || jobSecurity === 'atRisk' ? 'HIGH' : jobSecurity === 'underPressure' ? 'MODERATE' : 'LOW'
  if (boardPressure !== 'LOW') reasons.push('BOARD_PRESSURE')

  const finance = world.organizationsById[team.organizationId]
    ? getFinancialHealthSnapshot(world, team.organizationId, world.currentDate, `${world.currentDate.slice(0, 4)}-01-01` as GameDate)
    : undefined
  const financialPressure = finance === undefined || finance.byCurrency.length === 0 ? 'UNKNOWN' : finance.distressIndicators.some((indicator) => SEVERE_FINANCE_INDICATORS.has(indicator.kind)) ? 'HIGH' : finance.distressIndicators.length > 0 ? 'MODERATE' : 'LOW'
  if (financialPressure === 'HIGH' || financialPressure === 'MODERATE') reasons.push('FINANCIAL_STRESS')

  const candidateMode = selectMode({ averagePercentile, rosterAverageAge, expiringContractCount, financialPressure, boardPressure, governancePressure })
  const state = world.clubStrategicStatesByTeamId[teamId]
  const nextReviewOn = state === undefined ? null : addDays(state.lastReviewedOn, CLUB_STRATEGY_REVIEW_HORIZON_DAYS)
  return Object.freeze({
    teamId,
    acceptedMode: state?.mode ?? null,
    candidateMode,
    reasons: Object.freeze(reasons),
    competitivePressure,
    financialPressure,
    boardPressure,
    governancePressure,
    rosterAverageAge,
    expiringContractCount,
    lastReviewedOn: state?.lastReviewedOn ?? null,
    nextReviewOn,
    reviewEligible: state === undefined || world.currentDate >= nextReviewOn!,
  })
}

export function reviewClubStrategy(world: GameWorld, teamId: TeamId, options: ReviewClubStrategyOptions = {}): GameWorld {
  const team = world.teams[teamId]
  if (!team || team.coachId === undefined || team.coachId === world.userCoachId) return world
  const assessment = assessClubStrategy(world, teamId)
  const prior = world.clubStrategicStatesByTeamId[teamId]
  const trigger = options.trigger ?? 'SCHEDULED'
  const exceptional = trigger !== 'SCHEDULED'
  if (prior !== undefined && !exceptional && !assessment.reviewEligible) return world
  const state = acceptAssessment(world.currentDate, teamId, assessment, prior)
  return updateGameWorld(world, { clubStrategicStatesByTeamId: { ...world.clubStrategicStatesByTeamId, [teamId]: state } })
}

export function reviewAiClubStrategies(world: GameWorld, trigger: ClubStrategyReviewTrigger = 'PRESEASON'): GameWorld {
  const states = { ...world.clubStrategicStatesByTeamId }
  let changed = false
  for (const team of Object.values(world.teams).filter((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId).sort((a, b) => a.id.localeCompare(b.id))) {
    const prior = states[team.id]
    const assessment = assessClubStrategy(world, team.id)
    if (prior !== undefined && trigger === 'SCHEDULED' && !assessment.reviewEligible) continue
    states[team.id] = acceptAssessment(world.currentDate, team.id, assessment, prior)
    changed = true
  }
  return changed ? updateGameWorld(world, { clubStrategicStatesByTeamId: states }) : world
}

function acceptAssessment(date: GameDate, teamId: TeamId, assessment: ClubStrategicAssessment, prior: ClubStrategicState | undefined): ClubStrategicState {
  const unchanged = prior?.mode === assessment.candidateMode
  return createClubStrategicState({
    teamId,
    mode: assessment.candidateMode,
    horizon: strategicHorizon(assessment.candidateMode, assessment.rosterAverageAge),
    financialPosture: financialPosture(assessment.financialPressure),
    riskTolerance: riskTolerance(assessment.candidateMode, assessment.financialPressure),
    developmentEmphasis: developmentEmphasis(assessment.candidateMode, assessment.rosterAverageAge),
    retentionPosture: retentionPosture(assessment.candidateMode, assessment.reasons),
    acquisitionAggression: acquisitionAggression(assessment.candidateMode, assessment.financialPressure),
    sellingWillingness: sellingWillingness(assessment.candidateMode, assessment.reasons),
    establishedOn: unchanged ? prior.establishedOn : date,
    lastReviewedOn: date,
    transitionReason: unchanged ? prior.transitionReason : reasonForMode(assessment.candidateMode, assessment.reasons),
  })
}

function activeGovernanceObjectives(world: GameWorld, teamId: TeamId) {
  return Object.values(world.governanceObjectivesById).filter((objective) => {
    const period = world.governanceExpectationPeriodsById[objective.expectationPeriodId]
    const institution = period && world.governanceInstitutionsById[period.institutionId]
    return institution?.teamIds.includes(teamId) && objective.evaluationStartsOn <= world.currentDate && objective.evaluationEndsOn >= world.currentDate
  })
}

function selectMode(input: { averagePercentile: number | null; rosterAverageAge: number | null; expiringContractCount: number; financialPressure: ClubStrategicAssessment['financialPressure']; boardPressure: ClubStrategicAssessment['boardPressure']; governancePressure: ClubStrategicAssessment['governancePressure'] }): ClubStrategicMode {
  if (input.financialPressure === 'HIGH') return 'SURVIVE'
  if (input.averagePercentile !== null && input.averagePercentile <= 0.15) return 'CONTEND'
  if (input.averagePercentile !== null && input.averagePercentile >= 0.8 && input.rosterAverageAge !== null && input.rosterAverageAge <= 25) return input.boardPressure === 'HIGH' || input.governancePressure === 'HIGH' ? 'COMPETE' : 'DEVELOP'
  if (input.averagePercentile !== null && input.averagePercentile >= 0.8 && input.expiringContractCount >= 3 && input.rosterAverageAge !== null && input.rosterAverageAge >= 28) return 'SELL'
  if (input.averagePercentile !== null && input.averagePercentile >= 0.8 && input.rosterAverageAge !== null && input.rosterAverageAge >= 28) return 'REBUILD'
  if (input.averagePercentile === null && input.rosterAverageAge !== null && input.rosterAverageAge <= 25) return input.boardPressure === 'HIGH' || input.governancePressure === 'HIGH' ? 'COMPETE' : 'DEVELOP'
  return 'COMPETE'
}

function strategicHorizon(mode: ClubStrategicMode, age: number | null): ClubStrategicHorizon { return mode === 'CONTEND' || mode === 'SURVIVE' ? 'NOW' : mode === 'DEVELOP' || mode === 'REBUILD' || age !== null && age <= 25 ? 'LONG_TERM' : 'NEAR_TERM' }
function financialPosture(pressure: ClubStrategicAssessment['financialPressure']): ClubFinancialPosture { return pressure === 'HIGH' ? 'STRESSED' : pressure === 'MODERATE' ? 'CONSTRAINED' : pressure === 'LOW' ? 'HEALTHY' : 'UNKNOWN' }
function riskTolerance(mode: ClubStrategicMode, pressure: ClubStrategicAssessment['financialPressure']): ClubRiskTolerance { return pressure === 'HIGH' || mode === 'SURVIVE' ? 'LOW' : mode === 'CONTEND' && pressure !== 'MODERATE' ? 'HIGH' : 'MODERATE' }
function developmentEmphasis(mode: ClubStrategicMode, age: number | null): number { return mode === 'DEVELOP' ? 85 : mode === 'REBUILD' ? 65 : mode === 'CONTEND' ? 15 : age !== null && age <= 25 ? 65 : 40 }
function retentionPosture(mode: ClubStrategicMode, reasons: readonly ClubStrategicReason[]): ClubRetentionPosture { return mode === 'REBUILD' || mode === 'SELL' ? 'OPEN' : reasons.includes('TITLE_WINDOW') ? 'PROTECT_CORE' : 'SELECTIVE' }
function acquisitionAggression(mode: ClubStrategicMode, pressure: ClubStrategicAssessment['financialPressure']): ClubAcquisitionAggression { return pressure === 'HIGH' || pressure === 'MODERATE' || mode === 'SURVIVE' || mode === 'SELL' ? 'LOW' : mode === 'CONTEND' ? 'HIGH' : 'MODERATE' }
function sellingWillingness(mode: ClubStrategicMode, reasons: readonly ClubStrategicReason[]): ClubSellingWillingness { return mode === 'SELL' ? 'HIGH' : mode === 'REBUILD' || reasons.includes('CONTRACT_EXPIRY_CLUSTER') ? 'MODERATE' : 'LOW' }
function reasonForMode(mode: ClubStrategicMode, reasons: readonly ClubStrategicReason[]): ClubStrategicReason | 'INITIAL_ASSESSMENT' {
  const preferred: Readonly<Record<ClubStrategicMode, readonly ClubStrategicReason[]>> = {
    SURVIVE: ['FINANCIAL_STRESS'],
    CONTEND: ['TITLE_WINDOW'],
    DEVELOP: ['YOUNG_CORE'],
    SELL: ['CONTRACT_EXPIRY_CLUSTER'],
    REBUILD: ['AGING_CORE'],
    COMPETE: ['GOVERNANCE_PRESSURE', 'BOARD_PRESSURE', 'OVERPERFORMING', 'UNDERPERFORMING', 'STRONG_FUTURE_POSITION'],
  }
  return preferred[mode].find((reason) => reasons.includes(reason)) ?? reasons[0] ?? 'INITIAL_ASSESSMENT'
}
