import { calculateSeasonStandings } from '@/domain/season'
import type { FinalStandingLine } from '@/domain/season'
import type { CompetitionId } from '@/domain/ids'
import type { ConferenceId, SeasonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

export type StandingsEntry = FinalStandingLine

/** Compatibility boundary: standings remain an Engine-facing projection. */
export function calculateStandings(world: GameWorld, seasonId: SeasonId): StandingsEntry[] {
  return calculateSeasonStandings(world, seasonId)
}

export function calculateStandingsForCompetition(world: GameWorld, competitionId: CompetitionId): StandingsEntry[] {
  const seasons = Object.values(world.seasons).filter((season) => season.competitionId === competitionId).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))
  const season = seasons[0]
  if (season === undefined) throw new Error(`Competition has no Season: ${competitionId}`)
  return calculateStandings(world, season.id)
}

/** Conference record deliberately includes only explicitly classified conference games. */
export function calculateConferenceStandings(world: GameWorld, seasonId: SeasonId, conferenceId: ConferenceId): StandingsEntry[] {
  const season = world.seasons[seasonId]; if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  const participants = (season.conferenceMembershipSnapshot ?? world.conferenceMemberships).filter((membership) => membership.seasonId === seasonId && membership.conferenceId === conferenceId).map((membership) => membership.teamId)
  const byTeam = Object.fromEntries(participants.map((teamId) => [teamId, { teamId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }])) as Record<TeamId, { teamId: TeamId; played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number }>
  for (const game of Object.values(world.games)) { if (game.seasonId !== seasonId || game.status !== 'completed' || game.classification !== 'conference' || byTeam[game.homeTeamId] === undefined || byTeam[game.awayTeamId] === undefined) continue; const home = byTeam[game.homeTeamId]!; const away = byTeam[game.awayTeamId]!; home.played++; away.played++; home.pointsFor += game.result.homeScore; home.pointsAgainst += game.result.awayScore; away.pointsFor += game.result.awayScore; away.pointsAgainst += game.result.homeScore; if (game.result.homeScore > game.result.awayScore) { home.wins++; away.losses++ } else { away.wins++; home.losses++ } }
  const rules = world.competitions[season.competitionId]!.rules.standings.tiebreakers
  return Object.values(byTeam).map((entry) => ({ ...entry, position: 0, pointDifference: entry.pointsFor - entry.pointsAgainst })).sort((a, b) => { for (const key of rules) { const comparison = key === 'teamId' ? a.teamId.localeCompare(b.teamId) : b[key] - a[key]; if (comparison !== 0) return comparison } return 0 }).map((entry, index) => ({ ...entry, position: index + 1 }))
}

export function getConferenceRegularSeasonChampion(world: GameWorld, seasonId: SeasonId, conferenceId: ConferenceId): TeamId | undefined {
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId && game.classification === 'conference'); if (games.some((game) => game.status !== 'completed')) return undefined
  return calculateConferenceStandings(world, seasonId, conferenceId)[0]?.teamId
}
