import type { SeasonId, TeamId } from '@/domain/ids'
import { getCompetition, getSeason, type GameWorld } from '@/domain/world'

export interface StandingsEntry {
  readonly position: number
  readonly teamId: TeamId
  readonly played: number
  readonly wins: number
  readonly losses: number
  readonly pointsFor: number
  readonly pointsAgainst: number
  readonly pointDifference: number
}

interface StandingAccumulator {
  readonly teamId: TeamId
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
}

/** Derives a season table from completed Game results without changing GameWorld. */
export function calculateStandings(world: GameWorld, seasonId: SeasonId): StandingsEntry[] {
  const season = getSeason(world, seasonId)
  const competition = getCompetition(world, season.competitionId)
  const accumulators = initializeAccumulators(competition.participantTeamIds)

  for (const game of Object.values(world.games)) {
    if (
      game.seasonId !== season.id ||
      game.competitionId !== competition.id ||
      game.status !== 'completed'
    ) {
      continue
    }

    const home = accumulators[game.homeTeamId]!
    const away = accumulators[game.awayTeamId]!
    const { homeScore, awayScore } = game.result

    home.played += 1
    home.pointsFor += homeScore
    home.pointsAgainst += awayScore
    away.played += 1
    away.pointsFor += awayScore
    away.pointsAgainst += homeScore

    if (homeScore > awayScore) {
      home.wins += 1
      away.losses += 1
    } else {
      away.wins += 1
      home.losses += 1
    }
  }

  return Object.values(accumulators)
    .map((entry) => ({
      ...entry,
      position: 0,
      pointDifference: entry.pointsFor - entry.pointsAgainst,
    }))
    .sort(compareEntries)
    .map((entry, index) => ({ ...entry, position: index + 1 }))
}

function initializeAccumulators(teamIds: readonly TeamId[]): Record<TeamId, StandingAccumulator> {
  const accumulators = Object.create(null) as Record<TeamId, StandingAccumulator>

  for (const teamId of teamIds) {
    accumulators[teamId] = {
      teamId,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    }
  }

  return accumulators
}

function compareEntries(a: StandingsEntry, b: StandingsEntry): number {
  return (
    b.wins - a.wins ||
    b.pointDifference - a.pointDifference ||
    b.pointsFor - a.pointsFor ||
    compareTeamIds(a.teamId, b.teamId)
  )
}

function compareTeamIds(a: TeamId, b: TeamId): number {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}
