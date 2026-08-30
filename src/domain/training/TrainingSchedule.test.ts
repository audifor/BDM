import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createScheduledTrainingSession, findCollidingSession, timeToMinutes } from './TrainingSchedule'

const teamId = teamIdFromString('team-1')
const playerId = playerIdFromString('player-1')
const date = parseGameDate('2026-08-19')

describe('TrainingSchedule', () => {
  it('creates a valid team session', () => {
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    expect(session.status).toBe('scheduled')
  })

  it('rejects invalid times, durations and scope/player mismatches', () => {
    expect(() => createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '25:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })).toThrow(RangeError)
    expect(() => createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 0, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })).toThrow(RangeError)
    expect(() => createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', definitionId: 'threePoint', intensity: 'normal' })).toThrow(RangeError)
    expect(() => createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', playerId, definitionId: 'threePoint', intensity: 'normal' })).toThrow(RangeError)
    expect(() => createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'not-real', intensity: 'normal' })).toThrow(RangeError)
  })

  it('computes time-to-minutes', () => {
    expect(timeToMinutes('09:30')).toBe(570)
    expect(() => timeToMinutes('9:30')).toThrow(RangeError)
  })

  it('rejects overlapping team sessions for the same team', () => {
    const first = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    expect(findCollidingSession(second, [first])).toBe(first)
  })

  it('accepts non-overlapping team sessions for the same team', () => {
    const first = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    expect(findCollidingSession(second, [first])).toBeUndefined()
  })

  it('rejects overlapping individual sessions for the same player', () => {
    const first = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date, startTime: '09:30', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'midRange', intensity: 'normal' })
    expect(findCollidingSession(second, [first])).toBe(first)
  })

  it('allows overlapping individual sessions for different players', () => {
    const otherPlayerId = playerIdFromString('player-2')
    const first = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: otherPlayerId, definitionId: 'midRange', intensity: 'normal' })
    expect(findCollidingSession(second, [first])).toBeUndefined()
  })

  it('does not collide across different dates', () => {
    const first = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date: parseGameDate('2026-08-20'), startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    expect(findCollidingSession(second, [first])).toBeUndefined()
  })
})
