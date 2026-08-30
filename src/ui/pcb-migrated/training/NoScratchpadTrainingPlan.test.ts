import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { scheduleTrainingSession } from '@/engine/training'
import { createScheduledTrainingSession } from '@/domain/training'

describe('Training PCB no longer has a UI-only planner authority', () => {
  it('the old TrainingMigrationRepository and TrainingVisualMock scratchpad modules no longer exist', () => {
    const dir = join(__dirname)
    expect(existsSync(join(dir, 'TrainingMigrationRepository.ts'))).toBe(false)
    expect(existsSync(join(dir, 'TrainingVisualMock.ts'))).toBe(false)
  })

  it('scheduling a colliding team session is rejected by domain/engine logic, not merely a disabled UI control', () => {
    const world = createNewGame()
    const teamId = getUserTeam(world)!.id
    const first = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(world, first)
    const colliding = createScheduledTrainingSession({ id: 's2', teamId, date: world.currentDate, startTime: '09:30', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    expect(() => scheduleTrainingSession(scheduled, colliding)).toThrow(RangeError)
  })
})
