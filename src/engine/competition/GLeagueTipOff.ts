import { addDays } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { gameIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import type { FinalStandingLine } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'
import { generateBalancedMatrixRounds } from './schedule/MatrixScheduleGenerator'

export function gleagueTipOffNode(world: GameWorld, seasonId: SeasonId) {
  return world.seasons[seasonId]?.worldCompetitionFormat?.variants[0]?.nodes.find(
    node => node.key === 'TIP_OFF_TOURNAMENT' && node.pairing?.payload.bdm_gleague_tipoff_v1 === true,
  )
}

/** A separate, 14-match-per-club regional tournament, not part of the 36-game standings. */
export function generateGLeagueTipOffGames(world: GameWorld, seasonId: SeasonId): Game[] {
  const season = world.seasons[seasonId]
  if (!season) throw new Error('Missing Tip-Off source season')
  const node = gleagueTipOffNode(world, seasonId)
  if (!node) return []
  const all = season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds
  const groups = resolveWorldCompetitionGroups(node, all)
  if (groups.map(group => group.length).join(',') !== '8,8,8,7') throw new Error('Tip-Off must preserve the official 8-8-8-7 regional topology')
  const rounds: Array<Array<{ homeTeamId: TeamId; awayTeamId: TeamId }>> = []
  for (const group of groups) {
    for (const [roundIndex, fixtures] of generateBalancedMatrixRounds(group, 14).entries()) {
      (rounds[roundIndex] ??= []).push(...fixtures)
    }
  }
  if (rounds.length !== 21) throw new Error('31-team Tip-Off requires exactly 21 generated regional matchdays')
  return rounds.flatMap((fixtures, round) => fixtures.map((match, matchIndex) => createGame({
    id: gameIdFromString(`gleague-tipoff:${seasonId}:r${round + 1}:m${matchIndex + 1}`),
    seasonId, competitionId: season.competitionId,
    date: addDays(season.startDate, round * 2),
    homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
    competitionStageKey: node.key,
    status: 'scheduled', result: null,
    stakes: 'regular',
  })))
}

export function calculateGLeagueTipOffStandings(world: GameWorld, seasonId: SeasonId): readonly (readonly FinalStandingLine[])[] {
  const node = gleagueTipOffNode(world, seasonId)
  if (!node) return []
  const season = world.seasons[seasonId]!
  const groups = resolveWorldCompetitionGroups(node, season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds)
  const games = Object.values(world.games).filter(g => g.seasonId === seasonId && g.competitionStageKey === node.key && g.status === 'completed')
  return groups.map(ids => {
    const byTeam = new Map(ids.map(id => [id, { teamId: id, position: 0, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 }]))
    for (const game of games) {
      const home = byTeam.get(game.homeTeamId), away = byTeam.get(game.awayTeamId)
      if (!home || !away) continue
      home.played++; away.played++
      home.pointsFor += game.result.homeScore; home.pointsAgainst += game.result.awayScore
      away.pointsFor += game.result.awayScore; away.pointsAgainst += game.result.homeScore
      if (game.result.homeScore > game.result.awayScore) { home.wins++; away.losses++ } else { away.wins++; home.losses++ }
    }
    return [...byTeam.values()].map(row => ({ ...row, pointDifference: row.pointsFor - row.pointsAgainst }))
      .sort((a, b) => b.wins - a.wins || b.pointDifference - a.pointDifference || a.teamId.localeCompare(b.teamId))
      .map((row, index) => ({ ...row, position: index + 1 }))
  })
}

/** Applies source-specified Tip-Off fixture accounting. Never read by regular-season tables. */
export function addGLeagueTipOffToWorld(world: GameWorld, seasonId: SeasonId): GameWorld {
  const added = generateGLeagueTipOffGames(world, seasonId)
  if (!added.length) return world
  if (added.some(game => world.games[game.id])) throw new Error('Tip-Off games already generated')
  return updateGameWorld(world, { games: [...Object.values(world.games), ...added] })
}
