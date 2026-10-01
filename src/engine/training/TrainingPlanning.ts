import { addDays, type GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { isPlayerAvailable, type GameWorld } from '@/domain/world'
import { getTeamRoster } from '@/domain/world'
import { isStaffWeeklyCheckpoint, resolveDelegatedResponsibility } from '@/engine/staff'
import { automaticTeamTrainingDefinitionId } from './AutomaticTeamTraining'
import { dailyScheduledLoad } from './ScheduledTrainingEngine'
import { assignTrainingModuleToPlayer, scheduleTeamModuleSession } from './TrainingModuleEngine'
import { recommendTrainingParticipation } from './TrainingParticipation'
import { hashStringToSeed } from '@/engine/random'
import { trainingDefinitionById, type TrainingIntensity } from '@/domain/training'

const PLANNING_HORIZON_DAYS = 7
const HIGH_FATIGUE = 70
const VERY_HIGH_FATIGUE = 85
const MODERATE_FATIGUE = 50

export type TrainingFatigueBand = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
export type TrainingPlanningWarningCode =
  | 'MATCH_TODAY'
  | 'MATCH_TOMORROW'
  | 'DENSE_FIXTURE_WINDOW'
  | 'HIGH_PLAYER_FATIGUE'
  | 'HIGH_SCHEDULED_LOAD'
  | 'MATCH_TRAINING_CONFLICT'

export interface TrainingPlanningContext {
  readonly teamId: TeamId
  readonly asOfDate: GameDate
  readonly fixtureDensity: {
    readonly gameToday: boolean
    readonly gameTomorrow: boolean
    readonly gameYesterday: boolean
    readonly gamesNext7Days: number
    readonly gamesRecent7Days: number
    readonly daysUntilNextGame?: number
    readonly daysSincePreviousGame?: number
    readonly restDaysBetweenUpcomingGames: readonly number[]
    readonly isDense: boolean
  }
  readonly fatigue: {
    readonly rosterCount: number
    readonly unavailableCount: number
    readonly average: number
    readonly highCount: number
    readonly veryHighCount: number
    readonly band: TrainingFatigueBand
  }
  readonly scheduledSessionsNext7Days: number
  readonly scheduledLoadNext7Days: number
  readonly matchConflictCount: number
  readonly recommendedModuleId?: string
  readonly recommendedIntensity?: TrainingIntensity
  readonly recommendation: 'REST' | 'RECOVERY' | 'LIGHT' | 'PLAN'
  readonly reasons: readonly TrainingPlanningWarningCode[]
  readonly warnings: readonly TrainingPlanningWarningCode[]
  readonly plannerStaffId?: import('@/domain/ids').StaffPersonId
}

export interface AiTrainingTeamDecision {
  readonly teamId: TeamId
  readonly action: 'SCHEDULED' | 'NO_CHANGE'
  readonly reason: string
  readonly sessionIds: readonly string[]
  readonly delegatedStaffId?: import('@/domain/ids').StaffPersonId
}

export interface AiTrainingPlanningResult {
  readonly world: GameWorld
  readonly decisions: readonly AiTrainingTeamDecision[]
}

/** Pure fixture, fatigue, and scheduled-session context used by both the planner and NG Training UI. */
export function buildTrainingPlanningContext(world: GameWorld, teamId: TeamId, asOfDate: GameDate = world.currentDate): TrainingPlanningContext {
  const team = world.teams[teamId]
  const plan = world.trainingPlansByTeamId[teamId]
  if (team === undefined || plan === undefined) throw new RangeError(`Unknown team training plan: ${teamId}`)

  const games = Object.values(world.games).filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
  const today = games.some((game) => game.date === asOfDate)
  const tomorrow = addDays(asOfDate, 1)
  const yesterday = addDays(asOfDate, -1)
  const nextSevenEnd = addDays(asOfDate, PLANNING_HORIZON_DAYS)
  const recentStart = addDays(asOfDate, -PLANNING_HORIZON_DAYS)
  const scheduledGames = games.filter((game) => game.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const completedGames = games.filter((game) => game.status === 'completed')
  const upcoming = scheduledGames.filter((game) => game.date > asOfDate && game.date <= nextSevenEnd)
  const recent = completedGames.filter((game) => game.date < asOfDate && game.date >= recentStart)
  const nextGame = scheduledGames.find((game) => game.date >= asOfDate)
  const previousGame = completedGames.filter((game) => game.date < asOfDate).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))[0]
  const restDaysBetweenUpcomingGames = upcoming.slice(1).map((game, index) => daysBetween(upcoming[index]!.date, game.date) - 1)
  const gamesRecent7Days = recent.length
  const gamesNext7Days = upcoming.length
  const isDense = gamesNext7Days >= 2 || gamesNext7Days + gamesRecent7Days >= 3

  const roster = getTeamRoster(world, teamId)
  const fatigueValues = roster.map((player) => world.careerFatigueByPlayerId[player.id] ?? 0)
  const average = fatigueValues.length === 0 ? 0 : fatigueValues.reduce((sum, value) => sum + value, 0) / fatigueValues.length
  const highCount = fatigueValues.filter((value) => value >= HIGH_FATIGUE).length
  const veryHighCount = fatigueValues.filter((value) => value >= VERY_HIGH_FATIGUE).length
  const band: TrainingFatigueBand = average >= 80 || veryHighCount > 0 ? 'VERY_HIGH' : average >= HIGH_FATIGUE ? 'HIGH' : average >= 35 || highCount > 0 ? 'MODERATE' : 'LOW'

  const horizonDates = Array.from({ length: PLANNING_HORIZON_DAYS }, (_, index) => addDays(asOfDate, index + 1))
  const pendingSessions = Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === teamId && session.status === 'scheduled')
  const sessionsInHorizon = pendingSessions.filter((session) => horizonDates.includes(session.date))
  const matchConflictCount = pendingSessions.filter((session) => games.some((game) => game.date === session.date)).length
  const scheduledLoadNext7Days = horizonDates.reduce((sum, date) => sum + dailyScheduledLoad(world, teamId, date), 0)

  const reasons: TrainingPlanningWarningCode[] = []
  if (today) reasons.push('MATCH_TODAY')
  if (scheduledGames.some((game) => game.date === tomorrow)) reasons.push('MATCH_TOMORROW')
  if (isDense) reasons.push('DENSE_FIXTURE_WINDOW')
  if (highCount > 0) reasons.push('HIGH_PLAYER_FATIGUE')
  if (horizonDates.some((date) => dailyScheduledLoad(world, teamId, date) >= 80)) reasons.push('HIGH_SCHEDULED_LOAD')
  if (matchConflictCount > 0) reasons.push('MATCH_TRAINING_CONFLICT')

  const recoveryBias = average >= HIGH_FATIGUE || veryHighCount > 0 || (games.some((game) => game.status === 'completed' && game.date === yesterday) && average >= MODERATE_FATIGUE)
  let recommendation: TrainingPlanningContext['recommendation']
  let recommendedModuleId: string | undefined
  let recommendedIntensity: TrainingIntensity | undefined
  if (today) {
    recommendation = 'REST'
  } else if (recoveryBias || isDense) {
    recommendation = 'RECOVERY'
    recommendedModuleId = average >= HIGH_FATIGUE || veryHighCount > 0 ? 'lowLoadRecovery' : 'activeRecovery'
    recommendedIntensity = 'light'
  } else {
    const planModuleId = automaticTeamTrainingDefinitionId(plan.focus)
    const definition = trainingDefinitionById(planModuleId)
    const reduced = average >= MODERATE_FATIGUE || highCount > 0 || (scheduledGames.some((game) => game.date === tomorrow) && definition.category === 'physical')
    recommendation = reduced ? 'LIGHT' : 'PLAN'
    recommendedModuleId = planModuleId
    recommendedIntensity = reduced ? 'light' : plan.intensity
  }

  const delegation = resolveDelegatedResponsibility(world, teamId, 'createTeamTrainingPlan')
  return {
    teamId,
    asOfDate,
    fixtureDensity: {
      gameToday: today,
      gameTomorrow: scheduledGames.some((game) => game.date === tomorrow),
      gameYesterday: completedGames.some((game) => game.date === yesterday),
      gamesNext7Days,
      gamesRecent7Days,
      ...(nextGame === undefined ? {} : { daysUntilNextGame: daysBetween(asOfDate, nextGame.date) }),
      ...(previousGame === undefined ? {} : { daysSincePreviousGame: daysBetween(previousGame.date, asOfDate) }),
      restDaysBetweenUpcomingGames,
      isDense,
    },
    fatigue: {
      rosterCount: roster.length,
      unavailableCount: roster.filter((player) => !isPlayerAvailable(world, player.id, asOfDate)).length,
      average,
      highCount,
      veryHighCount,
      band,
    },
    scheduledSessionsNext7Days: sessionsInHorizon.length,
    scheduledLoadNext7Days,
    matchConflictCount,
    ...(recommendedModuleId === undefined ? {} : { recommendedModuleId }),
    ...(recommendedIntensity === undefined ? {} : { recommendedIntensity }),
    recommendation,
    reasons,
    warnings: reasons,
    ...(delegation === undefined ? {} : { plannerStaffId: delegation.staffId }),
  }
}

