import type { TeamId, SeasonId } from '@/domain/ids'
import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'

/**
 * NCAA's 2027 simulated conference and national brackets are separate
 * competitions but are NOT new student academic years.
 *
 * Return undefined for every ordinary competition, null for an incomplete
 * NCAA postseason, the winner only after its ENTIRE bracket is played.
 * This guards the GameWorld season-history lifecycle against intermediate
 * fully completed rounds being mistaken for a complete championship.
 */
export function ncaa2027TournamentWinner(world: GameWorld, seasonId: SeasonId): TeamId | null | undefined {
  const season = world.seasons[seasonId]
  if (!season) return undefined
  const id = String(season.competitionId)
  const conference = /^competition:USA:ncaa-d1-(men|women):2027:conference-tournament:/.test(id)
  const national = /^competition:USA:ncaa-d1-(men|women):2027:national-championship$/.test(id)
  if (!conference && !national) return undefined
  const games = Object.values(world.games).filter(game => game.seasonId === seasonId)
  const entrants = season.participantTeamIds ?? []
  const required = national ? 75 : entrants.length - 1
  if (required < 1 || (national && entrants.length !== 76) || games.length !== required
    || games.some(game => game.status !== 'completed')) return null
  const final = games.filter(game => game.competitionStageKey === (national ? 'FINAL' : 'CONF_FINAL'))
  if (final.length !== 1 || final[0]!.status !== 'completed') return null
  const game: Game = final[0]!
  if (!game.result || game.result.homeScore === game.result.awayScore) return null
  const champion = game.result.homeScore > game.result.awayScore ? game.homeTeamId : game.awayTeamId
  return entrants.includes(champion) ? champion : null
}

export function isNcaa2027TournamentSeason(world: GameWorld, seasonId: SeasonId): boolean {
  return ncaa2027TournamentWinner(world, seasonId) !== undefined
}
