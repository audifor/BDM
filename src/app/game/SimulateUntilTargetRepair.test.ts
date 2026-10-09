import { expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { releasePlayer } from '@/app/market/MarketService'
import { repairWorldAtLifecycleBoundary } from '@/app/repair'
import { advanceGameDay, simulateRemainingGamesToday } from './advanceGameDay'
import { createAcbTestGame } from './createAcbTestGame'
import { simulateUntilDate } from './simulateUntilDate'

it('repairs the target-date match using legal existing talent before drawing its seed', () => {
  let world = createAcbTestGame()
  const game = Object.values(world.games).find(item => world.teams[item.awayTeamId]!.coachId !== world.userCoachId)!
  const team = world.teams[game.awayTeamId]!
  world = updateGameWorld(world, { currentDate: game.date })
  for (const id of team.rosterPlayerIds.slice(5)) world = releasePlayer(world, team.id, id)
  const target = addDays(world.currentDate, 1)
  world = updateGameWorld(world, {
    games: Object.values(world.games).map(item => item.id === game.id ? { ...item, date: target } : item.date === world.currentDate ? { ...item, date: addDays(target, 3) } : item),
    injuries: [createInjury({ id: injuryIdFromString('injury:target-date-repair'), playerId: team.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'minor', injuredOn: world.currentDate, expectedReturnDate: addDays(target, 7) })],
    teamFinances: Object.values(world.teamFinancesByTeamId).map(item => item.teamId === team.id ? { ...item, playerSalaryBudget: 100_000_000 } : item),
  })
  const before = JSON.stringify(world)
  const morning = advanceGameDay(world, () => 15015)
  expect(getAvailablePlayersForCompetition(morning, team.id, game.competitionId, game.seasonId, target)).toHaveLength(4)
  const repaired = repairWorldAtLifecycleBoundary(morning, [game.homeTeamId, game.awayTeamId])
  const expected = simulateRemainingGamesToday(repaired.world, () => 15015)
  let draws = 0
  const result = simulateUntilDate(world, target, () => { draws++; return 15015 })
  expect(result.world).toEqual(expected)
  expect(result.finalDate).toBe(target)
  expect(result.daysAdvanced).toBe(1)
  expect(draws).toBe(1)
  expect(result.world.games[game.id]!.status).toBe('completed')
  expect(getAvailablePlayersForCompetition(result.world, team.id, game.competitionId, game.seasonId, target)).toHaveLength(5)
  expect(Object.keys(result.world.players)).toEqual(Object.keys(world.players))
  expect(JSON.stringify(world)).toBe(before)
}, 30_000)