/** Weekly deterministic AI planner; it creates only ordinary scheduled team sessions. */
export function progressAiTrainingPlanning(world: GameWorld): AiTrainingPlanningResult {
  if (!isStaffWeeklyCheckpoint(world.currentDate)) return { world, decisions: [] }

  const userTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
  let next = world
  const decisions: AiTrainingTeamDecision[] = []
  for (const team of Object.values(world.teams).sort((a, b) => a.id.localeCompare(b.id))) {
    if (team.id === userTeamId) continue
    const context = buildTrainingPlanningContext(next, team.id)
    const weekStart = addDays(next.currentDate, 1)
    const weekEnd = addDays(next.currentDate, PLANNING_HORIZON_DAYS)
    const alreadyPlannedThisHorizon = Object.values(next.scheduledTrainingSessionsById).some((session) =>
      session.teamId === team.id && session.status === 'scheduled' && session.id.startsWith(`ai-training:${team.id}:`) && session.date >= weekStart && session.date <= weekEnd,
    )
    if (alreadyPlannedThisHorizon) {
      decisions.push({ teamId: team.id, action: 'NO_CHANGE', reason: 'Existing AI week plan preserved; no re-planning.', sessionIds: [] })
      continue
    }
    const plan = next.trainingPlansByTeamId[team.id]!
    const severeFatigue = context.fatigue.average >= HIGH_FATIGUE || context.fatigue.veryHighCount > 0
    const loadNeedsRecovery = context.fatigue.average >= MODERATE_FATIGUE || context.fatigue.highCount > 0
    const recoveryDueToRecentGame = context.fixtureDensity.gameYesterday && loadNeedsRecovery
    const targetSessions = severeFatigue ? 2 : context.fixtureDensity.isDense || loadNeedsRecovery ? 1 : 3
    const sessionsToAdd = Math.max(0, targetSessions - context.scheduledSessionsNext7Days)
    const candidates = eligibleTrainingDates(next, team.id)
    const selected: GameDate[] = []
    for (const date of candidates) {
      if (selected.length >= sessionsToAdd) break
      if (selected.length > 0 && daysBetween(selected[selected.length - 1]!, date) < 2) continue
      selected.push(date)
    }

    const resolvedStaff = resolveDelegatedResponsibility(next, team.id, 'createTeamTrainingPlan')
    const employment = resolvedStaff === undefined ? undefined : next.staffEmploymentByStaffId[resolvedStaff.staffId]
    const staff = employment?.status === 'employed' && employment.teamId === team.id ? resolvedStaff : undefined
    const sessionIds: string[] = []
    for (const date of selected) {
      const dayAfterGame = Object.values(next.games).some((game) => game.status === 'completed' && game.date === addDays(date, -1) && (game.homeTeamId === team.id || game.awayTeamId === team.id))
      const recovery = severeFatigue || context.fixtureDensity.isDense || context.fatigue.highCount > 0 || (dayAfterGame && context.fatigue.average >= MODERATE_FATIGUE)
      const moduleId = recovery
        ? severeFatigue ? 'lowLoadRecovery' : 'activeRecovery'
        : aiTrainingModuleId(team.id, plan.focus)
      const definition = trainingDefinitionById(moduleId)
      const reducedIntensity = severeFatigue || context.fatigue.average >= MODERATE_FATIGUE || context.fatigue.highCount > 0
      const intensity: TrainingIntensity = recovery || reducedIntensity ? 'light' : plan.intensity
      const sessionId = `ai-training:${team.id}:${date}`
      next = scheduleTeamModuleSession(next, {
        teamId: team.id,
        moduleId,
        date,
        startTime: '09:00',
        durationMinutes: definition.durationMinutes,
        sessionId,
        intensity,
        participationByPlayerId: Object.fromEntries(getTeamRoster(next, team.id).map((player) => [player.id, recommendTrainingParticipation(next, team.id, player.id, date)])),
        ...(staff === undefined ? {} : { assignedStaffPersonIds: [staff.staffId] }),
      })
      sessionIds.push(sessionId)
    }
    if (sessionIds.length > 0 && !context.fixtureDensity.isDense && context.fatigue.band === 'LOW' && context.fatigue.unavailableCount === 0) {
      const individualDate = candidates.find((date) => !selected.includes(date) && selected.every((teamDate) => Math.abs(daysBetween(teamDate, date)) >= 2))
      const moduleId = individualDevelopmentModuleId(team.id, plan.focus)
      const definition = trainingDefinitionById(moduleId)
      const targetRatings = definition.effects.targetRatings
      const player = getTeamRoster(next, team.id)
        .filter((candidate) => definition.eligiblePositions === undefined || definition.eligiblePositions.includes(candidate.basketball.primaryPosition))
        .sort((left, right) => developmentNeed(left, targetRatings) - developmentNeed(right, targetRatings) || left.id.localeCompare(right.id))[0]
      if (individualDate !== undefined && player !== undefined) {
        const sessionId = `ai-training-individual:${team.id}:${individualDate}:${player.id}`
        next = assignTrainingModuleToPlayer(next, { teamId: team.id, playerId: player.id, moduleId, date: individualDate, startTime: '11:00', sessionId })
        sessionIds.push(sessionId)
      }
    }
    decisions.push({
      teamId: team.id,
      action: sessionIds.length === 0 ? 'NO_CHANGE' : 'SCHEDULED',
      reason: sessionIds.length === 0 ? noSessionReason(context) : reasonForPlan(context, severeFatigue),
      sessionIds,
      ...(staff === undefined ? {} : { delegatedStaffId: staff.staffId }),
    })
  }
  return { world: next, decisions }
}

