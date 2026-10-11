import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { completeMatch, prepareMatchOptions } from '@/app/game/playUserGame'
import { getUserTeam } from '@/engine/calendar'
import { simulateMatchWithRotations } from '@/engine/match'
import type { PlayerId } from '@/domain/ids'

const expectedSnapshots = [
  ['schedule-generated-season-0001-game-0002', 'd2aaf2d90e887c99c6e2b31d2fb8bd9dd6a871809be05eb2d30d7f83b1dbb9d3'],
  ['schedule-generated-season-0001-game-0003', '93e3276240eabdc49e759422f231b0d45ff551c30ca93d1b5970c6c2e8c7ed74'],
  ['schedule-generated-season-0001-game-0004', '16502bbe49e6f40722d7acb20400d0267ea1dcb9eb05cd4fc36ee1cb2be4a7f6'],
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
