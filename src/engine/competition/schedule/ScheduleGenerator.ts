import { addDays, compareGameDates } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { gameIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import {
  getCompetition,
  getSeason,
  type GameWorld,
} from '@/domain/world'

const DEFAULT_DAYS_BETWEEN_ROUNDS = 4

export interface GenerateRoundRobinScheduleOptions {
  readonly world: GameWorld
  readonly seasonId: SeasonId
  readonly daysBetweenRounds?: number
  readonly startDate?: import('@/domain/date').GameDate
}

interface Matchup {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
}

/** Generates a deterministic home-and-away round robin without mutating the world. */
export function generateRoundRobinSchedule(options: GenerateRoundRobinScheduleOptions): Game[] {
  const daysBetweenRounds = options.daysBetweenRounds ?? DEFAULT_DAYS_BETWEEN_ROUNDS
  validateDaysBetweenRounds(daysBetweenRounds)

  const season = getSeason(options.world, options.seasonId)
  const competition = getCompetition(options.world, season.competitionId)
  const teamIds = competition.participantTeamIds
  validateParticipants(teamIds)

  const firstLegRounds = createFirstLegRounds(teamIds)
  const rounds = Array.from({ length: competition.rules.schedule.meetingsPerPair }, (_, legIndex) => legIndex % 2 === 0 ? firstLegRounds : firstLegRounds.map(invertRound)).flat()
  const startDate = options.startDate ?? season.startDate
  const lastRoundDate = addDays(startDate, (rounds.length - 1) * daysBetweenRounds)

  if (compareGameDates(lastRoundDate, season.endDate) > 0) {
    throw new RangeError(`Schedule for Season ${season.id} does not fit within its date range`)
  }

  let gameSequence = 1
  return rounds.flatMap((round, roundIndex) => {
    const date = addDays(startDate, roundIndex * daysBetweenRounds)

    return round.map((matchup) =>
      createGame({
        id: gameIdFromString(`schedule-${season.id}-game-${formatSequence(gameSequence++)}`),
        seasonId: season.id,
        competitionId: competition.id,
        date,
        homeTeamId: matchup.homeTeamId,
        awayTeamId: matchup.awayTeamId,
        status: 'scheduled',
        result: null,
      }),
    )
  })
}

function createFirstLegRounds(teamIds: readonly TeamId[]): Matchup[][] {
  const fixedTeam = teamIds[0]!
  const rotatingTeams = teamIds.slice(1)
  const rounds: Matchup[][] = []

  for (let roundIndex = 0; roundIndex < teamIds.length - 1; roundIndex += 1) {
    const arrangedTeams = [fixedTeam, ...rotatingTeams]
    const round: Matchup[] = []

    for (let pairIndex = 0; pairIndex < teamIds.length / 2; pairIndex += 1) {
      round.push({
        homeTeamId: arrangedTeams[pairIndex]!,
        awayTeamId: arrangedTeams[arrangedTeams.length - 1 - pairIndex]!,
      })
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

function validateParticipants(teamIds: readonly TeamId[]): void {
  if (teamIds.length < 2) {
    throw new RangeError('Round robin schedules require at least two teams')
  }
  if (teamIds.length % 2 !== 0) {
    throw new RangeError('Round robin schedules require an even number of teams')
  }
}

function formatSequence(value: number): string {
  return value.toString().padStart(4, '0')
}
