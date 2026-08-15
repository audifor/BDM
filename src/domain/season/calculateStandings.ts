import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { FinalStandingLine } from './SeasonHistory'

/** Pure domain projection of completed game results for one season. */
export function calculateSeasonStandings(world: GameWorld, seasonId: keyof GameWorld['seasons']): FinalStandingLine[] {
  const season = world.seasons[seasonId]
  if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  const competition = world.competitions[season.competitionId]!
  const entries = competition.participantTeamIds.map((teamId) => ({ teamId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }))
  const byTeam = Object.fromEntries(entries.map((entry) => [entry.teamId, entry])) as Record<TeamId, typeof entries[number]>
  for (const game of Object.values(world.games)) {
    if (game.seasonId !== seasonId || game.status !== 'completed') continue
    const home = byTeam[game.homeTeamId]!; const away = byTeam[game.awayTeamId]!; const result = game.result
    home.played += 1; away.played += 1; home.pointsFor += result.homeScore; home.pointsAgainst += result.awayScore; away.pointsFor += result.awayScore; away.pointsAgainst += result.homeScore
    if (result.homeScore > result.awayScore) { home.wins += 1; away.losses += 1 } else { away.wins += 1; home.losses += 1 }
  }
  return entries.map((entry) => ({ ...entry, position: 0, pointDifference: entry.pointsFor - entry.pointsAgainst }))
    .sort((a, b) => compareStandingEntries(a, b, competition.rules.standings.tiebreakers))
    .map((entry, index) => ({ ...entry, position: index + 1 }))
}

function compareStandingEntries(a: { readonly teamId: TeamId; readonly wins: number; readonly pointDifference: number; readonly pointsFor: number }, b: { readonly teamId: TeamId; readonly wins: number; readonly pointDifference: number; readonly pointsFor: number }, tiebreakers: readonly import('@/domain/competition').StandingsTiebreaker[]): number {
  for (const tiebreaker of tiebreakers) {
    const comparison = tiebreaker === 'teamId' ? a.teamId.localeCompare(b.teamId) : b[tiebreaker] - a[tiebreaker]
    if (comparison !== 0) return comparison
  }
  return 0
}
