import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { validateGameWorld } from '@/domain/world'

it.skipIf(process.env.BDM_UNIVERSE_AUDIT !== '1')('the certified 30-day checkpoint retains stats, fatigue, injuries and unique global identities in every league', () => {
  const raw = readFileSync('.worlddb-v2/universe-05/day-30.json', 'utf8')
  const world = deserializeGameWorldSaveV4(JSON.parse(raw))
  validateGameWorld(world)
  expect(Object.keys(world.competitions)).toHaveLength(4)
  const rosters = Object.values(world.teams).flatMap(team => team.rosterPlayerIds)
  expect(new Set(rosters).size).toBe(rosters.length)
  const people = Object.values(world.players).map(player => player.personId)
  expect(new Set(people).size).toBe(people.length)
  const leagues = Object.values(world.competitions).map(competition => {
    const ids = new Set(competition.participantTeamIds.flatMap(id => world.teams[id]!.rosterPlayerIds))
    const games = Object.values(world.games).filter(game => game.competitionId === competition.id && game.status === 'completed')
    const fatigued = [...ids].filter(id => world.careerFatigueByPlayerId[id]! > 0).length
    const injuries = Object.values(world.injuriesById).filter(injury => ids.has(injury.playerId)).length
    expect(fatigued).toBeGreaterThan(0)
    expect(injuries).toBeGreaterThan(0)
    expect(games.length).toBeGreaterThan(0)
    expect(games.every(game => world.matchStatLogsByGameId[game.id]?.resolution === 'FAST')).toBe(true)
    return { competitionId: competition.id, clubs: competition.participantTeamIds.length, players: ids.size, completed: games.length, fatigued, injuries }
  })
  const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-27T12:00:00Z'))))
  expect(projectPersistentWorldTruth(restored)).toEqual(projectPersistentWorldTruth(world))
  expect(restored.worldDbCompetitionRuntime).toEqual(world.worldDbCompetitionRuntime)
  writeFileSync('.worlddb-v2/universe-05/day-30-audit.json', JSON.stringify({ passed: true, date: world.currentDate, saveSha256: createHash('sha256').update(raw).digest('hex'), leagues }, null, 2))
}, 120_000)
