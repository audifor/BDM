import { expect, it } from 'vitest'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { parseGameDate } from '@/domain/date'
import { SeededRandomSource } from '@/engine/random'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { getTeamFinancialSnapshot } from '@/domain/world'
import { readLargeSaveV4File } from './LargeSaveV4File'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'

it('replays the actual Y9 rookie activation boundary without publishing an unfunded roster', () => {
  if (process.env.BS15I_ROOKIE_BOUNDARY_REPLAY !== '1') return
  const world = deserializeGameWorldV4(readLargeSaveV4File('C:/Temp/BS15I-y9-before-roster-boundary-save-v4.json'))
  expect(world.currentDate).toBe('2041-09-30')
  const seed = new SeededRandomSource(15015)
  for (const game of Object.values(world.games)) if (game.status === 'completed') seed.nextInt(0, 0xffff_ffff)
  const guard = createLongHorizonMutationGuard(world)
  const result = simulateUntilDate(world, parseGameDate('2041-10-01'), () => seed.nextInt(0, 0xffff_ffff), { onDayAdvance: day => { expect(day.status).not.toBe('FAILED'); guard(day.world) } })
  expect(result.world.currentDate).toBe('2041-10-01')
  const team = result.world.teams['generated-team-0010' as never]!
  expect(team.rosterPlayerIds.length).toBeGreaterThanOrEqual(5)
  expect(getTeamFinancialSnapshot(result.world, team.id).remainingPlayerSalaryBudget).toBeGreaterThanOrEqual(0)
  const deferred = Object.values(result.world.playerRightsById).find(item => item.playerId === 'player:talent:annual-talent:2032:generated-country-0001:male:000233')!
  expect(deferred.status).toBe('active'); expect(deferred.contractId).toBeUndefined()
  process.stdout.write(`[BS15I Y9 repaired boundary] ${JSON.stringify({ date: result.world.currentDate, teamId: team.id, roster: team.rosterPlayerIds.length, finances: getTeamFinancialSnapshot(result.world,team.id), deferredRights: deferred.id })}\n`)
}, 180_000)
