import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { completeMatch, prepareMatchOptions } from '@/app/game/playUserGame'
import { getUserTeam } from '@/engine/calendar'
import { simulateMatchWithRotations } from '@/engine/match'
import type { PlayerId } from '@/domain/ids'

/**
 * Snapshots of the canonical integrated engine. The previous values were captured on the BS15 branch (a20ea256) before it was
 * integrated with main's Match Next engine (first divergent commits 7a2eea34 / ee38b928 / fcb0eaec): they described the replaced
 * engine, not the canonical one. Re-captured on the integrated candidate; two consecutive runs produced identical hashes.
 */
const expectedSnapshots = [
  ['schedule-generated-season-0001-game-0002', '0de0c12d7f797532b846ecdce9d6ba8f9aa992ca4f05ef2a0fdf4ff6150ee23a'],
  ['schedule-generated-season-0001-game-0003', 'b36c00f26a4f7e6784dbdfb53330a554b137196bb82dd2a87e2f21bb8ff52027'],
  ['schedule-generated-season-0001-game-0004', '347be2cd8a067ac74209523bcbf7e2786212b8ae32297ea4fe73f2cab43fa1bd'],
]

it('capture representative canonical match snapshots', () => {
  let world = createNewGame({ seed: 15015 })
  const userTeamId = getUserTeam(world)?.id
  const games = Object.values(world.games).filter(game => game.status === 'scheduled' && game.homeTeamId !== userTeamId && game.awayTeamId !== userTeamId).sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id))).slice(0, 3)
  const snapshots = []
  for (let index = 0; index < games.length; index += 1) {
    const game = games[index]!
    const simulation = simulateMatchWithRotations(prepareMatchOptions(world, game, undefined, 15015 + index))
    world = completeMatch(world, simulation)
    const participants = new Set([...simulation.squads.home, ...simulation.squads.away])
    snapshots.push({
      gameId: game.id,
      result: simulation.finalScore,
      lineups: simulation.lineups,
      substitutions: simulation.events.filter(event => event.type === 'substitution'),
      stats: world.matchStatLogsByGameId[game.id],
      fatigue: Object.fromEntries(Object.entries(world.careerFatigueByPlayerId).filter(([id]) => participants.has(id as PlayerId))),
      injuries: Object.values(world.injuriesById).filter(injury => participants.has(injury.playerId)),
      season: world.seasons[game.seasonId],
      completedGames: Object.values(world.games).filter(candidate => candidate.seasonId === game.seasonId && candidate.status === 'completed').map(candidate => [candidate.id, candidate.result]),
    })
  }
  expect(snapshots.map(snapshot => [snapshot.gameId, createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')])).toEqual(expectedSnapshots)
})
