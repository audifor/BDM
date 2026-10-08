import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'

it('continues the certification match seed sequence through a Save V4 boundary', async () => {
  const start = createNewGame({ seed: 15015 })
  const coachId = Object.keys(start.coachEmploymentByCoachId).find(id => start.coachEmploymentByCoachId[id as keyof typeof start.coachEmploymentByCoachId]?.status === 'unemployed') as GameWorld['userCoachId']
  const gameDates = [...new Set(Object.values(start.games).map(game => game.date))].sort()
  const firstGameDate = gameDates[0]!
  const world = updateGameWorld(start, { currentDate: firstGameDate, userCoachId: coachId })
  const targetDate = addDays(gameDates[1]!, 1)
  const continuous = await runTalentLongHorizonCertification({ world, targetDate, seed: 15015 })
  const first = await runTalentLongHorizonCertification({ world, targetDate: addDays(world.currentDate, 1), seed: 15015 })
  const seedDraws = Object.values(first.world.games).filter(game => game.status === 'completed').length
  expect(seedDraws).toBeGreaterThan(0)
  expect(Object.values(continuous.world.games).filter(game => game.status === 'completed').length).toBeGreaterThan(seedDraws)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(first.world, `${first.world.currentDate}T00:00:00.000Z`))
  const resumed = await runTalentLongHorizonCertification({ world: restored, targetDate, seed: 15015, initialSeedDraws: seedDraws })
  expect(resumed.world.currentDate).toBe(targetDate)
  expect(resumed.world.games).toEqual(continuous.world.games)
  expect(resumed.world.matchStatLogsByGameId).toEqual(continuous.world.matchStatLogsByGameId)
  expect(Object.keys(resumed.world.players).sort()).toEqual(Object.keys(continuous.world.players).sort())
  for (const player of Object.values(continuous.world.players)) {
    expect(resumed.world.players[player.id]!.personId).toBe(player.personId)
  }
}, 60_000)
