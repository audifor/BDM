import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'

describe('runTalentLongHorizonCertification', () => {
  it('uses canonical day resolution with deterministic seeds, optional V4 reload, and checkpoint integrity', async () => {
    const initial = useAiWorld(createNewGame({ seed: 15015 }))
    // The women's initial enrollments start one week after the men's season.
    // Audit current membership only after both initial seasons have opened.
    const world = simulateUntilDate(initial, addDays(initial.currentDate, 7), () => 15015).world
    expect(world.currentDate).toBe(addDays(initial.currentDate, 7))
    const target = addDays(world.currentDate, 1)
    const progress: string[] = []
    const result = await runTalentLongHorizonCertification({
      world,
      targetDate: target,
      seed: 15015,
      checkpointDates: [target],
      saveReloadDates: [target],
      deepIntegrityDates: [target],
      maximumRuntimeMs: 30_000,
      onProgress: (checkpoint) => progress.push(checkpoint.date),
    })

    expect(result.world.currentDate).toBe(target)
    expect(result.timedOutAt).toBeUndefined()
    expect(result.checkpoints).toHaveLength(1)
    expect(result.checkpoints[0]?.saveBytes).toBeGreaterThan(0)
    expect(result.checkpoints[0]?.loadMs).toBeGreaterThanOrEqual(0)
    expect(progress).toEqual([target])
  }, 30_000)
})

function useAiWorld(world: GameWorld): GameWorld {
  const coachId = Object.keys(world.coachEmploymentByCoachId).find((id) => world.coachEmploymentByCoachId[id as keyof typeof world.coachEmploymentByCoachId]?.status === 'unemployed')
  if (coachId === undefined) throw new Error('Certification fixture has no unemployed Coach')
  return updateGameWorld(world, { userCoachId: coachId as GameWorld['userCoachId'] })
}
