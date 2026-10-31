import { addDays, compareGameDates } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { gameIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import {
  getCompetition,
  getSeason,
  type GameWorld,
} from '@/domain/world'
import type { SchedulePolicy } from './SchedulePolicy'
import { scheduleRoundsByCalendar } from './SchedulePolicy'
import { deriveCompetitionSeasonWindows, requireCompetitionFormatVariant } from '../WorldCompetitionCalendar'
import { instantiateWorldCompetitionRoundRobinV1 } from '../WorldCompetitionRoundRobin'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'
import { generateBalancedMatrixRounds } from './MatrixScheduleGenerator'

const DEFAULT_DAYS_BETWEEN_ROUNDS = 4

export interface GenerateRoundRobinScheduleOptions {
  readonly world: GameWorld
  readonly seasonId: SeasonId
  readonly daysBetweenRounds?: number
  readonly schedulePolicy?: SchedulePolicy
  readonly startDate?: import('@/domain/date').GameDate
  readonly competitionStageKey?: string
}

interface Matchup {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
}

/** Generates a deterministic home-and-away round robin without mutating the world. */
export function generateRoundRobinSchedule(options: GenerateRoundRobinScheduleOptions): Game[] {
  if (options.daysBetweenRounds !== undefined) validateDaysBetweenRounds(options.daysBetweenRounds)
  if (options.daysBetweenRounds !== undefined && options.schedulePolicy !== undefined) {
    throw new RangeError('Specify either a schedule policy or a round interval, not both')
  }

  const season = getSeason(options.world, options.seasonId)
  const competition = getCompetition(options.world, season.competitionId)
  const teamIds = season.participantTeamIds ?? competition.participantTeamIds
  validateParticipants(teamIds, season.worldCompetitionFormat !== undefined)

  const variant = season.worldCompetitionFormat && requireCompetitionFormatVariant(season.worldCompetitionFormat)
  const regular = variant?.nodes.find(node => node.role === 'REGULAR_SEASON')
  const groups = regular && resolveWorldCompetitionGroups(regular, teamIds)
  const matrixTarget = regular?.pairing?.type === 'FIXED_SCHEDULE'
    && regular.pairing.payload.bdm_generated_matrix_v1 === true
    && regular.opponentScope?.type === 'SCHEDULE_MATRIX'
    ? regular.pairing.payload.games_per_team : undefined
  if (regular?.pairing?.type === 'FIXED_SCHEDULE' && matrixTarget === undefined) {
    throw new Error('Official fixed schedule requires a source-specific scheduler; do not generate a round robin')
  }
  if (matrixTarget !== undefined && (typeof matrixTarget !== 'number' || !Number.isInteger(matrixTarget))) {
    throw new Error('Generated matrix requires an integer games_per_team')
  }
  const rounds = matrixTarget !== undefined
    ? generateBalancedMatrixRounds(teamIds, matrixTarget)
    : groups && groups.length > 1
    ? groupedRounds(season.worldCompetitionFormat!, groups, regular!.key)
    : teamIds.length % 2 === 0 && (competition.rules.schedule.meetingsPerPair % 2 === 0 || !season.worldCompetitionFormat)
    ? (() => {
      const firstLegRounds = createFirstLegRounds(teamIds, competition.rules.schedule.meetingsPerPair % 2 === 1)
      return Array.from({ length: competition.rules.schedule.meetingsPerPair }, (_, legIndex) => legIndex % 2 === 0 ? firstLegRounds : firstLegRounds.map(invertRound)).flat()
    })()
    : createRoundsWithByes(teamIds, season.worldCompetitionFormat!, competition.rules.schedule.meetingsPerPair, options.competitionStageKey)
  const startDate = options.startDate ?? season.startDate
  const seasonWindows = deriveCompetitionSeasonWindows(startDate, season.endDate, season.worldCompetitionFormat, season.calendarPolicy)
  const schedulePolicy = options.schedulePolicy ?? (options.daysBetweenRounds === undefined && (season.worldCompetitionFormat !== undefined || season.calendarPolicy !== undefined) ? scheduleRoundsByCalendar : undefined)
  const roundDates = schedulePolicy === undefined
    ? rounds.map((_, roundIndex) => addDays(startDate, roundIndex * (options.daysBetweenRounds ?? DEFAULT_DAYS_BETWEEN_ROUNDS)))
    : schedulePolicy(rounds.length, startDate, seasonWindows.regularSeasonEnd, season.calendarPolicy)

  if (roundDates.length !== rounds.length || new Set(roundDates).size !== roundDates.length) {
    throw new RangeError('Schedule policy must provide one distinct date per round')
  }

  if (roundDates.some((date) => compareGameDates(date, startDate) < 0 || compareGameDates(date, seasonWindows.regularSeasonEnd) > 0)) {
    throw new RangeError(`Schedule for Season ${season.id} does not fit within its date range`)
  }

  let gameSequence = 1
  return rounds.flatMap((round, roundIndex) => {
    const date = roundDates[roundIndex]!

    return round.map((matchup) =>
      createGame({
        id: gameIdFromString(`schedule-${season.id}-game-${formatSequence(gameSequence++)}`),
        seasonId: season.id,
        competitionId: competition.id,
        date,
        homeTeamId: matchup.homeTeamId,
        awayTeamId: matchup.awayTeamId,
        ...(options.competitionStageKey === undefined ? {} : { competitionStageKey: options.competitionStageKey }),
        status: 'scheduled',
        result: null,
      }),
    )
  })
}

function groupedRounds(format: NonNullable<ReturnType<typeof getSeason>['worldCompetitionFormat']>, groups: readonly (readonly TeamId[])[], stageKey: string): Matchup[][] {
  const variant = requireCompetitionFormatVariant(format)
  const regular = variant.nodes.find(node => node.key === stageKey)!
  const rounds: Matchup[][] = []
  for (const participants of groups) {
    const scoped = { ...format, variants: [{ ...variant, nodes: [{ ...regular, teamCount: participants.length, opponentScope: { type: 'ALL_STAGE' as const, payload: {} } }] }] }
    const plan = instantiateWorldCompetitionRoundRobinV1(scoped, variant.key, stageKey, participants.map(id => ({ competitionSeasonEntryId: id })))
    const byId = new Map(participants.map(id => [String(id), id]))
    for (const fixture of plan.fixtures) {
      (rounds[fixture.roundNo - 1] ??= []).push({ homeTeamId: byId.get(fixture.homeEntryId)!, awayTeamId: byId.get(fixture.awayEntryId)! })
    }
  }
  return rounds
}

/** Reuses the format engine's bye-aware pairing plan for a verified odd-sized stage. */
function createRoundsWithByes(teamIds: readonly TeamId[], format: NonNullable<ReturnType<typeof getSeason>['worldCompetitionFormat']>, meetings: number, stageKey?: string): Matchup[][] {
  const variant = requireCompetitionFormatVariant(format)
  const node = stageKey === undefined ? variant.nodes.find(candidate => candidate.role === 'REGULAR_SEASON') : variant.nodes.find(candidate => candidate.key === stageKey)
  if (node === undefined) throw new Error('Odd round robin requires an explicit regular-season node')
  if (node.pairing?.meetingsPerPair !== meetings) throw new Error('Odd round robin meetings differ from the competition contract')
  const plan = instantiateWorldCompetitionRoundRobinV1(format, variant.key, node.key, teamIds.map(id => ({ competitionSeasonEntryId: id })))
  const byId = new Map(teamIds.map(id => [String(id), id]))
  const rounds: Matchup[][] = Array.from({ length: plan.roundsPerMeeting * plan.meetingsPerPair }, () => [])
  for (const fixture of plan.fixtures) rounds[fixture.roundNo - 1]!.push({ homeTeamId: byId.get(fixture.homeEntryId)!, awayTeamId: byId.get(fixture.awayEntryId)! })
  return rounds
}

function createFirstLegRounds(teamIds: readonly TeamId[], balanceSingleMeeting = false): Matchup[][] {
  const fixedTeam = teamIds[0]!
  const rotatingTeams = teamIds.slice(1)
  const rounds: Matchup[][] = []

  for (let roundIndex = 0; roundIndex < teamIds.length - 1; roundIndex += 1) {
    const arrangedTeams = [fixedTeam, ...rotatingTeams]
    const round: Matchup[] = []

    for (let pairIndex = 0; pairIndex < teamIds.length / 2; pairIndex += 1) {
      const left = arrangedTeams[pairIndex]!, right = arrangedTeams[arrangedTeams.length - 1 - pairIndex]!
      const size = teamIds.length + 1
      const reverse = balanceSingleMeeting && (teamIds.indexOf(right) - teamIds.indexOf(left) + size) % size > Math.floor(size / 2)
      round.push({ homeTeamId: reverse ? right : left, awayTeamId: reverse ? left : right })
    }
    rounds.push(round)

    rotatingTeams.unshift(rotatingTeams.pop()!)
  }

  return rounds
}

function invertRound(round: readonly Matchup[]): Matchup[] {
  return round.map((matchup) => ({
    homeTeamId: matchup.awayTeamId,
    awayTeamId: matchup.homeTeamId,
  }))
}

function validateDaysBetweenRounds(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('Days between rounds must be a positive integer')
  }
}

function validateParticipants(teamIds: readonly TeamId[], hasFormat: boolean): void {
  if (teamIds.length < 2) {
    throw new RangeError('Round robin schedules require at least two teams')
  }
  if (teamIds.length % 2 !== 0 && !hasFormat) {
    throw new RangeError('Odd round robin schedules require an explicit competition format')
  }
}

function formatSequence(value: number): string {
  return value.toString().padStart(4, '0')
}