/** Balanced plans vary by stable team identity while explicit team focus remains authoritative. */
function aiTrainingModuleId(teamId: TeamId, focus: import('@/domain/training').TrainingFocus): string {
  if (focus !== 'balanced') return automaticTeamTrainingDefinitionId(focus)
  const options = ['teamCohesion', 'threePoint', 'conditioning', 'defensiveSystem', 'passing'] as const
  return options[hashStringToSeed(`ai-training-focus-v1:${teamId}`) % options.length]!
}

function individualDevelopmentModuleId(teamId: TeamId, focus: import('@/domain/training').TrainingFocus): string {
  if (focus !== 'balanced') return automaticTeamTrainingDefinitionId(focus)
  const options = ['threePoint', 'rimFinishing', 'defensiveAwareness', 'passing', 'conditioning'] as const
  return options[hashStringToSeed(`ai-training-development-v1:${teamId}`) % options.length]!
}

function developmentNeed(player: import('@/domain/player').Player, targetRatings: readonly import('@/domain/player').CanonicalRatingKey[]): number {
  return targetRatings.length === 0 ? Number.POSITIVE_INFINITY : targetRatings.reduce((total, key) => total + player.basketball.ratings[key], 0) / targetRatings.length
}

function eligibleTrainingDates(world: GameWorld, teamId: TeamId): readonly GameDate[] {
  const games = Object.values(world.games).filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
  const pendingDates = new Set(Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === teamId && session.status === 'scheduled').map((session) => session.date))
  return Array.from({ length: PLANNING_HORIZON_DAYS }, (_, index) => addDays(world.currentDate, index + 1))
    .filter((date) => !games.some((game) => game.date === date))
    .filter((date) => !games.some((game) => game.status === 'scheduled' && game.date === addDays(date, 1)))
    .filter((date) => !pendingDates.has(date))
}

function noSessionReason(context: TrainingPlanningContext): string {
  if (context.scheduledSessionsNext7Days > 0) return 'Existing scheduled sessions preserved; no additions required.'
  if (context.fixtureDensity.gamesNext7Days > 0 && context.fixtureDensity.gamesNext7Days >= PLANNING_HORIZON_DAYS) return 'No non-match planning dates available.'
  return 'No eligible unscheduled date in the planning horizon.'
}

function reasonForPlan(context: TrainingPlanningContext, severeFatigue: boolean): string {
  if (severeFatigue) return 'High Career Fatigue; recovery sessions selected.'
  if (context.fixtureDensity.isDense) return 'Dense fixture window; weekly load reduced and recovery selected.'
  if (context.fixtureDensity.gameYesterday && context.fatigue.average >= MODERATE_FATIGUE) return 'Recent game and moderate load; recovery favored.'
  if (context.fatigue.highCount > 0) return 'Player Career Fatigue distribution; session intensity reduced.'
  return 'Open planning window; team plan focus and intensity used.'
}

function daysBetween(from: GameDate, to: GameDate): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)
}
